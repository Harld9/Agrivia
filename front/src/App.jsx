// src/App.jsx
import { useState, useEffect, useRef } from 'react';
import {
    Thermometer,
    Droplets,
    Sprout,
    Sun,
    Fan,
    Lightbulb,
    Waves,
    Brain,
    Activity,
    Wifi,
    WifiOff
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

const BACKEND_WS_URL = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:3000';
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:3000';

// ============================
// HEADER COMPONENT
// ============================
function Header({ isConnected, lastUpdate }) {
    const formatTime = (timestamp) => {
        if (!timestamp) return '--:--:--';
        return new Date(timestamp).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <header className="bg-gradient-to-r from-gray-800 via-gray-900 to-gray-800 shadow-lg border-b border-gray-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg">
                            <Sprout className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">
                                AGRIVIA
                            </h1>
                            <p className="text-sm text-gray-400">Smart Greenhouse AI</p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-2">
                        <div className="flex items-center gap-2">
                            {isConnected ? (
                                <>
                                    <Wifi className="w-4 h-4 text-green-500" />
                                    <span className="text-sm text-green-400 font-medium">Temps réel</span>
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="w-4 h-4 text-red-500" />
                                    <span className="text-sm text-red-400 font-medium">Déconnecté</span>
                                </>
                            )}
                        </div>
                        <div className="text-sm text-gray-400">
                            Dernière mise à jour: <span className="text-gray-300 font-mono">{formatTime(lastUpdate)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}

// ============================
// AI BRAIN COMPONENT
// ============================
function AIBrain({ aiContext }) {
    if (!aiContext) {
        return (
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                <div className="flex items-center gap-3 mb-3">
                    <Brain className="w-6 h-6 text-gray-500" />
                    <h2 className="text-xl font-bold text-gray-500">Cerveau IA</h2>
                </div>
                <p className="text-gray-500">En attente de données...</p>
            </div>
        );
    }

    const { mode, last_action, reason, confidence } = aiContext;
    const isActive = mode === 'auto';

    return (
        <div
            className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 shadow-xl border-2 ${isActive ? 'border-green-500 animate-glow-pulse' : 'border-gray-700'
                }`}
        >
            <div className="flex items-center gap-3 mb-4">
                <div className={`p-3 rounded-lg ${isActive ? 'bg-green-500/20 animate-ai-pulse' : 'bg-gray-700'}`}>
                    <Brain className={`w-8 h-8 ${isActive ? 'text-green-400' : 'text-gray-400'}`} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">
                        Cerveau IA
                    </h2>
                    <p className="text-sm text-gray-400">
                        Mode: <span className={`font-semibold ${isActive ? 'text-green-400' : 'text-gray-300'}`}>
                            {mode.toUpperCase()}
                        </span>
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <Activity className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Dernière action</p>
                        <p className="text-white font-medium">{last_action || 'Aucune action'}</p>
                    </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg">
                    <Sprout className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Raison</p>
                        <p className="text-gray-200">{reason || 'N/A'}</p>
                    </div>
                </div>

                <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400 uppercase font-semibold">Confiance</span>
                        <span className="text-lg font-bold text-green-400">{Math.round((confidence || 0) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-500 rounded-full"
                            style={{ width: `${(confidence || 0) * 100}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================
// SENSOR CARD COMPONENT
// ============================
function SensorCard({ icon: Icon, label, value, unit, isCritical }) {
    return (
        <div
            className={`rounded-xl p-6 shadow-lg border-2 transition-all duration-300 ${isCritical
                    ? 'bg-gradient-to-br from-red-900/40 to-orange-900/40 border-red-500 animate-alert-pulse'
                    : 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700 hover:border-gray-600'
                }`}
        >
            <div className="flex items-start justify-between mb-3">
                <div className={`p-3 rounded-lg ${isCritical ? 'bg-red-500/20' : 'bg-gray-700'}`}>
                    <Icon className={`w-6 h-6 ${isCritical ? 'text-red-400' : 'text-emerald-400'}`} />
                </div>
                {isCritical && (
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-bold rounded uppercase">
                        Alerte
                    </span>
                )}
            </div>

            <div className="space-y-1">
                <p className="text-sm text-gray-400 font-medium">{label}</p>
                <div className="flex items-baseline gap-1">
                    <p className={`text-3xl font-bold ${isCritical ? 'text-red-300' : 'text-white'}`}>
                        {value !== null && value !== undefined ? value.toFixed(1) : '--'}
                    </p>
                    <span className="text-lg text-gray-400">{unit}</span>
                </div>
            </div>
        </div>
    );
}

// ============================
// ACTUATOR STATUS COMPONENT
// ============================
function ActuatorStatus({ actuators }) {
    if (!actuators) {
        return (
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                <h3 className="text-lg font-bold text-gray-400 mb-4">État des Actionneurs</h3>
                <p className="text-gray-500">Aucune donnée disponible</p>
            </div>
        );
    }

    const { pump, fan, grow_light } = actuators;

    const actuatorItems = [
        {
            icon: Waves,
            label: 'Pompe',
            state: pump?.state || false,
            detail: null
        },
        {
            icon: Fan,
            label: 'Ventilateur',
            state: fan?.state || false,
            detail: fan?.state ? `${fan.speed || 0}%` : null
        },
        {
            icon: Lightbulb,
            label: 'Lumière',
            state: grow_light?.state || false,
            detail: grow_light?.state ? `${grow_light.intensity || 0}%` : null
        }
    ];

    return (
        <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                État des Actionneurs
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {actuatorItems.map(({ icon: Icon, label, state, detail }) => (
                    <div
                        key={label}
                        className={`p-4 rounded-lg border-2 transition-all ${state
                                ? 'bg-green-500/10 border-green-500/50'
                                : 'bg-gray-700/30 border-gray-600'
                            }`}
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <Icon className={`w-5 h-5 ${state ? 'text-green-400' : 'text-gray-500'}`} />
                            <span className="text-sm font-medium text-gray-300">{label}</span>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold uppercase ${state ? 'text-green-400' : 'text-gray-500'}`}>
                                {state ? 'ON' : 'OFF'}
                            </span>
                            {detail && (
                                <span className="text-xs text-gray-400 font-mono">{detail}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================
// HISTORY CHART COMPONENT
// ============================
function HistoryChart({ data }) {
    if (!data || data.length === 0) {
        return (
            <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
                <h3 className="text-lg font-bold text-white mb-4">Historique</h3>
                <div className="h-64 flex items-center justify-center">
                    <p className="text-gray-500">Aucune donnée historique disponible</p>
                </div>
            </div>
        );
    }

    const chartData = data.map(item => ({
        time: item.timestamp
            ? new Date(item.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : '--:--',
        temperature: item.sensors?.temperature || 0,
        soilHumidity: item.sensors?.soil_humidity || 0,
    })).reverse();

    return (
        <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                Historique (20 dernières mesures)
            </h3>

            <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorSoil" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="time" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                    <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#1f2937',
                            border: '1px solid #374151',
                            borderRadius: '8px',
                            color: '#fff'
                        }}
                    />
                    <Legend wrapperStyle={{ color: '#9ca3af' }} />
                    <Area
                        type="monotone"
                        dataKey="temperature"
                        stroke="#f97316"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorTemp)"
                        name="Température (°C)"
                    />
                    <Area
                        type="monotone"
                        dataKey="soilHumidity"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorSoil)"
                        name="Humidité Sol (%)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ============================
// MAIN APP COMPONENT
// ============================
function App() {
    const [currentData, setCurrentData] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const wsRef = useRef(null);
    const reconnectRef = useRef(null);

    useEffect(() => {
        // Charger l'historique existant au démarrage
        fetch(`${BACKEND_API_URL}/api/history`)
            .then(r => r.json())
            .then(data => {
                if (data.length > 0) {
                    setHistoryData(data);
                    setCurrentData(data[0]);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));

        // Connexion WebSocket avec reconnexion automatique
        const connect = () => {
            const ws = new WebSocket(BACKEND_WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
                if (reconnectRef.current) {
                    clearTimeout(reconnectRef.current);
                    reconnectRef.current = null;
                }
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);

                if (msg.type === 'update') {
                    setCurrentData(msg.data);
                    setHistoryData(prev => {
                        const next = [msg.data, ...prev];
                        return next.slice(0, 20);
                    });
                } else if (msg.type === 'history') {
                    setHistoryData(msg.data);
                    if (msg.data.length > 0) setCurrentData(msg.data[0]);
                    setLoading(false);
                }
            };

            ws.onclose = () => {
                setIsConnected(false);
                reconnectRef.current = setTimeout(connect, 3000);
            };

            ws.onerror = () => {
                ws.close();
            };
        };

        connect();

        return () => {
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null; // Empêcher la reconnexion au démontage
                wsRef.current.close();
            }
        };
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-green-500 mx-auto mb-4"></div>
                    <p className="text-gray-400 text-lg">Connexion au backend...</p>
                </div>
            </div>
        );
    }

    if (!currentData) {
        return (
            <div className="min-h-screen bg-gray-900">
                <Header isConnected={isConnected} lastUpdate={null} />
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="bg-gray-800 rounded-xl p-8 text-center border border-gray-700">
                        <WifiOff className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-400 mb-2">Aucune donnée disponible</h2>
                        <p className="text-gray-500">
                            En attente des données du simulateur...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    const sensors = currentData.sensors || {};
    const actuators = currentData.actuators || null;
    const aiContext = currentData.ai_context || null;

    const tempCritical = (sensors.temperature || 0) > 25;
    const soilCritical = (sensors.soil_humidity || 0) < 30;

    return (
        <div className="min-h-screen bg-gray-900">
            <Header isConnected={isConnected} lastUpdate={currentData.timestamp} />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="space-y-6">
                    <AIBrain aiContext={aiContext} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <SensorCard
                            icon={Thermometer}
                            label="Température"
                            value={sensors.temperature}
                            unit="°C"
                            isCritical={tempCritical}
                        />
                        <SensorCard
                            icon={Droplets}
                            label="Humidité Air"
                            value={sensors.air_humidity}
                            unit="%"
                            isCritical={false}
                        />
                        <SensorCard
                            icon={Sprout}
                            label="Humidité Sol"
                            value={sensors.soil_humidity}
                            unit="%"
                            isCritical={soilCritical}
                        />
                        <SensorCard
                            icon={Sun}
                            label="Luminosité"
                            value={sensors.light_level}
                            unit="lux"
                            isCritical={false}
                        />
                    </div>

                    <ActuatorStatus actuators={actuators} />

                    <HistoryChart data={historyData} />
                </div>
            </main>
        </div>
    );
}

export default App;
