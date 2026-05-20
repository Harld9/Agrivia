// Tests unitaires — registre des appareils + timeout online→offline.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDeviceRegistry } = require("../lib/devices");

test("updateDevice crée un appareil en ligne", () => {
  const reg = createDeviceRegistry();
  const dev = reg.updateDevice("esp-1", { serre_id: "A" });
  assert.equal(dev.esp_id, "esp-1");
  assert.equal(dev.status, "online");
  assert.equal(dev.serre_id, "A");
  assert.ok(dev.last_seen, "last_seen renseigné");
});

test("updateDevice fusionne les patches successifs", () => {
  const reg = createDeviceRegistry();
  reg.updateDevice("esp-1", { serre_id: "A", uptime_s: 10 });
  reg.updateDevice("esp-1", { wifi_rssi: -50 });
  const dev = reg.get("esp-1");
  assert.equal(dev.serre_id, "A");
  assert.equal(dev.uptime_s, 10);
  assert.equal(dev.wifi_rssi, -50);
});

test("list() renvoie tous les appareils connus", () => {
  const reg = createDeviceRegistry();
  reg.updateDevice("esp-1", {});
  reg.updateDevice("esp-2", {});
  assert.equal(reg.list().length, 2);
});

test("markStale passe un appareil hors-ligne après le timeout", () => {
  let now = 0;
  const reg = createDeviceRegistry({ timeoutMs: 90_000, now: () => now });

  reg.updateDevice("esp-1", {});            // last_seen = t0
  now = 50_000;
  assert.equal(reg.markStale(), false, "pas encore expiré à 50s");
  assert.equal(reg.get("esp-1").status, "online");

  now = 91_000;                              // > 90s d'inactivité
  assert.equal(reg.markStale(), true, "expiré au-delà de 90s");
  assert.equal(reg.get("esp-1").status, "offline");
});

test("markStale ne ré-affecte pas un appareil déjà offline", () => {
  let now = 0;
  const reg = createDeviceRegistry({ timeoutMs: 1000, now: () => now });
  reg.updateDevice("esp-1", {});
  now = 5000;
  assert.equal(reg.markStale(), true);   // online → offline
  assert.equal(reg.markStale(), false);  // déjà offline, aucun changement
});

test("une nouvelle mise à jour remet l'appareil en ligne", () => {
  let now = 0;
  const reg = createDeviceRegistry({ timeoutMs: 1000, now: () => now });
  reg.updateDevice("esp-1", {});
  now = 5000;
  reg.markStale();
  assert.equal(reg.get("esp-1").status, "offline");
  reg.updateDevice("esp-1", {});         // nouvelle nouvelle
  assert.equal(reg.get("esp-1").status, "online");
});

test("registres indépendants : pas d'état partagé entre instances", () => {
  const a = createDeviceRegistry();
  const b = createDeviceRegistry();
  a.updateDevice("esp-1", {});
  assert.equal(a.list().length, 1);
  assert.equal(b.list().length, 0);
});
