// src/lib/sensors.js
// Pure helper functions extracted from App.jsx for unit testing.
// Behaviour-preserving: each function mirrors the logic that previously
// lived inline inside App.jsx.

/**
 * Compute min / max / avg of a list of (possibly nullish) numbers, plus the
 * slope of a linear regression over the last 6 valid points and a one-step
 * forecast (`next`).
 */
export function computeStats(values) {
    const v = values.filter(x => x != null && !isNaN(x));
    if (v.length === 0) return { min: null, max: null, avg: null, slope: 0, next: null };
    const min = Math.min(...v);
    const max = Math.max(...v);
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    // Linear regression on the last 6 points
    const r = v.slice(-6);
    const n = r.length;
    let slope = 0;
    if (n >= 2) {
        const mx = (n - 1) / 2;
        const my = r.reduce((a, b) => a + b, 0) / n;
        const num = r.reduce((acc, y, x) => acc + (x - mx) * (y - my), 0);
        const den = r.reduce((acc, _, x) => acc + (x - mx) ** 2, 0);
        slope = den !== 0 ? num / den : 0;
    }
    return { min, max, avg, slope, next: v[v.length - 1] + slope };
}

/**
 * Format an uptime expressed in seconds into a human-readable string.
 */
export function uptimeStr(s) {
    if (!s) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/**
 * Map a WiFi RSSI value (in dBm) to a signal level between 0 and 4.
 */
export function rssiLevel(rssi) {
    if (rssi == null) return 0;
    if (rssi > -60) return 4;
    if (rssi > -70) return 3;
    if (rssi > -80) return 2;
    return 1;
}

/**
 * Apply an incoming WebSocket message to the previous app state and return the
 * next state patch. Returns `null` for unknown message types.
 *
 * This is the pure core of the `ws.onmessage` handler in App.jsx.
 *
 * @param {{type: string, data: any}} msg   - parsed WS message
 * @param {{historyData: any[]}} prev       - relevant previous state
 * @returns {{currentData?: any, historyData?: any[], devices?: any[]}|null}
 */
export function applyWsMessage(msg, prev = {}) {
    if (!msg || typeof msg !== 'object') return null;
    const prevHistory = Array.isArray(prev.historyData) ? prev.historyData : [];

    if (msg.type === 'update') {
        return {
            currentData: msg.data,
            historyData: [msg.data, ...prevHistory].slice(0, 20),
        };
    }
    if (msg.type === 'history') {
        const data = Array.isArray(msg.data) ? msg.data : [];
        return {
            currentData: data.length > 0 ? data[0] : undefined,
            historyData: data,
        };
    }
    if (msg.type === 'devices') {
        return { devices: msg.data };
    }
    return null;
}

/**
 * Format a sensor value, returning a placeholder when the value is missing.
 */
export function formatSensorValue(value, decimals = 1, placeholder = '--') {
    return value != null && !isNaN(value) ? value.toFixed(decimals) : placeholder;
}

/**
 * Group a list of objects by their `serre_id`, falling back to `'Inconnue'`.
 */
export function groupBySerre(items) {
    return (items || []).reduce((acc, item) => {
        const s = (item && item.serre_id) || 'Inconnue';
        (acc[s] = acc[s] || []).push(item);
        return acc;
    }, {});
}

/**
 * Apply a delta to the autopilot threshold object for a given control key.
 * Returns the patch to merge into the thresholds, or `null` for unknown keys.
 * Mirrors the `thresholdMap` logic in ManualPage.adjust().
 */
export function thresholdPatch(key, thresholds, delta) {
    const thresholdMap = {
        temp:  { temp_high: +(thresholds.temp_high + delta).toFixed(1), temp_low: +(thresholds.temp_low + delta).toFixed(1) },
        soil:  { soil_low:  +(thresholds.soil_low  + delta).toFixed(1), soil_high: +(thresholds.soil_high + delta).toFixed(1) },
        light: { light_low: +(thresholds.light_low + delta).toFixed(0), light_high: +(thresholds.light_high + delta).toFixed(0) },
    };
    return thresholdMap[key] || null;
}
