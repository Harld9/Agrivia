const { WebSocketServer, WebSocket } = require("ws");
const http = require("http");

const PORT = process.env.PORT || process.env.WS_PORT || 3000;

let currentState = null;
const history = [];
const gateways = new Map();      // serre_id → WebSocket
const frontendClients = new Set();

// ── Registre des appareils ───────────────────────────────────────────────────
const devices = {}; // { [esp_id]: DeviceInfo }

function updateDevice(espId, patch) {
  devices[espId] = {
    ...(devices[espId] || { esp_id: espId, status: 'unknown' }),
    ...patch,
    last_seen: new Date().toISOString(),
    status: 'online',
  };
  broadcastToFrontend({ type: 'devices', data: Object.values(devices) });
}

// Marquer hors-ligne si pas de nouvelle depuis 90s
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, dev] of Object.entries(devices)) {
    if (dev.status === 'online' && now - new Date(dev.last_seen).getTime() > 90_000) {
      devices[id] = { ...devices[id], status: 'offline' };
      changed = true;
      console.log(`\n[MONITORING] ${id} → hors ligne (timeout 90s)`);
    }
  }
  if (changed) broadcastToFrontend({ type: 'devices', data: Object.values(devices) });
}, 15_000);

// ============================
// AUTOPILOT
// ============================

// Seuils (modifiables via POST /api/thresholds)
let thresholds = {
  temp_high:  28,   // °C → fan ON au-dessus
  temp_low:   24,   // °C → fan OFF en-dessous
  soil_low:   30,   // %  → pompe ON en-dessous
  soil_high:  60,   // %  → pompe OFF au-dessus
  light_low:  300,  // lux → LED ON en-dessous
  light_high: 800,  // lux → LED OFF au-dessus
};

let autopilotEnabled = true;

// État courant des actionneurs par ESP (évite les commandes redondantes)
const apActuatorsMap = {};   // esp_id → { fan, pump, led }
const lastAiContextMap = {}; // esp_id → aiContext

function getApActuators(espId) {
  if (!apActuatorsMap[espId]) apActuatorsMap[espId] = { fan: false, pump: false, led: false };
  return apActuatorsMap[espId];
}

function runAutopilot(sensors, espId, serreId) {
  if (!autopilotEnabled) return;

  const apActuators = getApActuators(espId);
  const desired  = { ...apActuators };
  const actions  = [];
  const reasons  = [];

  // ── Température → ventilateur (hystérésis 24–28°C) ──────────────────────
  if (sensors.temperature > thresholds.temp_high && !desired.fan) {
    desired.fan = true;
    actions.push("Ventilateur activé");
    reasons.push(`T° élevée (${sensors.temperature.toFixed(1)}°C > ${thresholds.temp_high}°C)`);
  } else if (sensors.temperature < thresholds.temp_low && desired.fan) {
    desired.fan = false;
    actions.push("Ventilateur éteint");
    reasons.push(`T° revenue à la normale (${sensors.temperature.toFixed(1)}°C)`);
  }

  // ── Humidité sol → pompe ─────────────────────────────────────────────────
  if (sensors.soil_humidity < thresholds.soil_low && !desired.pump) {
    desired.pump = true;
    actions.push("Pompe activée");
    reasons.push(`Sol trop sec (${sensors.soil_humidity.toFixed(1)}% < ${thresholds.soil_low}%)`);
  } else if (sensors.soil_humidity > thresholds.soil_high && desired.pump) {
    desired.pump = false;
    actions.push("Pompe éteinte");
    reasons.push(`Sol bien irrigué (${sensors.soil_humidity.toFixed(1)}%)`);
  }

  // ── Luminosité → LED ─────────────────────────────────────────────────────
  if (sensors.light_level < thresholds.light_low && !desired.led) {
    desired.led = true;
    actions.push("LED activée");
    reasons.push(`Luminosité faible (${sensors.light_level} lux < ${thresholds.light_low} lux)`);
  } else if (sensors.light_level > thresholds.light_high && desired.led) {
    desired.led = false;
    actions.push("LED éteinte");
    reasons.push(`Luminosité suffisante (${sensors.light_level} lux)`);
  }

  // ── Construire la commande (seulement les actionneurs qui changent) ───────
  const commands = {};
  if (desired.fan  !== apActuators.fan)  commands.fan  = { state: desired.fan };
  if (desired.pump !== apActuators.pump) commands.pump = { state: desired.pump };
  if (desired.led  !== apActuators.led)  commands.led  = { state: desired.led, intensity_pct: desired.led ? 80 : 0 };

  apActuatorsMap[espId] = desired;

  // ── Mise à jour du contexte IA ────────────────────────────────────────────
  const lastAiContext = lastAiContextMap[espId];
  const aiContext = {
    mode: "auto",
    last_action: actions.length > 0
      ? actions.join(", ")
      : (lastAiContext?.last_action || "Surveillance en cours"),
    reason: reasons.length > 0
      ? reasons.join(". ")
      : (lastAiContext?.reason || "Tous les paramètres sont dans les normes"),
    confidence: 0.95,
  };
  lastAiContextMap[espId] = aiContext;
  currentState  = { ...currentState, ai_context: aiContext };

  // ── Envoyer les commandes si besoin ───────────────────────────────────────
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
      console.log(`\n[AUTOPILOT] → ${espId}`);
      actions.forEach(a => console.log(`  ✓ ${a}`));
    } else {
      console.log(`\n[AUTOPILOT] Gateway non connectée — commandes non envoyées`);
    }
  }

  broadcastToFrontend({ type: "update", data: currentState });
}

// ============================
// HELPERS
// ============================

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

