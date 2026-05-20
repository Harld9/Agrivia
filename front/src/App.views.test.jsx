import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';

/**
 * In-memory WebSocket mock. The most-recently constructed instance is exposed
 * on `MockWebSocket.lastSocket` so tests can drive incoming messages.
 */
class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;

    constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.OPEN;
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;
        MockWebSocket.lastSocket = this;
        queueMicrotask(() => this.onopen && this.onopen());
    }

    emit(payload) {
        this.onmessage && this.onmessage({ data: JSON.stringify(payload) });
    }

    triggerClose() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose && this.onclose();
    }

    triggerError() {
        this.onerror && this.onerror(new Error('boom'));
    }

    close() {
        this.readyState = MockWebSocket.CLOSED;
    }
}

// ── Sample payloads ─────────────────────────────────────────────────────────
const makeReading = (overrides = {}) => ({
    serre_id: 'Serre A',
    timestamp: '2026-05-20T10:00:00.000Z',
    sensors: {
        temperature: 23.4,
        air_humidity: 57.8,
        soil_humidity: 41.2,
        light_level: 540,
    },
    actuators: {
        pump: { state: true },
        fan: { state: false },
        grow_light: { state: true },
    },
    ai_context: { last_action: 'Pompe activée par IA' },
    ...overrides,
});

// A history series with a clear upward trend (so TrendArrow renders "↑").
const trendingHistory = [
    makeReading({ timestamp: '2026-05-20T10:05:00.000Z', sensors: { temperature: 30, air_humidity: 70, soil_humidity: 25, light_level: 900 } }),
    makeReading({ timestamp: '2026-05-20T10:04:00.000Z', sensors: { temperature: 29, air_humidity: 68, soil_humidity: 27, light_level: 850 } }),
    makeReading({ timestamp: '2026-05-20T10:03:00.000Z', sensors: { temperature: 28, air_humidity: 66, soil_humidity: 29, light_level: 800 } }),
    makeReading({ timestamp: '2026-05-20T10:02:00.000Z', sensors: { temperature: 27, air_humidity: 64, soil_humidity: 31, light_level: 750 } }),
    makeReading({ timestamp: '2026-05-20T10:01:00.000Z', sensors: { temperature: 26, air_humidity: 62, soil_humidity: 33, light_level: 700 } }),
    makeReading({ timestamp: '2026-05-20T10:00:00.000Z', sensors: { temperature: 25, air_humidity: 60, soil_humidity: 35, light_level: 650 } }),
];

const onlineDevice = {
    esp_id: 'esp-001',
    serre_id: 'Serre A',
    status: 'online',
    last_seen: '2026-05-20T10:00:00.000Z',
    uptime_s: 7325,
    wifi_rssi: -55,
    firmware_version: '1.2.3',
    sensors: { temperature: 23.4, air_humidity: 57.8, soil_humidity: 41.2, light_level: 540 },
    actuators: {
        pump: { state: true },
        fan: { state: false },
        grow_light: { state: false },
    },
};

const offlineDevice = {
    esp_id: 'esp-002',
    serre_id: 'Serre B',
    status: 'offline',
    uptime_s: 0,
    wifi_rssi: null,
    sensors: {},
    actuators: {},
};

// ── fetch stub helpers ──────────────────────────────────────────────────────
function stubFetch(handler) {
    vi.stubGlobal('fetch', vi.fn((url, opts) => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(handler(String(url), opts)),
    })));
}

beforeEach(() => {
    MockWebSocket.lastSocket = null;
    vi.stubGlobal('WebSocket', MockWebSocket);
    // Default: every REST call resolves to an empty array.
    stubFetch(() => []);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllTimers();
});

async function navigate(user, name) {
    await user.click(screen.getByRole('button', { name }));
}

