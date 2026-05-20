import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';

/**
 * Minimal in-memory WebSocket mock. Captured by `lastSocket` so tests can
 * drive incoming messages with `emit()`.
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
        // open asynchronously, like a real socket
        queueMicrotask(() => this.onopen && this.onopen());
    }

    emit(payload) {
        this.onmessage && this.onmessage({ data: JSON.stringify(payload) });
    }

    close() {
        this.readyState = MockWebSocket.CLOSED;
    }
}

const sampleUpdate = {
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
};

beforeEach(() => {
    MockWebSocket.lastSocket = null;
    vi.stubGlobal('WebSocket', MockWebSocket);
    // Every REST call resolves to an empty payload by default — no real network.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
    })));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('<App />', () => {
    it('renders the sidebar and the dashboard by default', async () => {
        render(<App />);
        // Brand appears in the sidebar
        expect(screen.getAllByText('Agrivía').length).toBeGreaterThan(0);
        // Dashboard heading is shown
        expect(
            await screen.findByRole('heading', { name: 'Tableau de bord' })
        ).toBeInTheDocument();
    });

    it('shows an empty state before any data arrives', async () => {
        render(<App />);
        expect(
            await screen.findByText(/Aucune donnée reçue/i)
        ).toBeInTheDocument();
    });

    it('opens a WebSocket to the backend on mount', async () => {
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());
        expect(MockWebSocket.lastSocket.url).toMatch(/^ws/);
    });

    it('renders sensor data after a WebSocket "update" message', async () => {
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({ type: 'update', data: sampleUpdate });

        // Greenhouse id surfaces as a heading
        expect(
            await screen.findByRole('heading', { name: 'Serre A' })
        ).toBeInTheDocument();

        // Temperature value rendered in the summary card
        expect(await screen.findByText('23.4')).toBeInTheDocument();
        // Soil humidity value
        expect(screen.getByText('41.2')).toBeInTheDocument();
        // Empty state is gone
        expect(screen.queryByText(/Aucune donnée reçue/i)).not.toBeInTheDocument();
    });

    it('reacts to a "history" message and reflects the newest entry', async () => {
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({
            type: 'history',
            data: [sampleUpdate],
        });

        expect(
            await screen.findByRole('heading', { name: 'Serre A' })
        ).toBeInTheDocument();
        expect(await screen.findByText('23.4')).toBeInTheDocument();
    });

    it('shows actuator states on the monitoring page after a "devices" message', async () => {
        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({
            type: 'devices',
            data: [
                {
                    esp_id: 'esp-001',
                    serre_id: 'Serre A',
                    status: 'online',
                    sensors: { temperature: 23.4 },
                    actuators: {
                        pump: { state: true },
                        fan: { state: false },
                        grow_light: { state: true },
                    },
                },
            ],
        });

        // Navigate to the Monitoring page
        await user.click(screen.getByRole('button', { name: /Monitoring/i }));

        expect(
            await screen.findByRole('heading', { name: 'Monitoring' })
        ).toBeInTheDocument();
        // Device card shows the esp id and online badge
        expect(await screen.findByText('esp-001')).toBeInTheDocument();
        expect(screen.getByText(/● En ligne/i)).toBeInTheDocument();
        // Actuator labels are present
        expect(screen.getByText('Pompe')).toBeInTheDocument();
        expect(screen.getByText('Ventilateur')).toBeInTheDocument();
    });

    it('switches pages when a sidebar nav button is clicked', async () => {
        const user = userEvent.setup();
        render(<App />);

        await user.click(screen.getByRole('button', { name: /Historique/i }));
        expect(
            await screen.findByRole('heading', { name: 'Historique' })
        ).toBeInTheDocument();
    });

    it('renders measured rows in the history table after data arrives', async () => {
        const user = userEvent.setup();
        render(<App />);
        await waitFor(() => expect(MockWebSocket.lastSocket).not.toBeNull());

        MockWebSocket.lastSocket.emit({ type: 'update', data: sampleUpdate });

        await user.click(screen.getByRole('button', { name: /Historique/i }));

        const table = await screen.findByRole('table');
        // The row reflects the temperature reading
        expect(within(table).getByText('23.4°C')).toBeInTheDocument();
    });
});
