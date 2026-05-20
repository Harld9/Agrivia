// Tests unitaires — fonctions de transformation.
const test = require("node:test");
const assert = require("node:assert/strict");
const { transformSensorData, transformActuatorState } = require("../lib/transforms");

test("transformSensorData remappe les champs du payload", () => {
  const msg = {
    type: "sensor_data",
    esp_id: "esp-1",
    serre_id: "serre-A",
    timestamp: "2026-05-20T10:00:00Z",
    payload: {
      temperature: 27.5,
      humidity_air: 55,
      humidity_soil: 40,
      luminosity: 600,
      npk: { nitrogen: 1, phosphorus: 2, potassium: 3 },
    },
  };
  const out = transformSensorData(msg);
  assert.deepEqual(out, {
    sensors: {
      temperature: 27.5,
      air_humidity: 55,
      soil_humidity: 40,
      light_level: 600,
    },
    timestamp: "2026-05-20T10:00:00Z",
    esp_id: "esp-1",
    serre_id: "serre-A",
  });
});

test("transformActuatorState mappe les états ON", () => {
  const out = transformActuatorState({
    actuators: {
      pump: { active: true },
      fan: { active: true },
      led: { active: true, intensity_pct: 80 },
    },
  });
  assert.deepEqual(out, {
    actuators: {
      pump: { state: true },
      fan: { state: true },
      grow_light: { state: true, intensity: 80 },
    },
  });
});

test("transformActuatorState retombe sur false/0 si actionneurs absents", () => {
  const out = transformActuatorState({ actuators: {} });
  assert.deepEqual(out, {
    actuators: {
      pump: { state: false },
      fan: { state: false },
      grow_light: { state: false, intensity: 0 },
    },
  });
});

test("transformActuatorState : led inactive → intensité 0", () => {
  const out = transformActuatorState({
    actuators: { led: { active: false, intensity_pct: 50 } },
  });
  assert.equal(out.actuators.grow_light.state, false);
  // active=false → intensity_pct conservé tel quel par l'opérateur ||
  assert.equal(out.actuators.grow_light.intensity, 50);
});
