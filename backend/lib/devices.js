// Agrivia — registre des appareils (ESP32).
// Fabrique un registre isolé : pas d'état module-level partagé, testable.

/**
 * Crée un registre d'appareils.
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=90000] - délai sans nouvelle avant passage hors-ligne.
 * @param {() => number} [opts.now=Date.now] - source de temps (injectable pour les tests).
 */
function createDeviceRegistry(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const now = opts.now ?? Date.now;
  const devices = {}; // { [esp_id]: DeviceInfo }

  /**
   * Met à jour (ou crée) un appareil et le marque en ligne.
   * @returns {object} l'appareil mis à jour.
   */
  function updateDevice(espId, patch) {
    devices[espId] = {
      ...(devices[espId] || { esp_id: espId, status: 'unknown' }),
      ...patch,
      last_seen: new Date(now()).toISOString(),
      status: 'online',
    };
    return devices[espId];
  }

  /**
   * Marque hors-ligne tout appareil online sans nouvelle depuis `timeoutMs`.
   * @returns {boolean} true si au moins un appareil a changé d'état.
   */
  function markStale() {
    const t = now();
    let changed = false;
    for (const [id, dev] of Object.entries(devices)) {
      if (dev.status === 'online' && t - new Date(dev.last_seen).getTime() > timeoutMs) {
        devices[id] = { ...devices[id], status: 'offline' };
        changed = true;
      }
    }
    return changed;
  }

  /** Liste de tous les appareils connus. */
  function list() {
    return Object.values(devices);
  }

  /** Accès direct à un appareil par son esp_id. */
  function get(espId) {
    return devices[espId];
  }

  return { updateDevice, markStale, list, get, timeoutMs };
}

module.exports = { createDeviceRegistry };
