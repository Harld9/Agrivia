const { WebSocketServer, WebSocket } = require("ws");
const http = require("http");

const PORT = process.env.WS_PORT || 3000;

let currentState = null;
const history = []; // 20 dernières entrées (plus récent en premier)
let gatewaySocket = null;
const frontendClients = new Set();

// ============================
// HELPERS
// ============================

function sendToGateway(data) {
  if (gatewaySocket && gatewaySocket.readyState === WebSocket.OPEN) {
    gatewaySocket.send(JSON.stringify(data));
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

// Transforme sensor_data (format ESP32) → format frontend
function transformSensorData(data) {
  const p = data.payload;
  return {
    sensors: {
      temperature: p.temperature,
      air_humidity: p.humidity_air,
      soil_humidity: p.humidity_soil,
      light_level: p.luminosity,
    },
    timestamp: data.timestamp,
    esp_id: data.esp_id,
  };
}

// Transforme actuator_state (format ESP32) → format frontend
function transformActuatorState(data) {
  const a = data.actuators;
  return {
    actuators: {
      pump: { state: a.pump?.active || false },
      fan: { state: a.fan?.active || false },
      grow_light: {
        state: a.led?.active || false,
        intensity: a.led?.intensity_pct || 0,
      },
    },
  };
}

// ============================
// HTTP SERVER
// ============================

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Historique des 20 dernières mesures
  if (req.method === "GET" && req.url === "/api/history") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(history));
    return;
  }

  // État courant
  if (req.method === "GET" && req.url === "/api/current") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(currentState));
    return;
  }

  // Commande manuelle vers un ESP32
  if (req.method === "POST" && req.url === "/command") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const cmd = JSON.parse(body);
        const sent = sendToGateway(cmd);
        if (sent) {
          console.log(`\n[COMMANDE MANUELLE] envoyée → ${cmd.esp_id}`);
          console.log(JSON.stringify(cmd, null, 2));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
        } else {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "error", message: "Gateway non connectée" }));
        }
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", message: "JSON invalide" }));
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
  console.log(`\n[Backend] Nouvelle connexion : ${req.socket.remoteAddress} (path: ${req.url})`);

  if (isGatewayPath) {
    // La gateway s'authentifiera via son premier message "auth"
  } else {
    // Client frontend
    frontendClients.add(ws);
    console.log(`[Backend] Frontend connecté (${frontendClients.size} client(s))`);

    // Envoyer l'état et l'historique actuels immédiatement
    if (currentState) {
      ws.send(JSON.stringify({ type: "update", data: currentState }));
    }
    if (history.length > 0) {
      ws.send(JSON.stringify({ type: "history", data: history }));
    }
  }

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw);

      // Authentification gateway
      if (data.type === "auth") {
        gatewaySocket = ws;
        frontendClients.delete(ws);
        console.log(`\n[AUTH] Gateway connectée — id: ${data.raspberry_id} | serre: ${data.serre_id}`);
        return;
      }

      // Messages en provenance de la gateway
      if (ws === gatewaySocket) {
        switch (data.type) {
          case "sensor_data": {
            const p = data.payload;
            console.log(
              `\n[CAPTEURS] ${data.esp_id} | ${data.timestamp}` +
              `\n  Température  : ${p.temperature}°C` +
              `\n  Humidité air : ${p.humidity_air}%` +
              `\n  Humidité sol : ${p.humidity_soil}%` +
              `\n  Luminosité   : ${p.luminosity} lux` +
              `\n  NPK          : N=${p.npk.nitrogen} P=${p.npk.phosphorus} K=${p.npk.potassium}`
            );
            const sensorUpdate = transformSensorData(data);
            currentState = { ...currentState, ...sensorUpdate };
            // Stocker dans l'historique (plus récent en tête)
            history.unshift({ ...currentState });
            if (history.length > 20) history.pop();
            broadcastToFrontend({ type: "update", data: currentState });
            break;
          }

          case "actuator_state": {
            console.log(`\n[ACTIONNEURS] ${data.esp_id} | source: ${data.source}`);
            for (const [name, state] of Object.entries(data.actuators)) {
              console.log(`  ${name}: ${state.active ? "ON" : "OFF"}`);
            }
            const actuatorUpdate = transformActuatorState(data);
            currentState = { ...currentState, ...actuatorUpdate };
            broadcastToFrontend({ type: "update", data: currentState });
            break;
          }

          case "heartbeat":
          case "device_status":
            console.log(`\n[HEARTBEAT] ${data.esp_id} | status: ${data.status} | uptime: ${data.uptime_s}s`);
            break;

          case "error":
            console.log(`\n[ERREUR] ${data.esp_id} | ${data.code} : ${data.message}`);
            break;

          default:
            console.log(`\n[RECU] type: ${data.type}`);
            console.log(JSON.stringify(data, null, 2));
        }
      }
    } catch (e) {
      console.log(`[Backend] Message non JSON : ${raw}`);
    }
  });

  ws.on("close", () => {
    if (ws === gatewaySocket) {
      gatewaySocket = null;
      console.log(`\n[Backend] Gateway déconnectée`);
    } else {
      frontendClients.delete(ws);
      console.log(`\n[Backend] Frontend déconnecté (${frontendClients.size} client(s))`);
    }
  });

  ws.on("error", (err) => {
    console.log(`[Backend] Erreur WebSocket : ${err.message}`);
  });
});

server.listen(PORT, () => {
  console.log(`[Backend] Serveur démarré sur le port ${PORT}`);
  console.log(`[Backend] WebSocket gateway : ws://localhost:${PORT}/ws`);
  console.log(`[Backend] WebSocket frontend : ws://localhost:${PORT}`);
  console.log(`[Backend] API historique : GET http://localhost:${PORT}/api/history`);
  console.log(`[Backend] Commandes : POST http://localhost:${PORT}/command`);
});
