// Tests unitaires — autopilote (hystérésis fan / pompe / LED).
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_THRESHOLDS,
  defaultActuators,
  decideAutopilot,
  buildAiContext,
} = require("../lib/autopilot");

const T = DEFAULT_THRESHOLDS;
const off = () => defaultActuators();

// Capteurs « tout dans les normes » → base neutre.
function neutralSensors() {
  return { temperature: 26, soil_humidity: 45, light_level: 500 };
}

test("aucun changement quand tout est dans les normes", () => {
  const r = decideAutopilot(neutralSensors(), off(), T);
  assert.deepEqual(r.desired, { fan: false, pump: false, led: false });
  assert.deepEqual(r.commands, {});
  assert.equal(r.actions.length, 0);
});

// ── Ventilateur ─────────────────────────────────────────────────────────────
test("fan ON quand température > temp_high", () => {
  const r = decideAutopilot({ ...neutralSensors(), temperature: 29 }, off(), T);
  assert.equal(r.desired.fan, true);
  assert.deepEqual(r.commands.fan, { state: true });
  assert.ok(r.actions.includes("Ventilateur activé"));
});

test("fan reste OFF pile au seuil temp_high (pas de strict dépassement)", () => {
  const r = decideAutopilot({ ...neutralSensors(), temperature: T.temp_high }, off(), T);
  assert.equal(r.desired.fan, false);
  assert.deepEqual(r.commands, {});
});

test("fan OFF quand température < temp_low", () => {
  const r = decideAutopilot(
    { ...neutralSensors(), temperature: 22 },
    { fan: true, pump: false, led: false },
    T,
  );
  assert.equal(r.desired.fan, false);
  assert.deepEqual(r.commands.fan, { state: false });
  assert.ok(r.actions.includes("Ventilateur éteint"));
});

test("hystérésis fan : zone morte 24-28°C ne change rien (fan déjà ON)", () => {
  const r = decideAutopilot(
    { ...neutralSensors(), temperature: 26 },
    { fan: true, pump: false, led: false },
    T,
  );
  assert.equal(r.desired.fan, true);
  assert.deepEqual(r.commands, {}, "pas de commande redondante");
});

test("pas de commande fan redondante quand déjà ON et toujours chaud", () => {
  const r = decideAutopilot(
    { ...neutralSensors(), temperature: 31 },
    { fan: true, pump: false, led: false },
    T,
  );
  assert.equal(r.desired.fan, true);
  assert.deepEqual(r.commands, {});
});

// ── Pompe ───────────────────────────────────────────────────────────────────
test("pompe ON quand sol < soil_low", () => {
  const r = decideAutopilot({ ...neutralSensors(), soil_humidity: 20 }, off(), T);
  assert.equal(r.desired.pump, true);
  assert.deepEqual(r.commands.pump, { state: true });
  assert.ok(r.actions.includes("Pompe activée"));
});

test("pompe OFF quand sol > soil_high", () => {
  const r = decideAutopilot(
    { ...neutralSensors(), soil_humidity: 70 },
    { fan: false, pump: true, led: false },
    T,
  );
  assert.equal(r.desired.pump, false);
  assert.deepEqual(r.commands.pump, { state: false });
  assert.ok(r.actions.includes("Pompe éteinte"));
});

test("hystérésis pompe : zone morte 30-60% ne change rien", () => {
  const r = decideAutopilot(
    { ...neutralSensors(), soil_humidity: 45 },
    { fan: false, pump: true, led: false },
    T,
  );
  assert.equal(r.desired.pump, true);
  assert.deepEqual(r.commands, {});
});

// ── LED ─────────────────────────────────────────────────────────────────────
test("LED ON quand luminosité < light_low avec intensité 80", () => {
  const r = decideAutopilot({ ...neutralSensors(), light_level: 100 }, off(), T);
  assert.equal(r.desired.led, true);
  assert.deepEqual(r.commands.led, { state: true, intensity_pct: 80 });
  assert.ok(r.actions.includes("LED activée"));
});

test("LED OFF quand luminosité > light_high avec intensité 0", () => {
  const r = decideAutopilot(
    { ...neutralSensors(), light_level: 1000 },
    { fan: false, pump: false, led: true },
    T,
  );
  assert.equal(r.desired.led, false);
  assert.deepEqual(r.commands.led, { state: false, intensity_pct: 0 });
  assert.ok(r.actions.includes("LED éteinte"));
});

test("hystérésis LED : zone morte 300-800 lux ne change rien", () => {
  const r = decideAutopilot(
    { ...neutralSensors(), light_level: 500 },
    { fan: false, pump: false, led: true },
    T,
  );
  assert.equal(r.desired.led, true);
  assert.deepEqual(r.commands, {});
});

// ── Combinés ────────────────────────────────────────────────────────────────
test("les trois actionneurs peuvent changer simultanément", () => {
  const r = decideAutopilot(
    { temperature: 32, soil_humidity: 10, light_level: 50 },
    off(),
    T,
  );
  assert.deepEqual(r.desired, { fan: true, pump: true, led: true });
  assert.equal(Object.keys(r.commands).length, 3);
  assert.equal(r.actions.length, 3);
});

test("decideAutopilot ne modifie pas l'objet actuators passé en argument", () => {
  const input = { fan: false, pump: false, led: false };
  decideAutopilot({ ...neutralSensors(), temperature: 35 }, input, T);
  assert.deepEqual(input, { fan: false, pump: false, led: false });
});

test("seuils personnalisés sont respectés", () => {
  const custom = { ...T, temp_high: 20 };
  const r = decideAutopilot({ ...neutralSensors(), temperature: 21 }, off(), custom);
  assert.equal(r.desired.fan, true);
});

// ── buildAiContext ──────────────────────────────────────────────────────────
test("buildAiContext utilise les actions courantes quand présentes", () => {
  const ctx = buildAiContext(["Ventilateur activé"], ["T° élevée"], undefined);
  assert.equal(ctx.mode, "auto");
  assert.equal(ctx.last_action, "Ventilateur activé");
  assert.equal(ctx.reason, "T° élevée");
  assert.equal(ctx.confidence, 0.95);
});

test("buildAiContext retombe sur le contexte précédent si pas d'action", () => {
  const prev = { last_action: "Pompe activée", reason: "Sol sec" };
  const ctx = buildAiContext([], [], prev);
  assert.equal(ctx.last_action, "Pompe activée");
  assert.equal(ctx.reason, "Sol sec");
});

test("buildAiContext a des libellés par défaut sans action ni historique", () => {
  const ctx = buildAiContext([], [], undefined);
  assert.equal(ctx.last_action, "Surveillance en cours");
  assert.equal(ctx.reason, "Tous les paramètres sont dans les normes");
});