function transformSensorData(data) {
  const p = data.payload;
  return {
    sensors: {
      temperature:   p.temperature,
      air_humidity:  p.humidity_air,
      soil_humidity: p.humidity_soil,
      light_level:   p.luminosity,
    },
    timestamp: data.timestamp,
    esp_id:    data.esp_id,
    serre_id:  data.serre_id,
  };
}

function transformActuatorState(data) {
  const a = data.actuators;
  return {
    actuators: {
      pump:       { state: a.pump?.active || false },
      fan:        { state: a.fan?.active  || false },
      grow_light: {
        state:     a.led?.active        || false,
        intensity: a.led?.intensity_pct || 0,
      },
    },
  };
}

// ============================
// HTTP SERVER
// ============================

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

  // ── GET /api/history ──────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/api/history") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(history));
    return;
  }

  // ── GET /api/devices ─────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/api/devices") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(Object.values(devices)));
    return;
  }

  // ── GET /api/current ──────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/api/current") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(currentState));
    return;
  }

  // ── GET /api/serres ───────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/api/serres") {
    const serres = [...gateways.entries()].map(([serreId, ws]) => ({
      serre_id: serreId,
      status: ws.readyState === WebSocket.OPEN ? 'online' : 'offline',
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(serres));
    return;
  }

  // ── GET /api/autopilot ────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/api/autopilot") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ enabled: autopilotEnabled, thresholds }));
    return;
  }

  // ── POST /api/autopilot — activer / désactiver ────────────────────────────
  if (req.method === "POST" && req.url === "/api/autopilot") {
    readBody(body => {
      if (typeof body.enabled === "boolean") {
        autopilotEnabled = body.enabled;
        if (!autopilotEnabled) {
          // Réinitialiser le contexte IA en mode manuel
          currentState = {
            ...currentState,
            ai_context: { mode: "manual", last_action: "—", reason: "Pilotage manuel activé", confidence: 1 },
          };
          broadcastToFrontend({ type: "update", data: currentState });
        }
        console.log(`\n[AUTOPILOT] Mode : ${autopilotEnabled ? "AUTO" : "MANUEL"}`);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ enabled: autopilotEnabled }));
    });
    return;
  }

  // ── POST /api/thresholds — modifier les seuils ────────────────────────────
  if (req.method === "POST" && req.url === "/api/thresholds") {
    readBody(body => {
      thresholds = { ...thresholds, ...body };
      console.log("\n[SEUILS] Mis à jour :", thresholds);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ thresholds }));
    });
    return;
  }

  // ── POST /command — commande manuelle vers ESP32 ──────────────────────────
  if (req.method === "POST" && req.url === "/command") {
    readBody(cmd => {
      const sent = sendToGateway(cmd);
      if (sent) {
        console.log(`\n[COMMANDE MANUELLE] → ${cmd.esp_id}`);
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

// ============================
// WEBSOCKET SERVER
// ============================

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const isGatewayPath = req.url === "/ws";
  console.log(`\n[Backend] Connexion : ${req.socket.remoteAddress} (path: ${req.url})`);

  if (!isGatewayPath) {
    frontendClients.add(ws);
    console.log(`[Backend] Frontend connecté (${frontendClients.size} client(s))`);
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
        console.log(`\n[AUTH] Gateway connectée — rpi: ${data.raspberry_id} | serre: ${data.serre_id}`);
        return;
      }

      // Seules les gateways authentifiées peuvent envoyer des données
      if (![...gateways.values()].includes(ws)) return;

      switch (data.type) {
        case "sensor_data": {
          const p = data.payload;
          console.log(
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
          console.log(`\n[ACTIONNEURS] ${data.esp_id} | source: ${data.source}`);
          for (const [name, state] of Object.entries(data.actuators)) {
            console.log(`  ${name}: ${state.active ? "ON" : "OFF"}`);
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
          console.log(`\n[HEARTBEAT] ${data.esp_id} | ${data.status} | uptime: ${data.uptime_s}s`);
          updateDevice(data.esp_id, {
            serre_id:         data.serre_id,
            uptime_s:         data.uptime_s,
            wifi_rssi:        data.wifi_rssi,
            firmware_version: data.firmware_version,
          });
          break;

        case "error":
          console.log(`\n[ERREUR] ${data.esp_id} | ${data.code} : ${data.message}`);
          break;

        default:
          console.log(`\n[RECU] type inconnu: ${data.type}`);
      }
    } catch (e) {
      console.log(`[Backend] Message non JSON : ${raw}`);
    }
  });

  ws.on("close", () => {
    let disconnectedSerre = null;
    for (const [serreId, sock] of gateways.entries()) {
      if (sock === ws) { gateways.delete(serreId); disconnectedSerre = serreId; break; }
    }
    if (disconnectedSerre) {
      console.log(`\n[Backend] Gateway déconnectée — serre: ${disconnectedSerre}`);
    } else {
      frontendClients.delete(ws);
      console.log(`\n[Backend] Frontend déconnecté (${frontendClients.size} client(s))`);
    }
  });

  ws.on("error", err => console.log(`[Backend] Erreur WS : ${err.message}`));
});

server.listen(PORT, () => {
  console.log(`[Backend] Démarré sur le port ${PORT}`);
  console.log(`[Backend] WebSocket gateway  : ws://localhost:${PORT}/ws`);
  console.log(`[Backend] WebSocket frontend : ws://localhost:${PORT}`);
  console.log(`[Backend] Autopilote         : GET/POST http://localhost:${PORT}/api/autopilot`);
  console.log(`[Backend] Seuils             : POST http://localhost:${PORT}/api/thresholds`);
  console.log(`[Backend] Historique         : GET  http://localhost:${PORT}/api/history`);
});