// ════════════════════════════════════════════════════════════════════════════
// THEME TOGGLE
// ════════════════════════════════════════════════════════════════════════════
describe('theme toggle', () => {
    it('switches between dark and light theme via the sidebar button', async () => {
        const user = userEvent.setup();
        render(<App />);

        // Starts dark → button offers the light theme.
        const toggle = await screen.findByRole('button', { name: /Thème clair/i });
        await user.click(toggle);

        // Now light → button offers the dark theme.
        expect(
            await screen.findByRole('button', { name: /Thème sombre/i })
        ).toBeInTheDocument();

        // Toggle back to dark.
        await user.click(screen.getByRole('button', { name: /Thème sombre/i }));
        expect(
            await screen.findByRole('button', { name: /Thème clair/i })
        ).toBeInTheDocument();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
describe('dashboard page', () => {
    it('switches the time-range tabs', async () => {
        const user = userEvent.setup();
        render(<App />);
        await screen.findByRole('heading', { name: 'Tableau de bord' });

        for (const tab of ['Semaine', 'Mois', 'Année', 'Jour']) {
            await user.click(screen.getByRole('button', { name: tab }));
            expect(screen.getByRole('button', { name: tab })).toBeInTheDocument();
        }
    });

    it('renders all sensor cards once a reading arrives', async () => {
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({ type: 'update', data: makeReading() });

        expect(await screen.findByRole('heading', { name: 'Serre A' })).toBeInTheDocument();
        // Card titles (rendered as <h3> headings, distinct from summary labels).
        expect(screen.getByRole('heading', { name: 'Température' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: "Humidité de l'air" })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Humidité du sol' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Luminosité' })).toBeInTheDocument();
    });

    it('groups multiple greenhouses and shows online module counts', async () => {
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({ type: 'devices', data: [onlineDevice, offlineDevice] });
        MockWebSocket.lastSocket.emit({
            type: 'history',
            data: [
                makeReading({ serre_id: 'Serre A' }),
                makeReading({ serre_id: 'Serre B', timestamp: '2026-05-20T09:00:00.000Z' }),
            ],
        });

        expect(await screen.findByRole('heading', { name: 'Serre A' })).toBeInTheDocument();
        expect(await screen.findByRole('heading', { name: 'Serre B' })).toBeInTheDocument();
        // "2 serres surveillées" subtitle.
        expect(screen.getByText(/2 serres surveillées/i)).toBeInTheDocument();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// ANALYSIS PAGE
// ════════════════════════════════════════════════════════════════════════════
describe('analysis page', () => {
    it('renders the overview chart and four stat cards with data', async () => {
        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({ type: 'history', data: trendingHistory });
        await navigate(user, /Analyse et prévisions/i);

        expect(await screen.findByRole('heading', { name: 'Analyse et prévisions' })).toBeInTheDocument();
        expect(screen.getByText(/Vue d'ensemble/i)).toBeInTheDocument();
        expect(screen.getByText(/dernières mesures/i)).toBeInTheDocument();
        // Stat-card "Min / Moy / Max" rows.
        expect(screen.getAllByText('Min').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Moy').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Max').length).toBeGreaterThan(0);
        // Forecast labels.
        expect(screen.getAllByText(/Prochaine mesure estimée/i).length).toBe(4);
    });

    it('shows an upward trend arrow for a rising series', async () => {
        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({ type: 'history', data: trendingHistory });
        await navigate(user, /Analyse et prévisions/i);

        await screen.findByRole('heading', { name: 'Analyse et prévisions' });
        // Rising temperature/air/light produce "↑" markers.
        expect(screen.getAllByText(/↑/).length).toBeGreaterThan(0);
        // Falling soil humidity produces a "↓" marker.
        expect(screen.getAllByText(/↓/).length).toBeGreaterThan(0);
    });

    it('shows a stable trend label when there is no data', async () => {
        const user = userEvent.setup();
        render(<App />);
        await navigate(user, /Analyse et prévisions/i);

        await screen.findByRole('heading', { name: 'Analyse et prévisions' });
        // computeStats over empty data → slope 0 → "→ stable".
        expect(screen.getAllByText(/stable/i).length).toBe(4);
        // Placeholders ("--") for missing min/avg/max.
        expect(screen.getAllByText(/--/).length).toBeGreaterThan(0);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// HISTORY PAGE
// ════════════════════════════════════════════════════════════════════════════
describe('history page', () => {
    it('shows the empty state with no data', async () => {
        const user = userEvent.setup();
        render(<App />);
        await navigate(user, /Historique/i);

        expect(await screen.findByText(/Aucune donnée disponible/i)).toBeInTheDocument();
    });

    it('toggles the sort order of the table', async () => {
        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({
            type: 'history',
            data: [
                makeReading({ timestamp: '2026-05-20T10:00:00.000Z', sensors: { temperature: 22.0 } }),
                makeReading({ timestamp: '2026-05-20T09:00:00.000Z', sensors: { temperature: 35.0 } }),
            ],
        });
        await navigate(user, /Historique/i);

        // Default sort = newest first.
        const sortBtn = await screen.findByRole('button', { name: /Plus récent d'abord/i });
        await user.click(sortBtn);
        // After click → oldest first.
        expect(await screen.findByRole('button', { name: /Plus ancien d'abord/i })).toBeInTheDocument();
        // Toggle back.
        await user.click(screen.getByRole('button', { name: /Plus ancien d'abord/i }));
        expect(await screen.findByRole('button', { name: /Plus récent d'abord/i })).toBeInTheDocument();
    });

    it('highlights critical temperature and soil values', async () => {
        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({
            type: 'history',
            data: [
                makeReading({
                    sensors: { temperature: 35.0, air_humidity: 50, soil_humidity: 10, light_level: 200 },
                }),
            ],
        });
        await navigate(user, /Historique/i);

        const table = await screen.findByRole('table');
        // Critical temperature cell (> threshold) rendered.
        const tempCell = within(table).getByText('35.0°C');
        expect(tempCell).toHaveClass('text-orange-400');
        // Critical soil cell (< threshold).
        const soilCell = within(table).getByText('10.0%');
        expect(soilCell).toHaveClass('text-blue-400');
        // AI action shows in the row.
        expect(within(table).getByText(/Pompe activée par IA/i)).toBeInTheDocument();
    });

    it('renders a dash for missing sensor values and ai action', async () => {
        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({
            type: 'history',
            data: [
                {
                    serre_id: 'Serre A',
                    timestamp: null,
                    sensors: {},
                    actuators: {},
                },
            ],
        });
        await navigate(user, /Historique/i);

        const table = await screen.findByRole('table');
        // light_level missing → "— lux".
        expect(within(table).getByText(/— lux/)).toBeInTheDocument();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// MONITORING PAGE
// ════════════════════════════════════════════════════════════════════════════
describe('monitoring page', () => {
    it('shows an empty state when no devices are present', async () => {
        const user = userEvent.setup();
        render(<App />);
        await navigate(user, /Monitoring/i);

        expect(await screen.findByText(/Aucun appareil détecté/i)).toBeInTheDocument();
        expect(screen.getByText(/Aucun appareil en ligne/i)).toBeInTheDocument();
    });

    it('renders online and offline device cards with full metadata', async () => {
        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({ type: 'devices', data: [onlineDevice, offlineDevice] });
        await navigate(user, /Monitoring/i);

        await screen.findByRole('heading', { name: 'Monitoring' });
        // Online device.
        expect(screen.getByText('esp-001')).toBeInTheDocument();
        expect(screen.getByText(/● En ligne/i)).toBeInTheDocument();
        // Uptime formatted from 7325s → "2h 2min".
        expect(screen.getByText('2h 2min')).toBeInTheDocument();
        // Firmware version shown.
        expect(screen.getByText('1.2.3')).toBeInTheDocument();
        // RSSI value displayed.
        expect(screen.getByText(/-55 dBm/)).toBeInTheDocument();
        // Offline device.
        expect(screen.getByText('esp-002')).toBeInTheDocument();
        expect(screen.getByText(/○ Hors ligne/i)).toBeInTheDocument();
        // "Réseau actif" because one device is online.
        expect(screen.getByText(/Réseau actif/i)).toBeInTheDocument();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// MANUAL PAGE
// ════════════════════════════════════════════════════════════════════════════
describe('manual page', () => {
    it('renders the threshold control cards and empty module state', async () => {
        const user = userEvent.setup();
        render(<App />);
        await navigate(user, /Pilotage manuel/i);

        expect(await screen.findByRole('heading', { name: 'Pilotage manuel' })).toBeInTheDocument();
        // Four ControlCards (one per sensor) → use the "voulue" subtitle text.
        expect(screen.getAllByText(/voulue/i).length).toBe(4);
        // Empty modules state.
        expect(screen.getByText(/Aucun module détecté/i)).toBeInTheDocument();
    });

    it('adjusts the air-humidity target with + and - buttons', async () => {
        const user = userEvent.setup();
        render(<App />);
        await navigate(user, /Pilotage manuel/i);

        await screen.findByRole('heading', { name: 'Pilotage manuel' });

        // The air-humidity card is the 2nd ControlCard; target starts at 60.0%.
        expect(screen.getByText('60.0%')).toBeInTheDocument();

        // Each ControlCard exposes a "+" and "-" button. Air is index 1.
        const plusButtons = screen.getAllByRole('button').filter(b =>
            b.className.includes('btnPlus') || b.querySelector('svg.lucide-plus'));
        // Fall back: locate by the lucide Plus icon class presence.
        const allButtons = screen.getAllByRole('button');
        // Plus buttons are those whose only child is the Plus icon.
        const plus = allButtons.filter(b => b.innerHTML.includes('lucide-plus'));
        const minus = allButtons.filter(b => b.innerHTML.includes('lucide-minus'));
        expect(plus.length).toBe(4);
        expect(minus.length).toBe(4);

        // Air card is index 1.
        await user.click(plus[1]);
        expect(await screen.findByText('61.0%')).toBeInTheDocument();
        await user.click(minus[1]);
        await user.click(minus[1]);
        expect(await screen.findByText('59.0%')).toBeInTheDocument();
        void plusButtons;
    });

    it('adjusts a backend-driven threshold (temperature) and POSTs the patch', async () => {
        const posts = [];
        vi.stubGlobal('fetch', vi.fn((url, opts) => {
            if (opts && opts.method === 'POST') posts.push({ url: String(url), body: opts.body });
            return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }));

        const user = userEvent.setup();
        render(<App />);
        await navigate(user, /Pilotage manuel/i);
        await screen.findByRole('heading', { name: 'Pilotage manuel' });

        const allButtons = screen.getAllByRole('button');
        const plus = allButtons.filter(b => b.innerHTML.includes('lucide-plus'));
        // Temperature card is index 0.
        await user.click(plus[0]);

        await waitFor(() => {
            expect(posts.some(p => p.url.includes('/api/thresholds'))).toBe(true);
        });
        const patch = JSON.parse(posts.find(p => p.url.includes('/api/thresholds')).body);
        // temp_high started at 28 → +0.5 → 28.5.
        expect(patch.temp_high).toBe(28.5);
    });

    it('adjusts soil and light thresholds via every +/- control', async () => {
        const posts = [];
        vi.stubGlobal('fetch', vi.fn((url, opts) => {
            if (opts && opts.method === 'POST') posts.push({ url: String(url), body: opts.body });
            return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }));

        const user = userEvent.setup();
        render(<App />);
        await navigate(user, /Pilotage manuel/i);
        await screen.findByRole('heading', { name: 'Pilotage manuel' });

        const allButtons = screen.getAllByRole('button');
        const plus = allButtons.filter(b => b.innerHTML.includes('lucide-plus'));
        const minus = allButtons.filter(b => b.innerHTML.includes('lucide-minus'));

        // Soil card is index 2 — increase then decrease.
        await user.click(plus[2]);
        await user.click(minus[2]);
        // Light card is index 3 — increase then decrease.
        await user.click(plus[3]);
        await user.click(minus[3]);

        await waitFor(() => {
            const thr = posts.filter(p => p.url.includes('/api/thresholds'));
            expect(thr.length).toBeGreaterThanOrEqual(4);
        });
        const bodies = posts
            .filter(p => p.url.includes('/api/thresholds'))
            .map(p => JSON.parse(p.body));
        // Soil patch carries soil_low / soil_high, light patch carries light_low / light_high.
        expect(bodies.some(b => 'soil_low' in b)).toBe(true);
        expect(bodies.some(b => 'light_low' in b)).toBe(true);
    });

    it('toggles autopilot mode and POSTs the new state', async () => {
        const posts = [];
        vi.stubGlobal('fetch', vi.fn((url, opts) => {
            if (opts && opts.method === 'POST') posts.push({ url: String(url), body: opts.body });
            // GET /api/autopilot → autopilot enabled.
            const u = String(url);
            let payload = [];
            if (u.includes('/api/autopilot')) payload = { enabled: true, thresholds: null };
            return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
        }));

        const user = userEvent.setup();
        render(<App />);
        await navigate(user, /Pilotage manuel/i);
        await screen.findByRole('heading', { name: 'Pilotage manuel' });

        // Starts in auto mode (per the GET stub).
        const manualBtn = await screen.findByRole('button', { name: /^Manuel$/i });
        await user.click(manualBtn);

        await waitFor(() => {
            expect(posts.some(p => p.url.includes('/api/autopilot'))).toBe(true);
        });
        const body = JSON.parse(posts.find(p => p.url.includes('/api/autopilot')).body);
        expect(body.enabled).toBe(false);

        // Subtitle reflects manual mode.
        expect(await screen.findByText(/Contrôle direct des actionneurs/i)).toBeInTheDocument();
    });

    it('renders module cards and disables actuator switches in auto mode', async () => {
        // Autopilot enabled → auto mode → switches disabled.
        vi.stubGlobal('fetch', vi.fn((url) => {
            const u = String(url);
            let payload = [];
            if (u.includes('/api/autopilot')) payload = { enabled: true, thresholds: null };
            return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
        }));

        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());
        MockWebSocket.lastSocket.emit({ type: 'devices', data: [onlineDevice] });
        await navigate(user, /Pilotage manuel/i);

        await screen.findByRole('heading', { name: 'Pilotage manuel' });
        expect(await screen.findByText('esp-001')).toBeInTheDocument();
        // "Géré par l'autopilote" badge in auto mode.
        expect(screen.getByText(/Géré par l'autopilote/i)).toBeInTheDocument();
        // Hint to switch to manual mode.
        expect(screen.getByText(/pour contrôler les actionneurs/i)).toBeInTheDocument();

        // Switches are disabled in auto mode (MUI Switch → role="switch").
        const switches = screen.getAllByRole('switch');
        expect(switches.length).toBe(3);
        switches.forEach(sw => expect(sw).toBeDisabled());
    });

    it('sends an actuator command in manual mode for an online module', async () => {
        const posts = [];
        vi.stubGlobal('fetch', vi.fn((url, opts) => {
            if (opts && opts.method === 'POST') posts.push({ url: String(url), body: opts.body });
            const u = String(url);
            let payload = [];
            // Autopilot disabled → manual mode by default.
            if (u.includes('/api/autopilot')) payload = { enabled: false, thresholds: null };
            return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
        }));

        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());
        MockWebSocket.lastSocket.emit({ type: 'devices', data: [onlineDevice] });
        await navigate(user, /Pilotage manuel/i);

        await screen.findByRole('heading', { name: 'Pilotage manuel' });
        // Manual mode → "Contrôle direct actif" badge.
        expect(await screen.findByText(/Contrôle direct actif/i)).toBeInTheDocument();

        const switches = await screen.findAllByRole('switch');
        expect(switches.length).toBe(3);
        // Fan switch (index 1) is off → toggle it on.
        await user.click(switches[1]);

        await waitFor(() => {
            expect(posts.some(p => p.url.includes('/command'))).toBe(true);
        });
        const cmd = JSON.parse(posts.find(p => p.url.includes('/command')).body);
        expect(cmd.type).toBe('manual_command');
        expect(cmd.esp_id).toBe('esp-001');
        expect(cmd.commands.fan.state).toBe(true);
    });

    it('sends an LED command including intensity when toggled on', async () => {
        const posts = [];
        vi.stubGlobal('fetch', vi.fn((url, opts) => {
            if (opts && opts.method === 'POST') posts.push({ url: String(url), body: opts.body });
            const u = String(url);
            let payload = [];
            if (u.includes('/api/autopilot')) payload = { enabled: false, thresholds: null };
            return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
        }));

        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());
        MockWebSocket.lastSocket.emit({ type: 'devices', data: [onlineDevice] });
        await navigate(user, /Pilotage manuel/i);

        await screen.findByRole('heading', { name: 'Pilotage manuel' });
        await screen.findByText(/Contrôle direct actif/i);

        const switches = screen.getAllByRole('switch');
        // LED switch is index 2.
        await user.click(switches[2]);

        await waitFor(() => {
            expect(posts.some(p => p.url.includes('/command'))).toBe(true);
        });
        const cmd = JSON.parse(posts.find(p => p.url.includes('/command')).body);
        expect(cmd.commands.led.state).toBe(true);
        expect(cmd.commands.led.intensity_pct).toBe(80);
    });

    it('keeps actuator switches disabled for an offline module even in manual mode', async () => {
        vi.stubGlobal('fetch', vi.fn((url) => {
            const u = String(url);
            let payload = [];
            if (u.includes('/api/autopilot')) payload = { enabled: false, thresholds: null };
            return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
        }));

        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());
        MockWebSocket.lastSocket.emit({ type: 'devices', data: [offlineDevice] });
        await navigate(user, /Pilotage manuel/i);

        await screen.findByRole('heading', { name: 'Pilotage manuel' });
        expect(await screen.findByText('esp-002')).toBeInTheDocument();
        // Offline module hint.
        expect(screen.getByText(/Module hors ligne — commandes indisponibles/i)).toBeInTheDocument();
        screen.getAllByRole('switch').forEach(sw => expect(sw).toBeDisabled());
    });
});

// ════════════════════════════════════════════════════════════════════════════
// SECONDARY NAV (profile / settings → placeholder)
// ════════════════════════════════════════════════════════════════════════════
describe('secondary navigation', () => {
    // The placeholder page falls back to the raw page id when the entry is not
    // in NAV_MAIN — so "profile" / "settings" surface as the label.
    it('renders the placeholder page for Profil', async () => {
        const user = userEvent.setup();
        render(<App />);
        await navigate(user, /Profil/i);
        expect(await screen.findByText(/profile — à venir/i)).toBeInTheDocument();
    });

    it('renders the placeholder page for Paramètres', async () => {
        const user = userEvent.setup();
        render(<App />);
        await navigate(user, /Paramètres/i);
        expect(await screen.findByText(/settings — à venir/i)).toBeInTheDocument();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// WEBSOCKET LIFECYCLE & REST BOOTSTRAP
// ════════════════════════════════════════════════════════════════════════════
describe('websocket lifecycle', () => {
    it('reconnects after the socket closes', async () => {
        vi.useFakeTimers();
        try {
            render(<App />);
            // Flush the queued microtask that fires onopen.
            await vi.advanceTimersByTimeAsync(0);
            const first = MockWebSocket.lastSocket;
            expect(first).not.toBeNull();

            first.triggerClose();
            // Reconnect is scheduled 3s later.
            await vi.advanceTimersByTimeAsync(3000);
            expect(MockWebSocket.lastSocket).not.toBe(first);
        } finally {
            vi.useRealTimers();
        }
    });

    it('closes the socket on an error', async () => {
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());
        const sock = MockWebSocket.lastSocket;
        const closeSpy = vi.spyOn(sock, 'close');
        sock.triggerError();
        expect(closeSpy).toHaveBeenCalled();
    });

    it('hydrates state from the REST bootstrap endpoints', async () => {
        vi.stubGlobal('fetch', vi.fn((url) => {
            const u = String(url);
            let payload = [];
            if (u.includes('/api/history')) {
                payload = [makeReading()];
            } else if (u.includes('/api/autopilot')) {
                payload = {
                    enabled: false,
                    thresholds: { temp_high: 31, temp_low: 22, soil_low: 35, soil_high: 65, light_low: 250, light_high: 750 },
                };
            } else if (u.includes('/api/devices')) {
                payload = [onlineDevice];
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
        }));

        const user = userEvent.setup();
        render(<App />);

        // History bootstrap surfaces on the dashboard.
        expect(await screen.findByRole('heading', { name: 'Serre A' })).toBeInTheDocument();

        // Threshold bootstrap reflects in the history page legend (temp_high 31).
        await navigate(user, /Historique/i);
        expect(await screen.findByText(/31°C/)).toBeInTheDocument();
    });

    it('ignores unknown websocket message types without crashing', async () => {
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({ type: 'pong', data: {} });
        // App still renders the dashboard.
        expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    });
});
