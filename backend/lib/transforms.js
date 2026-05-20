// Agrivia — fonctions de transformation des messages gateway → état interne.
// Pures : aucune dépendance, aucun effet de bord.

/**
 * Transforme un message `sensor_data` reçu d'une gateway en mise à jour d'état.
 * @param {object} data - message brut { payload, timestamp, esp_id, serre_id }
 */
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

/**
 * Transforme un message `actuator_state` en mise à jour d'état des actionneurs.
 * @param {object} data - message brut { actuators }
 */
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

module.exports = { transformSensorData, transformActuatorState };
