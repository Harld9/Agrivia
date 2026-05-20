// Tests — validation des commandes et du JSON (comportement HTTP).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createServer } = require("../server");

// Petit helper : requête HTTP renvoyant { status, body }.
function request(port, { method, path, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      { host: "127.0.0.1", port, method, path,
        headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {} },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Variante envoyant un corps brut (JSON invalide).
function requestRaw(port, { method, path, raw }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(raw) } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on("error", reject);
    req.write(raw);
    req.end();
  });
}

test("validation HTTP des commandes et du JSON", async (t) => {
  const app = createServer({ silent: true });
  const { port } = await app.start(0);
  t.after(() => app.stop());

  await t.test("POST /command avec JSON invalide → 400", async () => {
    const res = await requestRaw(port, { method: "POST", path: "/command", raw: "{not json" });
    assert.equal(res.status, 400);
  });

  await t.test("POST /api/thresholds avec JSON invalide → 400", async () => {
    const res = await requestRaw(port, { method: "POST", path: "/api/thresholds", raw: "<<<" });
    assert.equal(res.status, 400);
  });

  await t.test("POST /command sans gateway connectée → 503", async () => {
    const res = await request(port, {
      method: "POST", path: "/command",
      body: { esp_id: "esp-1", serre_id: "serre-inconnue", commands: {} },
    });
    assert.equal(res.status, 503);
    assert.equal(JSON.parse(res.body).status, "error");
  });

  await t.test("POST /api/thresholds JSON valide → 200 + seuils fusionnés", async () => {
    const res = await request(port, {
      method: "POST", path: "/api/thresholds", body: { temp_high: 31 },
    });
    assert.equal(res.status, 200);
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.thresholds.temp_high, 31);
    assert.equal(parsed.thresholds.temp_low, 24, "seuils non fournis conservés");
  });

  await t.test("POST /api/autopilot enabled:false → mode manuel", async () => {
    const res = await request(port, {
      method: "POST", path: "/api/autopilot", body: { enabled: false },
    });
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).enabled, false);
    assert.equal(app.isAutopilotEnabled(), false);
  });

  await t.test("POST /api/autopilot champ invalide → état inchangé", async () => {
    await request(port, { method: "POST", path: "/api/autopilot", body: { enabled: true } });
    const res = await request(port, {
      method: "POST", path: "/api/autopilot", body: { enabled: "oui" },
    });
    assert.equal(res.status, 200);
    assert.equal(app.isAutopilotEnabled(), true, "valeur non-booléenne ignorée");
  });

  await t.test("route inconnue → 404", async () => {
    const res = await request(port, { method: "GET", path: "/inexistant" });
    assert.equal(res.status, 404);
  });

  await t.test("OPTIONS (CORS preflight) → 204", async () => {
    const res = await request(port, { method: "OPTIONS", path: "/command" });
    assert.equal(res.status, 204);
  });
});
