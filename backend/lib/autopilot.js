// Agrivia — autopilote : logique d'hystérésis (ventilateur / pompe / LED).
// Fonctions pures : aucun effet de bord, aucune dépendance.

/** Seuils par défaut (modifiables via POST /api/thresholds). */
const DEFAULT_THRESHOLDS = {
  temp_high:  28,   // °C → fan ON au-dessus
  temp_low:   24,   // °C → fan OFF en-dessous
  soil_low:   30,   // %  → pompe ON en-dessous
  soil_high:  60,   // %  → pompe OFF au-dessus
  light_low:  300,  // lux → LED ON en-dessous
  light_high: 800,  // lux → LED OFF au-dessus
};

/** État actionneurs neutre (tout éteint). */
function defaultActuators() {
  return { fan: false, pump: false, led: false };
}

/**
 * Décide des nouveaux états d'actionneurs à partir des capteurs (hystérésis).
 * Fonction PURE : ne modifie pas ses arguments.
 *
 * @param {object} sensors    - { temperature, soil_humidity, light_level }
 * @param {object} actuators  - état courant { fan, pump, led }
 * @param {object} thresholds - seuils d'hystérésis
 * @returns {{
 *   desired: {fan:boolean,pump:boolean,led:boolean},
 *   commands: object,        // seulement les actionneurs qui changent
 *   actions: string[],       // libellés FR des actions effectuées
 *   reasons: string[]        // explications associées
 * }}
 */
function decideAutopilot(sensors, actuators, thresholds = DEFAULT_THRESHOLDS) {
  const current = { ...defaultActuators(), ...actuators };
  const desired = { ...current };
  const actions = [];
  const reasons = [];

  // ── Température → ventilateur (hystérésis) ────────────────────────────────
  if (sensors.temperature > thresholds.temp_high && !desired.fan) {
    desired.fan = true;
    actions.push("Ventilateur activé");
    reasons.push(`T° élevée (${sensors.temperature.toFixed(1)}°C > ${thresholds.temp_high}°C)`);
  } else if (sensors.temperature < thresholds.temp_low && desired.fan) {
    desired.fan = false;
    actions.push("Ventilateur éteint");
    reasons.push(`T° revenue à la normale (${sensors.temperature.toFixed(1)}°C)`);
  }

  // ── Humidité sol → pompe ──────────────────────────────────────────────────
  if (sensors.soil_humidity < thresholds.soil_low && !desired.pump) {
    desired.pump = true;
    actions.push("Pompe activée");
    reasons.push(`Sol trop sec (${sensors.soil_humidity.toFixed(1)}% < ${thresholds.soil_low}%)`);
  } else if (sensors.soil_humidity > thresholds.soil_high && desired.pump) {
    desired.pump = false;
    actions.push("Pompe éteinte");
    reasons.push(`Sol bien irrigué (${sensors.soil_humidity.toFixed(1)}%)`);
  }

  // ── Luminosité → LED ──────────────────────────────────────────────────────
  if (sensors.light_level < thresholds.light_low && !desired.led) {
    desired.led = true;
    actions.push("LED activée");
    reasons.push(`Luminosité faible (${sensors.light_level} lux < ${thresholds.light_low} lux)`);
  } else if (sensors.light_level > thresholds.light_high && desired.led) {
    desired.led = false;
    actions.push("LED éteinte");
    reasons.push(`Luminosité suffisante (${sensors.light_level} lux)`);
  }

  // ── Construire la commande (uniquement les actionneurs qui changent) ──────
  const commands = {};
  if (desired.fan  !== current.fan)  commands.fan  = { state: desired.fan };
  if (desired.pump !== current.pump) commands.pump = { state: desired.pump };
  if (desired.led  !== current.led)  commands.led  = { state: desired.led, intensity_pct: desired.led ? 80 : 0 };

  return { desired, commands, actions, reasons };
}

/**
 * Construit le contexte IA à afficher côté frontend.
 * Fonction PURE.
 *
 * @param {string[]} actions
 * @param {string[]} reasons
 * @param {object|undefined} lastAiContext - contexte IA précédent (fallback).
 */
function buildAiContext(actions, reasons, lastAiContext) {
  return {
    mode: "auto",
    last_action: actions.length > 0
      ? actions.join(", ")
      : (lastAiContext?.last_action || "Surveillance en cours"),
    reason: reasons.length > 0
      ? reasons.join(". ")
      : (lastAiContext?.reason || "Tous les paramètres sont dans les normes"),
    confidence: 0.95,
  };
}

module.exports = { DEFAULT_THRESHOLDS, defaultActuators, decideAutopilot, buildAiContext };
