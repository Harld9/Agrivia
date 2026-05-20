// Test d'intégration end-to-end — serveur réel sur port éphémère.
// Scénario : une gateway s'authentifie et envoie un sensor_data ;
// un client frontend reçoit la diffusion `update` ; les routes HTTP répondent.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { WebSocket } = require("ws");
const { createServer } = require("../server");

// Attend le prochain message d'un WebSocket (avec timeout de sécurité).
function nextMessage(ws, predicate = () => true, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMsg);
      reject(new Error("Timeout : aucun message correspondant reçu"));
    }, timeoutMs);
    function onMsg(raw) {
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return; }
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(parsed);
      }
    }
    ws.on("message", onMsg);
  });
}

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

test("end-to-end : gateway → broadcast frontend + routes HTTP", async (t) => {
  const app = createServer({ silent: true });
  const { port } = await app.start(0);
  t.after(() => app.stop());

  const base = `ws://127.0.0.1:${port}`;

  // 1) Connexion du client frontend (path ≠ /ws).
  const frontend = await open(base);

  // 2) Connexion de la gateway sur /ws + authentification.
  const gateway = await open(`${base}/ws`);
  gateway.send(JSON.stringify({
    type: "auth",
    raspberry_id: "rpi-1",
    serre_id: "serre-A",
  }));
  // Laisse le serveur traiter l'auth (enregistre la gateway).
  await new Promise((r) => setTimeout(r, 100));

  // 3) La gateway envoie un sensor_data (valeurs dans les normes → pas de
  //    commande autopilote) ; on attend la diffusion `update` côté frontend.
  const updatePromise = nextMessage(frontend, (m) => m.type === "update");
  gateway.send(JSON.stringify({
    type: "sensor_data",
    esp_id: "esp-1",
    serre_id: "serre-A",
    timestamp: "2026-05-20T12:00:00Z",
    payload: {
      temperature: 26,        // zone morte → aucune commande
      humidity_air: 55,
      humidity_soil: 40,
      luminosity: 600,
      npk: { nitrogen: 1, phosphorus: 2, potassium: 3 },
    },
  }));

  const update = await updatePromise;
  assert.equal(update.type, "update");
  assert.equal(update.data.sensors.temperature, 26);
  assert.equal(update.data.sensors.air_humidity, 55);
  assert.equal(update.data.sensors.soil_humidity, 40);
  assert.equal(update.data.esp_id, "esp-1");

  // 4) GET /api/current reflète le dernier état.
  const current = await httpGet(port, "/api/current");
  assert.equal(current.status, 200);
  const currentBody = JSON.parse(current.body);
  assert.equal(currentBody.sensors.temperature, 26);
  assert.equal(currentBody.serre_id, "serre-A");

  // 5) GET /api/history contient l'entrée diffusée.
  const history = await httpGet(port, "/api/history");
  assert.equal(history.status, 200);
  const historyBody = JSON.parse(history.body);
  assert.ok(Array.isArray(historyBody));
  assert.equal(historyBody.length, 1);
  assert.equal(historyBody[0].sensors.temperature, 26);

  // 6) GET /api/devices : l'ESP est enregistré et en ligne.
  const devices = await httpGet(port, "/api/devices");
  assert.equal(devices.status, 200);
  const devicesBody = JSON.parse(devices.body);
  assert.equal(devicesBody.length, 1);
  assert.equal(devicesBody[0].esp_id, "esp-1");
  assert.equal(devicesBody[0].status, "online");

  // 7) Température au-dessus du seuil → l'autopilote envoie un `ai_command`.
  const cmdPromise = nextMessage(gateway, (m) => m.type === "ai_command");
  gateway.send(JSON.stringify({
    type: "sensor_data",
    esp_id: "esp-1",
    serre_id: "serre-A",
    timestamp: "2026-05-20T12:01:00Z",
    payload: {
      temperature: 32,        // > temp_high → fan ON
      humidity_air: 55,
      humidity_soil: 40,
      luminosity: 600,
      npk: { nitrogen: 1, phosphorus: 2, potassium: 3 },
    },
  }));
  const cmd = await cmdPromise;
  assert.equal(cmd.source, "autopilot");
  assert.deepEqual(cmd.commands.fan, { state: true });

  // Fermeture propre des clients.
  frontend.close();
  gateway.close();
});
