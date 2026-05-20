import { describe, it, expect } from 'vitest';
import {
    computeStats,
    uptimeStr,
    rssiLevel,
    applyWsMessage,
    formatSensorValue,
    groupBySerre,
    thresholdPatch,
} from './sensors.js';

describe('computeStats', () => {
    it('returns null stats for an empty list', () => {
        expect(computeStats([])).toEqual({ min: null, max: null, avg: null, slope: 0, next: null });
    });

    it('ignores null and NaN values', () => {
        const stats = computeStats([10, null, NaN, 20, undefined]);
        expect(stats.min).toBe(10);
        expect(stats.max).toBe(20);
        expect(stats.avg).toBe(15);
    });

    it('computes min, max and avg correctly', () => {
        const stats = computeStats([2, 4, 6, 8]);
        expect(stats.min).toBe(2);
        expect(stats.max).toBe(8);
        expect(stats.avg).toBe(5);
    });

    it('detects a positive slope on an increasing series', () => {
        const stats = computeStats([1, 2, 3, 4, 5, 6]);
        expect(stats.slope).toBeCloseTo(1, 5);
        // next = last value + slope
        expect(stats.next).toBeCloseTo(7, 5);
    });

    it('detects a negative slope on a decreasing series', () => {
        const stats = computeStats([6, 5, 4, 3, 2, 1]);
        expect(stats.slope).toBeCloseTo(-1, 5);
        expect(stats.next).toBeCloseTo(0, 5);
    });

    it('has a zero slope when all values are equal', () => {
        const stats = computeStats([5, 5, 5, 5]);
        expect(stats.slope).toBe(0);
        expect(stats.next).toBe(5);
    });

    it('only regresses over the last 6 points', () => {
        // first values would lower the slope if included
        const stats = computeStats([100, 100, 100, 1, 2, 3, 4, 5, 6]);
        expect(stats.slope).toBeCloseTo(1, 5);
    });
});

describe('uptimeStr', () => {
    it('returns a dash for falsy input', () => {
        expect(uptimeStr(0)).toBe('—');
        expect(uptimeStr(undefined)).toBe('—');
        expect(uptimeStr(null)).toBe('—');
    });

    it('formats minutes only when under an hour', () => {
        expect(uptimeStr(120)).toBe('2min');
        expect(uptimeStr(59 * 60)).toBe('59min');
    });

    it('formats hours and minutes when over an hour', () => {
        expect(uptimeStr(3600)).toBe('1h 0min');
        expect(uptimeStr(3600 + 30 * 60)).toBe('1h 30min');
        expect(uptimeStr(2 * 3600 + 5 * 60)).toBe('2h 5min');
    });
});

describe('rssiLevel', () => {
    it('returns 0 when rssi is missing', () => {
        expect(rssiLevel(null)).toBe(0);
        expect(rssiLevel(undefined)).toBe(0);
    });

    it('maps strong signal to level 4', () => {
        expect(rssiLevel(-50)).toBe(4);
    });

    it('maps medium signals to levels 3 and 2', () => {
        expect(rssiLevel(-65)).toBe(3);
        expect(rssiLevel(-75)).toBe(2);
    });

    it('maps weak signal to level 1', () => {
        expect(rssiLevel(-90)).toBe(1);
    });
});

describe('applyWsMessage', () => {
    it('returns null for unknown message types', () => {
        expect(applyWsMessage({ type: 'noise', data: {} }, {})).toBeNull();
        expect(applyWsMessage(null, {})).toBeNull();
    });

    it('prepends an update to history and sets currentData', () => {
        const prev = { historyData: [{ id: 1 }] };
        const msg = { type: 'update', data: { id: 2 } };
        const next = applyWsMessage(msg, prev);
        expect(next.currentData).toEqual({ id: 2 });
        expect(next.historyData).toEqual([{ id: 2 }, { id: 1 }]);
    });

    it('caps history at 20 entries on update', () => {
        const prev = { historyData: Array.from({ length: 20 }, (_, i) => ({ id: i })) };
        const next = applyWsMessage({ type: 'update', data: { id: 'new' } }, prev);
        expect(next.historyData).toHaveLength(20);
        expect(next.historyData[0]).toEqual({ id: 'new' });
    });

    it('replaces history and picks newest as currentData for a history message', () => {
        const msg = { type: 'history', data: [{ id: 'a' }, { id: 'b' }] };
        const next = applyWsMessage(msg, {});
        expect(next.historyData).toEqual([{ id: 'a' }, { id: 'b' }]);
        expect(next.currentData).toEqual({ id: 'a' });
    });

    it('handles an empty history message without a currentData', () => {
        const next = applyWsMessage({ type: 'history', data: [] }, {});
        expect(next.historyData).toEqual([]);
        expect(next.currentData).toBeUndefined();
    });

    it('passes through devices messages', () => {
        const devices = [{ esp_id: 'esp-1' }];
        expect(applyWsMessage({ type: 'devices', data: devices }, {})).toEqual({ devices });
    });
});

describe('formatSensorValue', () => {
    it('formats numbers with the requested decimals', () => {
        expect(formatSensorValue(21.456, 1)).toBe('21.5');
        expect(formatSensorValue(21, 0)).toBe('21');
    });

    it('returns the placeholder for missing values', () => {
        expect(formatSensorValue(null)).toBe('--');
        expect(formatSensorValue(undefined)).toBe('--');
        expect(formatSensorValue(NaN)).toBe('--');
        expect(formatSensorValue(null, 1, '—')).toBe('—');
    });
});

describe('groupBySerre', () => {
    it('groups items by serre_id', () => {
        const items = [
            { esp_id: 'a', serre_id: 'S1' },
            { esp_id: 'b', serre_id: 'S2' },
            { esp_id: 'c', serre_id: 'S1' },
        ];
        const grouped = groupBySerre(items);
        expect(Object.keys(grouped).sort()).toEqual(['S1', 'S2']);
        expect(grouped.S1).toHaveLength(2);
        expect(grouped.S2).toHaveLength(1);
    });

    it('falls back to "Inconnue" when serre_id is missing', () => {
        const grouped = groupBySerre([{ esp_id: 'x' }]);
        expect(grouped.Inconnue).toHaveLength(1);
    });

    it('returns an empty object for empty/missing input', () => {
        expect(groupBySerre([])).toEqual({});
        expect(groupBySerre(undefined)).toEqual({});
    });
});

describe('thresholdPatch', () => {
    const thresholds = {
        temp_high: 28, temp_low: 24,
        soil_low: 30, soil_high: 60,
        light_low: 300, light_high: 800,
    };

    it('shifts both temperature thresholds', () => {
        expect(thresholdPatch('temp', thresholds, 0.5)).toEqual({ temp_high: 28.5, temp_low: 24.5 });
    });

    it('shifts both soil thresholds', () => {
        expect(thresholdPatch('soil', thresholds, -1)).toEqual({ soil_low: 29, soil_high: 59 });
    });

    it('shifts light thresholds with no decimals', () => {
        expect(thresholdPatch('light', thresholds, 50)).toEqual({ light_low: 350, light_high: 850 });
    });

    it('returns null for unknown keys', () => {
        expect(thresholdPatch('air', thresholds, 1)).toBeNull();
        expect(thresholdPatch('bogus', thresholds, 1)).toBeNull();
    });
});
