// Agrivia — fabrique du serveur API + WebSocket.
// Importer ce module n'ouvre AUCUN port : il faut appeler start(port).
const { WebSocketServer, WebSocket } = require("ws");
const http = require("http");

const { decideAutopilot, buildAiContext, DEFAULT_THRESHOLDS } = require("./lib/autopilot");
const { transformSensorData, transformActuatorState } = require("./lib/transforms");
const { createDeviceRegistry } = require("./lib/devices");

/**
 * Crée une instance complète du serveur Agrivia (HTTP + WebSocket).
 * Aucun port n'est ouvert tant que `start()` n'est pas appelé.
 *
 * @param {object} [opts]
 * @param {number} [opts.monitoringIntervalMs=15000] - fréquence de la vérif hors-ligne.
 * @param {number} [opts.deviceTimeoutMs=90000]      - délai d'inactivité avant hors-ligne.
 * @param {boolean} [opts.silent=false]              - désactive les logs console.
 */
function createServer(opts = {}) {
  const monitoringIntervalMs = opts.monitoringIntervalMs ?? 15_000;
  const deviceTimeoutMs = opts.deviceTimeoutMs ?? 90_000;
  const log = opts.silent ? () => {} : (...a) => console.log(...a);

  // ── État runtime ──────────────────────────────────────────────────────────
  let currentState = null;
  const history = [];
  const gateways = new Map();        // serre_id → WebSocket
  const frontendClients = new Set();
  const registry = createDeviceRegistry({ timeoutMs: deviceTimeoutMs });

  let thresholds = { ...DEFAULT_THRESHOLDS };
  let autopilotEnabled = true;
  const apActuatorsMap = {};   // esp_id → { fan, pump, led }
  const lastAiContextMap = {}; // esp_id → aiContext

  function getApActuators(espId) {
    if (!apActuatorsMap[espId]) apActuatorsMap[espId] = { fan: false, pump: false, led: false };
    return apActuatorsMap[espId];
  }

  // ── Helpers réseau ────────────────────────────────────────────────────────
  function sendToGateway(data) {
    const ws = gateways.get(data.serre_id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  function broadcastToFrontend(data) {
    const msg = JSON.stringify(data);
    for (const client of frontendClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  // Met à jour un appareil dans le registre et notifie les frontends.
  function updateDevice(espId, patch) {
    registry.updateDevice(espId, patch);
    broadcastToFrontend({ type: 'devices', data: registry.list() });
  }

  // ── Autopilote ────────────────────────────────────────────────────────────
  function runAutopilot(sensors, espId, serreId) {
    if (!autopilotEnabled) return;

    const apActuators = getApActuators(espId);
    const { desired, commands, actions, reasons } = decideAutopilot(sensors, apActuators, thresholds);

    apActuatorsMap[espId] = desired;

    const aiContext = buildAiContext(actions, reasons, lastAiContextMap[espId]);
    lastAiContextMap[espId] = aiContext;
    currentState = { ...currentState, ai_context: aiContext };

    if (Object.keys(commands).length > 0) {
      const cmd = {
        type:       "ai_command",
        esp_id:     espId,
        serre_id:   serreId,
        command_id: Date.now().toString(),
        source:     "autopilot",
        commands,
      };
      const sent = sendToGateway(cmd);
      if (sent) {
        log(`\n[AUTOPILOT] → ${espId}`);
        actions.forEach(a => log(`  ✓ ${a}`));
      } else {
        log(`\n[AUTOPILOT] Gateway non connectée — commandes non envoyées`);
      }
    }

    broadcastToFrontend({ type: "update", data: currentState });
  }

  // ── Monitoring : appareils hors-ligne ─────────────────────────────────────
  const monitorTimer = setInterval(() => {
    if (registry.markStale()) {
      broadcastToFrontend({ type: 'devices', data: registry.list() });
    }
  }, monitoringIntervalMs);
  // Ne maintient pas le process en vie juste pour le timer.
  if (typeof monitorTimer.unref === "function") monitorTimer.unref();

  // ── Serveur HTTP ──────────────────────────────────────────────────────────
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const readBody = (cb) => {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", () => { try { cb(JSON.parse(body)); } catch { res.writeHead(400); res.end(); } });
    };

    // ── GET /api/history ────────────────────────────────────────────────────
    if (req.method === "GET" && req.url === "/api/history") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(history));
      return;
    }

    // ── GET /api/devices ────────────────────────────────────────────────────
    if (req.method === "GET" && req.url === "/api/devices") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(registry.list()));
      return;
    }

    // ── GET /api/current ────────────────────────────────────────────────────
    if (req.method === "GET" && req.url === "/api/current") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(currentState));
      return;
    }

    // ── GET /api/serres ─────────────────────────────────────────────────────
    if (req.method === "GET" && req.url === "/api/serres") {
      const serres = [...gateways.entries()].map(([serreId, ws]) => ({
        serre_id: serreId,
        status: ws.readyState === WebSocket.OPEN ? 'online' : 'offline',
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(serres));
      return;
    }

    // ── GET /api/autopilot ──────────────────────────────────────────────────
    if (req.method === "GET" && req.url === "/api/autopilot") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ enabled: autopilotEnabled, thresholds }));
      return;
    }

    // ── POST /api/autopilot — activer / désactiver ──────────────────────────
    if (req.method === "POST" && req.url === "/api/autopilot") {
      readBody(body => {
        if (typeof body.enabled === "boolean") {
          autopilotEnabled = body.enabled;
          if (!autopilotEnabled) {
            currentState = {
              ...currentState,
              ai_context: { mode: "manual", last_action: "—", reason: "Pilotage manuel activé", confidence: 1 },
            };
            broadcastToFrontend({ type: "update", data: currentState });
          }
          log(`\n[AUTOPILOT] Mode : ${autopilotEnabled ? "AUTO" : "MANUEL"}`);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ enabled: autopilotEnabled }));
      });
      return;
    }

    // ── POST /api/thresholds — modifier les seuils ──────────────────────────
    if (req.method === "POST" && req.url === "/api/thresholds") {
      readBody(body => {
        thresholds = { ...thresholds, ...body };
        log("\n[SEUILS] Mis à jour :", thresholds);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ thresholds }));
      });
      return;
    }

    // ── POST /command — commande manuelle vers ESP32 ────────────────────────
    if (req.method === "POST" && req.url === "/command") {
      readBody(cmd => {
        const sent = sendToGateway(cmd);
        if (sent) {
          log(`\n[COMMANDE MANUELLE] → ${cmd.esp_id}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        } else {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "error", message: "Gateway non connectée" }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  // ── Serveur WebSocket ─────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    const isGatewayPath = req.url === "/ws";
    log(`\n[Backend] Connexion : ${req.socket.remoteAddress} (path: ${req.url})`);

    if (!isGatewayPath) {
      frontendClients.add(ws);
      log(`[Backend] Frontend connecté (${frontendClients.size} client(s))`);
      if (currentState) ws.send(JSON.stringify({ type: "update",  data: currentState }));
      if (history.length > 0) ws.send(JSON.stringify({ type: "history", data: history }));
    }

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw);

        if (data.type === "auth") {
          const existing = gateways.get(data.serre_id);
          if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
            existing.close();
          }
          gateways.set(data.serre_id, ws);
          frontendClients.delete(ws);
          log(`\n[AUTH] Gateway connectée — rpi: ${data.raspberry_id} | serre: ${data.serre_id}`);
          return;
        }

        // Seules les gateways authentifiées peuvent envoyer des données
        if (![...gateways.values()].includes(ws)) return;

        switch (data.type) {
          case "sensor_data": {
            const p = data.payload;
            log(
              `\n[CAPTEURS] ${data.esp_id}` +
              `\n  T°   : ${p.temperature}°C` +
              `\n  Air  : ${p.humidity_air}%` +
              `\n  Sol  : ${p.humidity_soil}%` +
              `\n  Lux  : ${p.luminosity}` +
              `\n  NPK  : N=${p.npk.nitrogen} P=${p.npk.phosphorus} K=${p.npk.potassium}`
            );
            const sensorUpdate = transformSensorData(data);
            currentState = { ...currentState, ...sensorUpdate };

            // Historique (plus récent en tête)
            history.unshift({ ...currentState });
            if (history.length > 20) history.pop();

            // Registre appareils
            updateDevice(data.esp_id, {
              serre_id: data.serre_id,
              sensors:  sensorUpdate.sensors,
              sensor_last_update: data.timestamp,
            });

            // Autopilote → décide des commandes selon les capteurs
            runAutopilot(currentState.sensors, data.esp_id, data.serre_id);
            break;
          }

          case "actuator_state": {
            log(`\n[ACTIONNEURS] ${data.esp_id} | source: ${data.source}`);
            for (const [name, state] of Object.entries(data.actuators)) {
              log(`  ${name}: ${state.active ? "ON" : "OFF"}`);
            }
            const actuatorUpdate = transformActuatorState(data);
            currentState = { ...currentState, ...actuatorUpdate };

            // Registre appareils
            updateDevice(data.esp_id, { actuators: actuatorUpdate.actuators });

            // Synchroniser l'état interne de l'autopilote par ESP
            if (data.source === "autopilot") {
              const a = data.actuators;
              apActuatorsMap[data.esp_id] = {
                fan:  a.fan?.active  || false,
                pump: a.pump?.active || false,
                led:  a.led?.active  || false,
              };
            }
            broadcastToFrontend({ type: "update", data: currentState });
            break;
          }

          case "heartbeat":
          case "device_status":
            log(`\n[HEARTBEAT] ${data.esp_id} | ${data.status} | uptime: ${data.uptime_s}s`);
            updateDevice(data.esp_id, {
              serre_id:         data.serre_id,
              uptime_s:         data.uptime_s,
              wifi_rssi:        data.wifi_rssi,
              firmware_version: data.firmware_version,
            });
            break;

          case "error":
            log(`\n[ERREUR] ${data.esp_id} | ${data.code} : ${data.message}`);
            break;

          default:
            log(`\n[RECU] type inconnu: ${data.type}`);
        }
      } catch (e) {
        log(`[Backend] Message non JSON : ${raw}`);
      }
    });

    ws.on("close", () => {
      let disconnectedSerre = null;
      for (const [serreId, sock] of gateways.entries()) {
        if (sock === ws) { gateways.delete(serreId); disconnectedSerre = serreId; break; }
      }
      if (disconnectedSerre) {
        log(`\n[Backend] Gateway déconnectée — serre: ${disconnectedSerre}`);
      } else {
        frontendClients.delete(ws);
        log(`\n[Backend] Frontend déconnecté (${frontendClients.size} client(s))`);
      }
    });

    ws.on("error", err => log(`[Backend] Erreur WS : ${err.message}`));
  });

  /**
   * Démarre l'écoute HTTP/WebSocket.
   * @param {number} [port=0] - 0 = port éphémère (utile pour les tests).
   * @returns {Promise<{server: http.Server, port: number}>}
   */
  function start(port = 0) {
    return new Promise((resolve) => {
      server.listen(port, () => {
        resolve({ server, port: server.address().port });
      });
    });
  }

  /** Arrête proprement le serveur (WebSocket + HTTP + timer monitoring). */
  function stop() {
    return new Promise((resolve) => {
      clearInterval(monitorTimer);
      for (const client of frontendClients) {
        try { client.terminate(); } catch { /* ignore */ }
      }
      for (const ws of gateways.values()) {
        try { ws.terminate(); } catch { /* ignore */ }
      }
      wss.close(() => {
        server.close(() => resolve());
      });
    });
  }

  return {
    server,
    wss,
    start,
    stop,
    // Exposé pour les tests / introspection :
    runAutopilot,
    sendToGateway,
    broadcastToFrontend,
    registry,
    getState: () => currentState,
    getHistory: () => history,
    getThresholds: () => thresholds,
    isAutopilotEnabled: () => autopilotEnabled,
  };
}

module.exports = { createServer };
