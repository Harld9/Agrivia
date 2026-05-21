// src/App.jsx
import { useState, useEffect, useRef } from 'react';
import {
    LayoutDashboard, SlidersHorizontal, TrendingUp, History,
    User, Settings, Sprout, Sun, Moon, Calendar,
    Thermometer, Droplets, Leaf, Zap,
    Bot, Waves, Fan, Lightbulb, Plus, Minus, Monitor,
    Menu, X,
} from 'lucide-react';
import Switch from '@mui/material/Switch';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const muiTheme = createTheme({
    palette: {
        primary: { main: '#4ade80', contrastText: '#000' },
    },
});
import {
    AreaChart, Area, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer,
} from 'recharts';
import {
    computeStats, uptimeStr, rssiLevel, applyWsMessage, thresholdPatch,
} from './lib/sensors.js';

const BACKEND_WS_URL  = import.meta.env.VITE_BACKEND_WS_URL  || 'ws://localhost:3000';
const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:3000';

// ============================
// THEMES
// ============================
const THEMES = {
    dark: {
        mainBg:      'bg-[#0f1117]',
        sidebarBg:   'bg-[#1a1d27]',
        cardBg:      'bg-[#1e2230]',
        border:      'border-gray-700/50',
        text:        'text-white',
        textMuted:   'text-gray-400',
        textLabel:   'text-gray-500',
        accent:      'text-green-400',
        accentHex:   '#4ade80',
        navActive:   'text-green-400 bg-green-400/10 border-l-2 border-green-400',
        navInactive: 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border-l-2 border-transparent',
        divider:     'border-gray-700/50',
        toggleBg:    'bg-gray-700/60 hover:bg-gray-600/60',
        chartGrid:   '#374151',
        chartText:   '#9ca3af',
        chartTrack:   '#374151',
        tabActive:    'text-green-400 border-b-2 border-green-400',
        tabInactive:  'text-gray-400 hover:text-gray-200 border-b-2 border-transparent',
        summaryBg:    'bg-[#1e2230]',
        tooltipBg:    '#1e2230',
        tooltipBorder:'#374151',
        btnMinus:     'bg-gray-700 hover:bg-gray-600 text-gray-200',
        btnPlus:      'bg-green-500 hover:bg-green-400 text-white',
        switchOff:    'bg-gray-600',
        badge:        'bg-green-500/20 text-green-400',
        badgeOff:     'bg-gray-700/60 text-gray-400',
    },
    light: {
        mainBg:      'bg-slate-50',
        sidebarBg:   'bg-white',
        cardBg:      'bg-white',
        border:      'border-gray-200',
        text:        'text-gray-900',
        textMuted:   'text-gray-500',
        textLabel:   'text-gray-400',
        accent:      'text-green-600',
        accentHex:   '#16a34a',
        navActive:   'text-green-600 bg-green-50 border-l-2 border-green-600',
        navInactive: 'text-gray-500 hover:text-gray-800 hover:bg-gray-100 border-l-2 border-transparent',
        divider:     'border-gray-200',
        toggleBg:    'bg-gray-100 hover:bg-gray-200',
        chartGrid:   '#e5e7eb',
        chartText:   '#9ca3af',
        chartTrack:   '#e5e7eb',
        tabActive:    'text-green-600 border-b-2 border-green-600',
        tabInactive:  'text-gray-400 hover:text-gray-600 border-b-2 border-transparent',
        summaryBg:    'bg-white',
        tooltipBg:    '#ffffff',
        tooltipBorder:'#e5e7eb',
        btnMinus:     'bg-gray-200 hover:bg-gray-300 text-gray-700',
        btnPlus:      'bg-green-500 hover:bg-green-400 text-white',
        switchOff:    'bg-gray-300',
        badge:        'bg-green-100 text-green-700',
        badgeOff:     'bg-gray-100 text-gray-500',
    },
};

const NAV_MAIN = [
    { id: 'dashboard',  label: 'Tableau de bord',      icon: LayoutDashboard },
    { id: 'manual',     label: 'Pilotage manuel',       icon: SlidersHorizontal },
    { id: 'analysis',   label: 'Analyse et prévisions', icon: TrendingUp },
    { id: 'history',    label: 'Historique',            icon: History },
    { id: 'monitoring', label: 'Monitoring',            icon: Monitor },
];
const NAV_SECONDARY = [
    { id: 'profile',   label: 'Profil',     icon: User },
    { id: 'settings',  label: 'Paramètres', icon: Settings },
];

// ============================
// CONNECTION INDICATOR
// ============================
function ConnectionIndicator({ theme, isConnected }) {
    return (
        <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
            <span className={`text-xs font-medium ${isConnected ? theme.accent : theme.textMuted}`}>
                {isConnected ? 'Connecté' : 'Déconnecté'}
            </span>
        </div>
    );
}

// ============================
// SIDEBAR CONTENT (shared by desktop aside + mobile drawer)
// ============================
function SidebarBody({ theme, isDark, activePage, setActivePage, toggleTheme, isConnected, onNavigate }) {
    const handleNav = (id) => {
        setActivePage(id);
        if (onNavigate) onNavigate();
    };
    return (
        <>
            <div className="px-6 pt-8 pb-6">
                <div className="flex items-center gap-2 mb-5">
                    <Sprout className={`w-7 h-7 ${theme.accent}`} />
                    <span className={`text-xl font-bold ${theme.accent}`}>Agrivía</span>
                </div>
                <div className={`text-sm font-medium ${theme.text}`}>John Doe</div>
                <div className={`text-xs ${theme.textMuted} mt-0.5`}>Responsable serre</div>
            </div>

            <div className={`mx-4 border-t ${theme.divider}`} />

            <nav className="flex-1 px-3 py-4 space-y-1">
                {NAV_MAIN.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => handleNav(id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-r-lg text-sm font-medium transition-all duration-150 text-left
                            ${activePage === id ? theme.navActive : theme.navInactive}`}>
                        <Icon className="w-4 h-4 shrink-0" />
                        {label}
                    </button>
                ))}
                <div className={`my-3 border-t ${theme.divider}`} />
                {NAV_SECONDARY.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => handleNav(id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-r-lg text-sm font-medium transition-all duration-150 text-left
                            ${activePage === id ? theme.navActive : theme.navInactive}`}>
                        <Icon className="w-4 h-4 shrink-0" />
                        {label}
                    </button>
                ))}
            </nav>

            <div className="px-4 pb-6 space-y-4">
                <div className={`border-t ${theme.divider} mb-4`} />
                <button onClick={toggleTheme}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all duration-150 ${theme.toggleBg} ${theme.textMuted}`}>
                    {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
                    {isDark ? 'Thème clair' : 'Thème sombre'}
                </button>
                {onNavigate
                    ? (
                        <div className="px-3 pt-2">
                            <ConnectionIndicator theme={theme} isConnected={isConnected} />
                        </div>
                    )
                    : (
                        <div className="flex items-center gap-2 px-3 pt-2">
                            <Sprout className={`w-5 h-5 ${theme.accent} opacity-40`} />
                            <span className={`text-sm font-semibold ${theme.accent} opacity-40`}>Agrivía</span>
                        </div>
                    )}
            </div>
        </>
    );
}

// ============================
// SIDEBAR (desktop, ≥768px)
// ============================
function Sidebar({ theme, isDark, activePage, setActivePage, toggleTheme }) {
    return (
        <aside className={`hidden md:flex w-60 min-h-screen flex-col shrink-0 ${theme.sidebarBg} border-r ${theme.divider}`}>
            <SidebarBody
                theme={theme} isDark={isDark}
                activePage={activePage} setActivePage={setActivePage}
                toggleTheme={toggleTheme}
            />
        </aside>
    );
}

// ============================
// MOBILE TOP BAR (<768px)
// ============================
function MobileTopBar({ theme, isConnected, onOpenMenu }) {
    return (
        <header className={`md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 h-14 px-4 ${theme.sidebarBg} border-b ${theme.divider}`}>
            <div className="flex items-center gap-2">
                <button onClick={onOpenMenu} aria-label="Ouvrir le menu"
                    className={`-ml-1 w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${theme.toggleBg} ${theme.textMuted}`}>
                    <Menu className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                    <Sprout className={`w-6 h-6 ${theme.accent}`} />
                    <span className={`text-lg font-bold ${theme.accent}`}>Agrivía</span>
                </div>
            </div>
            <ConnectionIndicator theme={theme} isConnected={isConnected} />
        </header>
    );
}

// ============================
// MOBILE DRAWER (<768px slide-in nav)
// ============================
function MobileDrawer({ theme, isDark, activePage, setActivePage, toggleTheme, isConnected, open, onClose }) {
    return (
        <div className={`md:hidden fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
            />
            {/* Drawer panel */}
            <aside
                className={`absolute left-0 top-0 h-full w-72 max-w-[85%] flex flex-col ${theme.sidebarBg} border-r ${theme.divider}
                    shadow-xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex justify-end px-3 pt-3">
                    <button onClick={onClose} aria-label="Fermer le menu"
                        className={`w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${theme.toggleBg} ${theme.textMuted}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {open && (
                    <SidebarBody
                        theme={theme} isDark={isDark}
                        activePage={activePage} setActivePage={setActivePage}
                        toggleTheme={toggleTheme}
                        isConnected={isConnected}
                        onNavigate={onClose}
                    />
                )}
            </aside>
        </div>
    );
}

// ============================
// DONUT GAUGE (SVG)
// ============================
function DonutGauge({ value, max = 100, theme }) {
    const r   = 56;
    const cx  = 80;
    const cy  = 80;
    const circ = 2 * Math.PI * r;
    const fill = Math.min(value / max, 1) * circ;

    return (
        <svg width="160" height="160" viewBox="0 0 160 160">
            {/* Track */}
            <circle cx={cx} cy={cy} r={r} fill="none"
                stroke={theme.chartTrack} strokeWidth="14" />
            {/* Value arc */}
            <circle cx={cx} cy={cy} r={r} fill="none"
                stroke={theme.accentHex} strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${fill} ${circ}`}
                transform={`rotate(-90 ${cx} ${cy})`} />
            {/* Center value */}
            <text x={cx} y={cy - 6} textAnchor="middle"
                fill={theme.accentHex} fontSize="20" fontWeight="700">
                {value.toFixed(1)}%
            </text>
            <text x={cx} y={cy + 16} textAnchor="middle"
                fill={theme.chartText} fontSize="11">
                humidité
            </text>
        </svg>
    );
}

// ============================
// DASHBOARD HEADER (tabs + logo)
// ============================
const TIME_TABS = ['Jour', 'Semaine', 'Mois', 'Année'];

function DashboardHeader({ theme, activeTab, setActiveTab }) {
    return (
        <div className={`flex items-center justify-between gap-3 px-4 md:px-8 pt-5 md:pt-6 pb-0 border-b ${theme.divider}`}>
            {/* Logo */}
            <div className="flex items-center gap-2">
                <Sprout className={`w-6 h-6 ${theme.accent}`} />
                <span className={`text-lg font-bold ${theme.accent}`}>Agrivía</span>
            </div>
            {/* Tabs */}
            <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 md:gap-6">
                {TIME_TABS.map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`pb-2 md:pb-4 text-sm font-medium transition-all duration-150
                            ${activeTab === tab ? theme.tabActive : theme.tabInactive}`}>
                        {tab}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ============================
// SUMMARY CARD
// ============================
function SummaryCard({ theme, currentData }) {
    const sensors = currentData?.sensors || {};
    const date = currentData?.timestamp
        ? new Date(currentData.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    const items = [
        { label: 'Température',      value: sensors.temperature   != null ? sensors.temperature.toFixed(1)   : '--', unit: '°C'  },
        { label: "Humidité de l'air", value: sensors.air_humidity  != null ? sensors.air_humidity.toFixed(1)  : '--', unit: '%'   },
        { label: 'Humidité du sol',  value: sensors.soil_humidity != null ? sensors.soil_humidity.toFixed(1) : '--', unit: '%'   },
        { label: 'Luminosité',       value: sensors.light_level   != null ? sensors.light_level.toFixed(1)   : '--', unit: ' lux' },
    ];

    return (
        <div className={`mx-4 md:mx-8 mt-4 md:mt-6 rounded-2xl border ${theme.border} ${theme.summaryBg} px-4 md:px-6 py-4 flex flex-wrap items-center gap-4 md:gap-6`}>
            {/* Date */}
            <div className={`flex items-center gap-2 ${theme.textMuted} shrink-0`}>
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-medium">{date}</span>
            </div>

            <div className={`hidden sm:block w-px h-8 ${theme.divider} border-l`} />

            {/* Sensor values */}
            {items.map(({ label, value, unit }) => (
                <div key={label} className="flex flex-col gap-0.5">
                    <span className={`text-xs font-medium ${theme.textLabel} uppercase tracking-wide`}>{label}</span>
                    <span className={`text-xl font-bold ${theme.accent}`}>
                        {value}<span className={`text-sm font-normal ${theme.textMuted}`}>{unit}</span>
                    </span>
                </div>
            ))}
        </div>
    );
}

// ============================
// CARD WRAPPER
// ============================
function DataCard({ theme, title, icon: Icon, children }) {
    return (
        <div className={`rounded-2xl border ${theme.border} ${theme.cardBg} p-5 flex flex-col gap-4`}>
            <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${theme.accent}`} />
                <h3 className={`text-sm font-semibold ${theme.accent}`}>{title}</h3>
            </div>
            {children}
        </div>
    );
}

// ============================
// TEMPERATURE CARD
// ============================
function TemperatureCard({ theme, historyData }) {
    const data = [...historyData].reverse().map(item => ({
        time: item.timestamp
            ? new Date(item.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : '',
        value: item.sensors?.temperature ?? null,
    }));

    const tooltipStyle = {
        backgroundColor: theme.tooltipBg,
        border: `1px solid ${theme.tooltipBorder}`,
        borderRadius: '8px',
        color: theme.text === 'text-white' ? '#fff' : '#111',
        fontSize: '12px',
    };

    return (
        <DataCard theme={theme} title="Température" icon={Thermometer}>
            <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="gradTemp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={theme.accentHex} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={theme.accentHex} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: theme.chartText, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: theme.chartText, fontSize: 11 }} tickLine={false} axisLine={false} unit="°" />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}°C`, 'Température']} />
                    <Area type="monotone" dataKey="value" stroke={theme.accentHex} strokeWidth={2}
                        fill="url(#gradTemp)" dot={false} activeDot={{ r: 4, fill: theme.accentHex }} />
                </AreaChart>
            </ResponsiveContainer>
        </DataCard>
    );
}

// ============================
// AIR HUMIDITY CARD
// ============================
function AirHumidityCard({ theme, currentData }) {
    const value = currentData?.sensors?.air_humidity ?? 0;
    return (
        <DataCard theme={theme} title="Humidité de l'air" icon={Droplets}>
            <div className="flex items-center justify-center flex-1 py-2">
                <DonutGauge value={value} max={100} theme={theme} />
            </div>
        </DataCard>
    );
}

// ============================
// SOIL HUMIDITY CARD
// ============================
function SoilHumidityCard({ theme, historyData }) {
    const data = [...historyData].reverse().map(item => ({
        time: item.timestamp
            ? new Date(item.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : '',
        value: item.sensors?.soil_humidity ?? null,
    }));

    const tooltipStyle = {
        backgroundColor: theme.tooltipBg,
        border: `1px solid ${theme.tooltipBorder}`,
        borderRadius: '8px',
        color: theme.text === 'text-white' ? '#fff' : '#111',
        fontSize: '12px',
    };

    return (
        <DataCard theme={theme} title="Humidité du sol" icon={Leaf}>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: theme.chartText, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: theme.chartText, fontSize: 11 }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}%`, 'Humidité sol']} />
                    <Bar dataKey="value" fill={theme.accentHex} radius={[3, 3, 0, 0]} opacity={0.85} />
                </BarChart>
            </ResponsiveContainer>
        </DataCard>
    );
}

// ============================
// LUMINOSITY CARD
// ============================
function LuminosityCard({ theme, historyData }) {
    const data = [...historyData].reverse().map(item => ({
        time: item.timestamp
            ? new Date(item.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : '',
        value: item.sensors?.light_level ?? null,
    }));

    const tooltipStyle = {
        backgroundColor: theme.tooltipBg,
        border: `1px solid ${theme.tooltipBorder}`,
        borderRadius: '8px',
        color: theme.text === 'text-white' ? '#fff' : '#111',
        fontSize: '12px',
    };

    return (
        <DataCard theme={theme} title="Luminosité" icon={Zap}>
            <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="gradLux" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={theme.accentHex} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={theme.accentHex} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: theme.chartText, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: theme.chartText, fontSize: 11 }} tickLine={false} axisLine={false} unit=" lx" />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v} lux`, 'Luminosité']} />
                    <Area type="monotone" dataKey="value" stroke={theme.accentHex} strokeWidth={2}
                        fill="url(#gradLux)" dot={false} activeDot={{ r: 4, fill: theme.accentHex }} />
                </AreaChart>
            </ResponsiveContainer>
        </DataCard>
    );
}

// ============================
// DASHBOARD PAGE
// ============================
function DashboardPage({ theme, historyData, devices }) {
    const [activeTab, setActiveTab] = useState('Jour');

    // Collecter tous les serre_id connus (devices + history)
    const allSerreIds = [...new Set([
        ...devices.map(d => d.serre_id).filter(Boolean),
        ...historyData.map(h => h.serre_id).filter(Boolean),
    ])].sort();

    // Grouper l'historique par serre
    const historyBySerre = historyData.reduce((acc, entry) => {
        const s = entry.serre_id || 'Inconnue';
        (acc[s] = acc[s] || []).push(entry);
        return acc;
    }, {});

    // Dernière mesure par serre (l'historique est trié newest-first)
    const currentBySerre = Object.fromEntries(
        Object.entries(historyBySerre).map(([s, entries]) => [s, entries[0]])
    );

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader theme={theme} activeTab={activeTab} setActiveTab={setActiveTab} />

            <div className="px-4 md:px-8 pt-5 md:pt-6 pb-2">
                <h1 className={`text-xl md:text-2xl font-bold ${theme.text}`}>Tableau de bord</h1>
                <p className={`text-sm mt-1 ${theme.textMuted}`}>
                    {allSerreIds.length > 0
                        ? `${allSerreIds.length} serre${allSerreIds.length !== 1 ? 's' : ''} surveillée${allSerreIds.length !== 1 ? 's' : ''}`
                        : 'En attente de données…'}
                </p>
            </div>

            {allSerreIds.length === 0 ? (
                <div className="px-4 md:px-8 py-12 md:py-16 text-center">
                    <Sprout className={`w-12 h-12 mx-auto mb-3 ${theme.textMuted} opacity-30`} />
                    <p className={`${theme.textMuted} text-sm`}>Aucune donnée reçue — démarrez les simulateurs</p>
                </div>
            ) : (
                allSerreIds.map((serreId, idx) => {
                    const serreHistory     = historyBySerre[serreId] || [];
                    const serreCurrentData = currentBySerre[serreId] || null;
                    const serreDevices     = devices.filter(d => d.serre_id === serreId);
                    const onlineCount      = serreDevices.filter(d => d.status === 'online').length;

                    return (
                        <div key={serreId}>
                            {/* Séparateur entre serres */}
                            {idx > 0 && <div className={`mx-4 md:mx-8 mt-4 border-t ${theme.divider}`} />}

                            {/* En-tête serre */}
                            <div className="px-4 md:px-8 pt-5 md:pt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
                                <Sprout className={`w-5 h-5 ${theme.accent}`} />
                                <h2 className={`text-lg font-bold ${theme.text}`}>{serreId}</h2>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                                    ${onlineCount > 0 ? theme.badge : theme.badgeOff}`}>
                                    {onlineCount}/{serreDevices.length || '?'} module{serreDevices.length !== 1 ? 's' : ''} en ligne
                                </span>
                            </div>

                            <SummaryCard theme={theme} currentData={serreCurrentData} />

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 px-4 md:px-8 py-4 md:py-6">
                                <TemperatureCard  theme={theme} historyData={serreHistory} />
                                <AirHumidityCard  theme={theme} currentData={serreCurrentData} />
                                <SoilHumidityCard theme={theme} historyData={serreHistory} />
                                <LuminosityCard   theme={theme} historyData={serreHistory} />
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

// ============================
// ANALYSIS HELPERS
// computeStats lives in ./lib/sensors.js (imported above)
// ============================
function TrendArrow({ slope, unit, decimals = 1 }) {
    const abs = Math.abs(slope);
    if (abs < 0.05) return <span className="text-gray-400 font-medium">→ stable</span>;
    const up = slope > 0;
    return (
        <span className={`font-medium ${up ? 'text-orange-400' : 'text-blue-400'}`}>
            {up ? '↑' : '↓'} {abs.toFixed(decimals)}{unit} / mesure
        </span>
    );
}

// ============================
// ANALYSIS STAT CARD
// ============================
function AnalysisStatCard({ theme, title, icon: Icon, stats, unit, decimals = 1, color }) {
    const tooltipStyle = {
        backgroundColor: theme.tooltipBg,
        border: `1px solid ${theme.tooltipBorder}`,
        borderRadius: '8px',
        color: theme.text === 'text-white' ? '#fff' : '#111',
        fontSize: '12px',
    };

    return (
        <div className={`rounded-2xl border ${theme.border} ${theme.cardBg} p-5 flex flex-col gap-4`}>
            {/* Title */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" style={{ color }} />
                    <h3 className="text-sm font-semibold" style={{ color }}>{title}</h3>
                </div>
                <TrendArrow slope={stats.slope} unit={unit} decimals={decimals} />
            </div>

            {/* Min / Moy / Max */}
            <div className={`grid grid-cols-3 gap-2 py-3 border-y ${theme.divider}`}>
                {[['Min', stats.min], ['Moy', stats.avg], ['Max', stats.max]].map(([label, val]) => (
                    <div key={label} className="text-center">
                        <p className={`text-xs ${theme.textLabel} mb-1`}>{label}</p>
                        <p className={`text-base font-bold ${theme.text}`}>
                            {val != null ? val.toFixed(decimals) : '--'}
                            <span className={`text-xs font-normal ${theme.textMuted} ml-0.5`}>{unit}</span>
                        </p>
                    </div>
                ))}
            </div>

            {/* Prévision */}
            <div className="flex items-center justify-between">
                <span className={`text-xs ${theme.textMuted}`}>Prochaine mesure estimée</span>
                <span className="text-sm font-bold" style={{ color }}>
                    {stats.next != null ? stats.next.toFixed(decimals) : '--'}{unit}
                </span>
            </div>
        </div>
    );
}

// ============================
// OVERVIEW MULTI-LINE CHART
// ============================
const SENSOR_LINES = [
    { key: 'temperature',   label: 'Température (°C)',  color: '#f97316' },
    { key: 'air_humidity',  label: "Humidité air (%)",  color: '#60a5fa' },
    { key: 'soil_humidity', label: 'Humidité sol (%)',  color: '#4ade80' },
    { key: 'light_level',   label: 'Luminosité (÷10)', color: '#facc15' },
];

function OverviewChart({ theme, historyData }) {
    const data = [...historyData].reverse().map(item => ({
        time: item.timestamp
            ? new Date(item.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : '',
        temperature:   item.sensors?.temperature   ?? null,
        air_humidity:  item.sensors?.air_humidity  ?? null,
        soil_humidity: item.sensors?.soil_humidity ?? null,
        light_level:   item.sensors?.light_level != null ? item.sensors.light_level / 10 : null,
    }));

    const tooltipStyle = {
        backgroundColor: theme.tooltipBg,
        border: `1px solid ${theme.tooltipBorder}`,
        borderRadius: '8px',
        color: theme.text === 'text-white' ? '#fff' : '#111',
        fontSize: '12px',
    };

    return (
        <div className={`rounded-2xl border ${theme.border} ${theme.cardBg} p-5 flex flex-col md:flex-1 md:min-h-0`}>
            <h3 className={`text-sm font-semibold ${theme.text} mb-4 shrink-0`}>Vue d'ensemble — toutes les mesures</h3>
            <div className="h-[240px] md:h-auto md:flex-1 md:min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
                        <XAxis dataKey="time" tick={{ fill: theme.chartText, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: theme.chartText, fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px', color: theme.chartText }} />
                        {SENSOR_LINES.map(({ key, label, color }) => (
                            <Line key={key} type="monotone" dataKey={key} name={label}
                                stroke={color} strokeWidth={2} dot={false}
                                activeDot={{ r: 4, fill: color }} connectNulls />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <p className={`text-xs ${theme.textMuted} mt-2 shrink-0`}>
                * Luminosité divisée par 10 pour l'affichage comparatif
            </p>
        </div>
    );
}

// ============================
// ANALYSIS PAGE
// ============================
function AnalysisPage({ theme, currentData, historyData }) {
    const sensors = [
        {
            key: 'temperature',   title: 'Température',      icon: Thermometer,
            unit: '°C',  decimals: 1, color: '#f97316',
        },
        {
            key: 'air_humidity',  title: "Humidité de l'air", icon: Droplets,
            unit: '%',   decimals: 1, color: '#60a5fa',
        },
        {
            key: 'soil_humidity', title: 'Humidité du sol',  icon: Leaf,
            unit: '%',   decimals: 1, color: '#4ade80',
        },
        {
            key: 'light_level',   title: 'Luminosité',       icon: Zap,
            unit: ' lux', decimals: 0, color: '#facc15',
        },
    ];

    // Calculer les stats pour chaque capteur à partir de l'historique
    const statsMap = Object.fromEntries(
        sensors.map(({ key }) => [
            key,
            computeStats(historyData.map(item => item.sensors?.[key] ?? null)),
        ])
    );

    return (
        <div className="flex flex-col min-h-screen md:h-screen md:overflow-hidden">
            {/* Header */}
            <div className={`px-4 md:px-8 pt-5 md:pt-8 pb-4 md:pb-6 border-b ${theme.divider} shrink-0`}>
                <h1 className={`text-xl md:text-2xl font-bold ${theme.text}`}>Analyse et prévisions</h1>
                <p className={`text-sm mt-1 ${theme.textMuted}`}>
                    Basé sur les {historyData.length} dernières mesures
                </p>
            </div>

            <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4 md:gap-6 md:flex-1 md:min-h-0">
                {/* Overview chart */}
                <OverviewChart theme={theme} historyData={historyData} />

                {/* Stat cards 2×2 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 shrink-0">
                    {sensors.map(({ key, title, icon, unit, decimals, color }) => (
                        <AnalysisStatCard
                            key={key}
                            theme={theme}
                            title={title}
                            icon={icon}
                            stats={statsMap[key]}
                            unit={unit}
                            decimals={decimals}
                            color={color}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================
// HISTORY PAGE
// ============================
function ActuatorDot({ active, label }) {
    return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full
            ${active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-400' : 'bg-gray-500'}`} />
            {label}
        </span>
    );
}

function HistoryPage({ theme, historyData, thresholds }) {
    const [sortAsc, setSortAsc] = useState(false);

    const rows = sortAsc ? [...historyData].reverse() : historyData;

    const tempLimit = thresholds?.temp_high ?? 28;
    const soilLimit = thresholds?.soil_low  ?? 30;

    const isTempCritical = v => v != null && v > tempLimit;
    const isSoilCritical = v => v != null && v < soilLimit;

    const fmt = (v, d = 1) => v != null ? v.toFixed(d) : '—';

    const fmtDate = ts => {
        if (!ts) return '—';
        const d = new Date(ts);
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
            + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="flex flex-col min-h-screen">
            {/* Header */}
            <div className={`px-4 md:px-8 pt-5 md:pt-8 pb-4 md:pb-6 border-b ${theme.divider}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h1 className={`text-xl md:text-2xl font-bold ${theme.text}`}>Historique</h1>
                        <p className={`text-sm mt-1 ${theme.textMuted}`}>
                            {historyData.length} mesure{historyData.length > 1 ? 's' : ''} enregistrée{historyData.length > 1 ? 's' : ''}
                        </p>
                    </div>
                    <button
                        onClick={() => setSortAsc(s => !s)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${theme.border} ${theme.cardBg} ${theme.textMuted} hover:${theme.text} transition-colors`}>
                        {sortAsc ? '↑ Plus ancien d\'abord' : '↓ Plus récent d\'abord'}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="px-4 md:px-8 py-4 md:py-6">
                {historyData.length === 0 ? (
                    <div className={`rounded-2xl border ${theme.border} ${theme.cardBg} p-12 text-center`}>
                        <History className={`w-12 h-12 mx-auto mb-3 ${theme.textMuted} opacity-40`} />
                        <p className={theme.textMuted}>Aucune donnée disponible — en attente du simulateur</p>
                    </div>
                ) : (
                    <>
                    {/* ── Desktop table (≥768px) ─────────────────────── */}
                    <div className={`hidden md:block rounded-2xl border ${theme.border} ${theme.cardBg} overflow-hidden`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                {/* Head */}
                                <thead>
                                    <tr className={`border-b ${theme.divider}`}>
                                        {['Horodatage', 'Temp.', 'Hum. air', 'Hum. sol', 'Luminosité', 'Actionneurs', 'Action IA'].map(h => (
                                            <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${theme.textLabel}`}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>

                                {/* Body */}
                                <tbody>
                                    {rows.map((row, i) => {
                                        const s  = row.sensors   || {};
                                        const a  = row.actuators || {};
                                        const ai = row.ai_context;
                                        const isEven = i % 2 === 0;

                                        return (
                                            <tr key={i}
                                                className={`border-b ${theme.divider} last:border-0 transition-colors
                                                    ${isEven ? '' : (theme.mainBg === 'bg-[#0f1117]' ? 'bg-white/[0.02]' : 'bg-black/[0.02]')}`}>

                                                {/* Horodatage */}
                                                <td className={`px-4 py-3 font-mono text-xs ${theme.textMuted} whitespace-nowrap`}>
                                                    {fmtDate(row.timestamp)}
                                                </td>

                                                {/* Température */}
                                                <td className={`px-4 py-3 font-semibold whitespace-nowrap
                                                    ${isTempCritical(s.temperature) ? 'text-orange-400' : theme.text}`}>
                                                    {fmt(s.temperature)}°C
                                                </td>

                                                {/* Humidité air */}
                                                <td className={`px-4 py-3 whitespace-nowrap ${theme.text}`}>
                                                    {fmt(s.air_humidity)}%
                                                </td>

                                                {/* Humidité sol */}
                                                <td className={`px-4 py-3 font-semibold whitespace-nowrap
                                                    ${isSoilCritical(s.soil_humidity) ? 'text-blue-400' : theme.text}`}>
                                                    {fmt(s.soil_humidity)}%
                                                </td>

                                                {/* Luminosité */}
                                                <td className={`px-4 py-3 whitespace-nowrap ${theme.text}`}>
                                                    {s.light_level != null ? s.light_level : '—'} lux
                                                </td>

                                                {/* Actionneurs */}
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        <ActuatorDot active={a.pump?.state}       label="Pompe" />
                                                        <ActuatorDot active={a.fan?.state}        label="Fan" />
                                                        <ActuatorDot active={a.grow_light?.state} label="LED" />
                                                    </div>
                                                </td>

                                                {/* Action IA */}
                                                <td className={`px-4 py-3 text-xs max-w-xs ${theme.textMuted}`}>
                                                    {ai?.last_action || '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className={`px-4 py-3 border-t ${theme.divider} flex items-center justify-between`}>
                            <span className={`text-xs ${theme.textMuted}`}>
                                {historyData.length} / 20 entrées max (mémoire backend)
                            </span>
                            <div className="flex gap-3 text-xs">
                                <span className="flex items-center gap-1 text-orange-400">
                                    <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                                    Température &gt; {tempLimit}°C
                                </span>
                                <span className="flex items-center gap-1 text-blue-400">
                                    <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                                    Sol &lt; {soilLimit}%
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── Mobile stacked cards (<768px) ──────────────── */}
                    <div className="md:hidden flex flex-col gap-3">
                        {rows.map((row, i) => {
                            const s  = row.sensors   || {};
                            const a  = row.actuators || {};
                            const ai = row.ai_context;

                            return (
                                <div key={i}
                                    className={`rounded-2xl border ${theme.border} ${theme.cardBg} p-4 flex flex-col gap-3`}>
                                    {/* Horodatage */}
                                    <div className={`font-mono text-xs ${theme.textMuted}`}>
                                        {fmtDate(row.timestamp)}
                                    </div>

                                    {/* Sensor values */}
                                    <div className={`grid grid-cols-2 gap-2 py-2 border-y ${theme.divider}`}>
                                        <div>
                                            <p className={`text-xs ${theme.textLabel}`}>Température</p>
                                            <p className={`text-sm font-semibold
                                                ${isTempCritical(s.temperature) ? 'text-orange-400' : theme.text}`}>
                                                {fmt(s.temperature)}°C
                                            </p>
                                        </div>
                                        <div>
                                            <p className={`text-xs ${theme.textLabel}`}>Hum. air</p>
                                            <p className={`text-sm font-semibold ${theme.text}`}>{fmt(s.air_humidity)}%</p>
                                        </div>
                                        <div>
                                            <p className={`text-xs ${theme.textLabel}`}>Hum. sol</p>
                                            <p className={`text-sm font-semibold
                                                ${isSoilCritical(s.soil_humidity) ? 'text-blue-400' : theme.text}`}>
                                                {fmt(s.soil_humidity)}%
                                            </p>
                                        </div>
                                        <div>
                                            <p className={`text-xs ${theme.textLabel}`}>Luminosité</p>
                                            <p className={`text-sm font-semibold ${theme.text}`}>
                                                {s.light_level != null ? s.light_level : '—'} lux
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actionneurs */}
                                    <div>
                                        <p className={`text-xs ${theme.textLabel} mb-1.5`}>Actionneurs</p>
                                        <div className="flex flex-wrap gap-1">
                                            <ActuatorDot active={a.pump?.state}       label="Pompe" />
                                            <ActuatorDot active={a.fan?.state}        label="Fan" />
                                            <ActuatorDot active={a.grow_light?.state} label="LED" />
                                        </div>
                                    </div>

                                    {/* Action IA */}
                                    <div>
                                        <p className={`text-xs ${theme.textLabel} mb-1`}>Action IA</p>
                                        <p className={`text-xs ${theme.textMuted}`}>{ai?.last_action || '—'}</p>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Footer / légende */}
                        <div className={`rounded-2xl border ${theme.border} ${theme.cardBg} px-4 py-3 flex flex-col gap-2`}>
                            <span className={`text-xs ${theme.textMuted}`}>
                                {historyData.length} / 20 entrées max (mémoire backend)
                            </span>
                            <div className="flex flex-wrap gap-3 text-xs">
                                <span className="flex items-center gap-1 text-orange-400">
                                    <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                                    Température &gt; {tempLimit}°C
                                </span>
                                <span className="flex items-center gap-1 text-blue-400">
                                    <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                                    Sol &lt; {soilLimit}%
                                </span>
                            </div>
                        </div>
                    </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ============================
// MONITORING PAGE
// ============================
function SignalBars({ rssi }) {
    const level = rssiLevel(rssi);
    return (
        <div className="flex items-end gap-0.5 h-4">
            {[1, 2, 3, 4].map(i => (
                <div key={i}
                    style={{ height: `${i * 4}px` }}
                    className={`w-1.5 rounded-sm ${i <= level ? 'bg-green-400' : 'bg-gray-600'}`}
                />
            ))}
        </div>
    );
}

// uptimeStr lives in ./lib/sensors.js (imported above)

function DeviceCard({ theme, device }) {
    const isOnline = device.status === 'online';
    const isDarkMode = theme.mainBg === 'bg-[#0f1117]';

    const lastSeen = device.last_seen
        ? new Date(device.last_seen).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—';

    const sensors   = device.sensors   || {};
    const actuators = device.actuators || {};

    const sensorRows = [
        { label: 'Température', value: sensors.temperature  != null ? sensors.temperature.toFixed(1)  : null, unit: '°C',   icon: Thermometer },
        { label: 'Hum. air',    value: sensors.air_humidity != null ? sensors.air_humidity.toFixed(1)  : null, unit: '%',    icon: Droplets },
        { label: 'Hum. sol',    value: sensors.soil_humidity!= null ? sensors.soil_humidity.toFixed(1) : null, unit: '%',    icon: Leaf },
        { label: 'Luminosité',  value: sensors.light_level  != null ? sensors.light_level              : null, unit: ' lux', icon: Zap },
    ];

    const hasSensors   = sensorRows.some(s => s.value != null);
    const hasActuators = Object.keys(actuators).length > 0;

    return (
        <div className={`rounded-2xl border ${theme.border} ${theme.cardBg} p-5 flex flex-col gap-4`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Monitor className={`w-4 h-4 ${theme.accent}`} />
                    <h3 className={`text-sm font-semibold ${theme.text}`}>{device.esp_id}</h3>
                    {device.serre_id && (
                        <span className={`text-xs ${theme.textMuted}`}>· {device.serre_id}</span>
                    )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOnline ? theme.badge : theme.badgeOff}`}>
                    {isOnline ? '● En ligne' : '○ Hors ligne'}
                </span>
            </div>

            {/* Meta: last seen / uptime / WiFi */}
            <div className={`grid grid-cols-3 gap-3 py-3 border-y ${theme.divider} text-center`}>
                <div>
                    <p className={`text-xs ${theme.textLabel} mb-1`}>Dernière vue</p>
                    <p className={`text-xs font-medium ${theme.text}`}>{lastSeen}</p>
                </div>
                <div>
                    <p className={`text-xs ${theme.textLabel} mb-1`}>Uptime</p>
                    <p className={`text-xs font-medium ${theme.text}`}>{uptimeStr(device.uptime_s)}</p>
                </div>
                <div>
                    <p className={`text-xs ${theme.textLabel} mb-1`}>WiFi</p>
                    <div className="flex items-center justify-center gap-1.5">
                        <SignalBars rssi={device.wifi_rssi} />
                        <span className={`text-xs ${theme.textMuted}`}>
                            {device.wifi_rssi != null ? `${device.wifi_rssi} dBm` : '—'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Sensors */}
            {hasSensors && (
                <div>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${theme.textLabel} mb-2`}>Capteurs</p>
                    <div className="grid grid-cols-2 gap-2">
                        {sensorRows.map(({ label, value, unit, icon: Icon }) => (
                            <div key={label}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDarkMode ? 'bg-black/20' : 'bg-gray-50'}`}>
                                <Icon className={`w-3.5 h-3.5 shrink-0 ${theme.textMuted}`} />
                                <div>
                                    <p className={`text-xs ${theme.textLabel}`}>{label}</p>
                                    <p className={`text-sm font-semibold ${theme.text}`}>
                                        {value != null ? `${value}${unit}` : '—'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Actuators */}
            {hasActuators && (
                <div>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${theme.textLabel} mb-2`}>Actionneurs</p>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { key: 'pump',       label: 'Pompe',        icon: Waves },
                            { key: 'fan',        label: 'Ventilateur',  icon: Fan },
                            { key: 'grow_light', label: 'LED',          icon: Lightbulb },
                        ].map(({ key, label, icon: Icon }) => {
                            const active = actuators[key]?.state || false;
                            return (
                                <div key={key}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                                        ${active ? theme.badge : theme.badgeOff}`}>
                                    <Icon className="w-3.5 h-3.5" />
                                    {label}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Firmware */}
            {device.firmware_version && (
                <p className={`text-xs ${theme.textMuted}`}>
                    Firmware : <span className="font-mono">{device.firmware_version}</span>
                </p>
            )}
        </div>
    );
}

function MonitoringPage({ theme, devices }) {
    const online = devices.filter(d => d.status === 'online').length;

    const serreGroups = devices.reduce((acc, dev) => {
        const s = dev.serre_id || 'Inconnue';
        (acc[s] = acc[s] || []).push(dev);
        return acc;
    }, {});

    return (
        <div className="flex flex-col min-h-screen">
            {/* Header */}
            <div className={`px-4 md:px-8 pt-5 md:pt-8 pb-4 md:pb-6 border-b ${theme.divider}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h1 className={`text-xl md:text-2xl font-bold ${theme.text}`}>Monitoring</h1>
                        <p className={`text-sm mt-1 ${theme.textMuted}`}>
                            {Object.keys(serreGroups).length} serre{Object.keys(serreGroups).length !== 1 ? 's' : ''} — {devices.length} module{devices.length !== 1 ? 's' : ''} — {online} en ligne
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${online > 0 ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
                        <span className={`text-sm font-medium ${online > 0 ? theme.accent : theme.textMuted}`}>
                            {online > 0 ? 'Réseau actif' : 'Aucun appareil en ligne'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Cards groupées par serre */}
            <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col gap-6 md:gap-8">
                {devices.length === 0 ? (
                    <div className={`rounded-2xl border ${theme.border} ${theme.cardBg} p-12 text-center`}>
                        <Monitor className={`w-12 h-12 mx-auto mb-3 ${theme.textMuted} opacity-40`} />
                        <p className={theme.textMuted}>Aucun appareil détecté — en attente de connexions ESP32</p>
                    </div>
                ) : (
                    Object.entries(serreGroups).map(([serreId, devs]) => {
                        const onlineInSerre = devs.filter(d => d.status === 'online').length;
                        return (
                            <div key={serreId}>
                                {/* Serre header */}
                                <div className="flex items-center gap-3 mb-4">
                                    <Sprout className={`w-4 h-4 ${theme.accent}`} />
                                    <h2 className={`text-base font-semibold ${theme.text}`}>{serreId}</h2>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${onlineInSerre > 0 ? theme.badge : theme.badgeOff}`}>
                                        {onlineInSerre}/{devs.length} en ligne
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
                                    {devs.map(device => (
                                        <DeviceCard key={device.esp_id} theme={theme} device={device} />
                                    ))}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ============================
// PLACEHOLDER
// ============================
function PlaceholderPage({ theme, label }) {
    return (
        <div className="flex items-center justify-center h-64">
            <p className={`text-lg ${theme.textMuted}`}>{label} — à venir</p>
        </div>
    );
}

// ============================
// CONTROL CARD (+/-)
// ============================
function ControlCard({ theme, title, icon: Icon, currentValue, unit, target, step, decimals, onIncrease, onDecrease }) {
    return (
        <div className={`rounded-2xl border ${theme.border} ${theme.cardBg} p-6 flex flex-col gap-5`}>
            {/* Title */}
            <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${theme.accent}`} />
                <h3 className={`text-sm font-semibold ${theme.accent}`}>{title}</h3>
            </div>

            {/* Current value */}
            <div className="flex items-baseline gap-1 justify-center py-2">
                <span className={`text-5xl font-bold ${theme.accent}`}>
                    {typeof currentValue === 'number' ? currentValue.toFixed(decimals) : '--'}
                </span>
                <span className={`text-xl ${theme.textMuted}`}>{unit}</span>
            </div>

            {/* +/- buttons */}
            <div className="flex items-center justify-center gap-5">
                <button onClick={onDecrease}
                    className={`w-11 h-11 rounded-full flex items-center justify-center font-bold transition-all duration-150 ${theme.btnMinus}`}>
                    <Minus className="w-5 h-5" />
                </button>
                <button onClick={onIncrease}
                    className={`w-11 h-11 rounded-full flex items-center justify-center font-bold transition-all duration-150 ${theme.btnPlus}`}>
                    <Plus className="w-5 h-5" />
                </button>
            </div>

            {/* Target value */}
            <p className={`text-center text-sm ${theme.textMuted}`}>
                {title} voulue :{' '}
                <span className={`font-semibold ${theme.text}`}>
                    {typeof target === 'number' ? target.toFixed(decimals) : '--'}{unit}
                </span>
            </p>
        </div>
    );
}

// ============================
// ACTUATOR SWITCH (MUI)
// ============================
function ActuatorSwitch({ theme, label, icon: Icon, isActive, onToggle, disabled }) {
    return (
        <div className={`flex items-center justify-between p-4 rounded-xl border ${theme.border} ${theme.cardBg}`}>
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg transition-colors ${isActive ? theme.badge : theme.badgeOff}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className={`text-sm font-medium ${theme.text}`}>{label}</p>
                    <p className={`text-xs font-medium ${isActive ? theme.accent : theme.textMuted}`}>
                        {isActive ? 'Actif' : 'Inactif'}
                    </p>
                </div>
            </div>

            <ThemeProvider theme={muiTheme}>
                <Switch
                    checked={isActive}
                    onChange={onToggle}
                    disabled={disabled}
                    color="primary"
                />
            </ThemeProvider>
        </div>
    );
}

// ============================
// MODULE CARD (pilotage)
// ============================
function ModuleCard({ theme, device, isManual, onSendCommand }) {
    const sensors   = device.sensors   || {};
    const actuators = device.actuators || {};
    const isOnline  = device.status === 'online';
    const isDarkMode = theme.mainBg === 'bg-[#0f1117]';

    const sensorItems = [
        { label: 'Température', value: sensors.temperature   != null ? `${sensors.temperature.toFixed(1)}°C`   : '—', icon: Thermometer },
        { label: 'Hum. air',    value: sensors.air_humidity  != null ? `${sensors.air_humidity.toFixed(1)}%`   : '—', icon: Droplets },
        { label: 'Hum. sol',    value: sensors.soil_humidity != null ? `${sensors.soil_humidity.toFixed(1)}%`  : '—', icon: Leaf },
        { label: 'Luminosité',  value: sensors.light_level   != null ? `${sensors.light_level} lux`            : '—', icon: Zap },
    ];

    return (
        <div className={`rounded-2xl border ${theme.border} ${theme.cardBg} p-5 flex flex-col gap-4`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Monitor className={`w-4 h-4 ${theme.accent}`} />
                    <span className={`text-sm font-semibold ${theme.text}`}>{device.esp_id}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOnline ? theme.badge : theme.badgeOff}`}>
                    {isOnline ? '● En ligne' : '○ Hors ligne'}
                </span>
            </div>

            {/* Sensors (lecture seule) */}
            <div className="grid grid-cols-2 gap-2">
                {sensorItems.map(({ label, value, icon: Icon }) => (
                    <div key={label}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDarkMode ? 'bg-black/20' : 'bg-gray-50'}`}>
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${theme.textMuted}`} />
                        <div>
                            <p className={`text-xs ${theme.textLabel}`}>{label}</p>
                            <p className={`text-sm font-semibold ${theme.text}`}>{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Actionneurs */}
            <div className={`pt-3 border-t ${theme.divider} flex flex-col gap-2`}>
                {[
                    { actuatorKey: 'pump',  registryKey: 'pump',       label: 'Pompe',         icon: Waves },
                    { actuatorKey: 'fan',   registryKey: 'fan',        label: 'Ventilateur',   icon: Fan },
                    { actuatorKey: 'led',   registryKey: 'grow_light', label: 'Éclairage LED', icon: Lightbulb },
                ].map(({ actuatorKey, registryKey, label, icon: Icon }) => (
                    <ActuatorSwitch
                        key={actuatorKey}
                        theme={theme}
                        label={label}
                        icon={Icon}
                        isActive={actuators[registryKey]?.state || false}
                        disabled={!isManual || !isOnline}
                        onToggle={(_, checked) => onSendCommand(device.esp_id, device.serre_id, actuatorKey, checked)}
                    />
                ))}
            </div>

            {!isOnline && (
                <p className={`text-xs text-center ${theme.textMuted}`}>Module hors ligne — commandes indisponibles</p>
            )}
        </div>
    );
}

// ============================
// MANUAL PAGE
// ============================
function ManualPage({ theme, currentData, thresholds, onThresholdsChange, devices }) {
    const [mode, setMode]           = useState('auto');
    const [airTarget, setAirTarget] = useState(60);
    const [sending, setSending]     = useState(false);

    // Grouper les modules par serre
    const serreGroups = devices.reduce((acc, dev) => {
        const s = dev.serre_id || 'Inconnue';
        (acc[s] = acc[s] || []).push(dev);
        return acc;
    }, {});

    // Seuils → cibles d'affichage dans les ControlCards
    const sensors = currentData?.sensors || {};
    const targets = {
        temp:  thresholds.temp_high,
        air:   airTarget,
        soil:  thresholds.soil_low,
        light: thresholds.light_low,
    };

    // Charger le mode actuel depuis le backend
    useEffect(() => {
        fetch(`${BACKEND_API_URL}/api/autopilot`)
            .then(r => r.json())
            .then(({ enabled }) => setMode(enabled ? 'auto' : 'manual'))
            .catch(() => {});
    }, []);

    const toggleMode = async () => {
        const next = mode === 'auto' ? 'manual' : 'auto';
        await fetch(`${BACKEND_API_URL}/api/autopilot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: next === 'auto' }),
        }).catch(() => {});
        setMode(next);
    };

    const adjust = async (key, delta) => {
        if (key === 'air') { setAirTarget(v => +(v + delta).toFixed(1)); return; }
        const patch = thresholdPatch(key, thresholds, delta);
        if (!patch) return;
        onThresholdsChange({ ...thresholds, ...patch });
        await fetch(`${BACKEND_API_URL}/api/thresholds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        }).catch(() => {});
    };

    const sendCommand = async (espId, serreId, actuatorName, newState) => {
        if (sending) return;
        setSending(true);
        const commands = { [actuatorName]: { state: newState } };
        if (actuatorName === 'led') commands.led.intensity_pct = newState ? 80 : 0;
        await fetch(`${BACKEND_API_URL}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'manual_command', esp_id: espId, serre_id: serreId, source: 'manual', commands }),
        }).catch(() => {});
        setSending(false);
    };

    const isManual = mode === 'manual';

    return (
        <div className="flex flex-col min-h-screen">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className={`px-4 md:px-8 pt-5 md:pt-8 pb-4 md:pb-6 border-b ${theme.divider}`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h1 className={`text-xl md:text-2xl font-bold ${theme.text}`}>Pilotage manuel</h1>
                        <p className={`text-sm mt-1 ${theme.textMuted}`}>
                            {isManual
                                ? 'Contrôle direct des actionneurs — autopilote désactivé'
                                : "L'autopilote ajuste automatiquement selon les seuils ci-dessous"}
                        </p>
                    </div>
                    <div className={`flex items-center p-1 rounded-xl border ${theme.border} ${theme.cardBg}`}>
                        <button onClick={toggleMode}
                            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                                ${!isManual ? 'bg-green-500 text-white shadow-sm' : theme.textMuted}`}>
                            <Bot className="w-4 h-4" />
                            Automatique
                        </button>
                        <button onClick={toggleMode}
                            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                                ${isManual ? 'bg-green-500 text-white shadow-sm' : theme.textMuted}`}>
                            <SlidersHorizontal className="w-4 h-4" />
                            Manuel
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Seuils globaux (ControlCards) ──────────────────── */}
            <div className="px-4 md:px-8 pt-5 md:pt-6">
                <p className={`text-xs font-semibold uppercase tracking-wide ${theme.textLabel} mb-4`}>
                    Seuils autopilote — appliqués à tous les modules
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
                    <ControlCard
                        theme={theme} title="Température" icon={Thermometer}
                        currentValue={sensors.temperature} unit="°C"
                        target={targets.temp} step={0.5} decimals={1}
                        onIncrease={() => adjust('temp', 0.5)}
                        onDecrease={() => adjust('temp', -0.5)}
                    />
                    <ControlCard
                        theme={theme} title="Humidité de l'air" icon={Droplets}
                        currentValue={sensors.air_humidity} unit="%"
                        target={targets.air} step={1} decimals={1}
                        onIncrease={() => adjust('air', 1)}
                        onDecrease={() => adjust('air', -1)}
                    />
                    <ControlCard
                        theme={theme} title="Humidité du sol" icon={Leaf}
                        currentValue={sensors.soil_humidity} unit="%"
                        target={targets.soil} step={1} decimals={1}
                        onIncrease={() => adjust('soil', 1)}
                        onDecrease={() => adjust('soil', -1)}
                    />
                    <ControlCard
                        theme={theme} title="Luminosité" icon={Zap}
                        currentValue={sensors.light_level} unit=" lux"
                        target={targets.light} step={50} decimals={0}
                        onIncrease={() => adjust('light', 50)}
                        onDecrease={() => adjust('light', -50)}
                    />
                </div>
            </div>

            {/* ── Modules par serre ──────────────────────────────── */}
            <div className="px-4 md:px-8 py-5 md:py-8 flex flex-col gap-6 md:gap-8">
                {devices.length === 0 ? (
                    <div className={`rounded-2xl border ${theme.border} ${theme.cardBg} p-12 text-center`}>
                        <Monitor className={`w-12 h-12 mx-auto mb-3 ${theme.textMuted} opacity-40`} />
                        <p className={`${theme.textMuted} text-sm`}>Aucun module détecté — en attente de connexions</p>
                    </div>
                ) : (
                    Object.entries(serreGroups).map(([serreId, devs]) => {
                        const onlineCount = devs.filter(d => d.status === 'online').length;
                        return (
                            <div key={serreId}>
                                {/* En-tête serre */}
                                <div className="flex items-center gap-3 mb-4">
                                    <Sprout className={`w-4 h-4 ${theme.accent}`} />
                                    <h2 className={`text-base font-semibold ${theme.text}`}>{serreId}</h2>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${onlineCount > 0 ? theme.badge : theme.badgeOff}`}>
                                        {onlineCount}/{devs.length} en ligne
                                    </span>
                                    {isManual
                                        ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${theme.badge}`}>Contrôle direct actif</span>
                                        : <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${theme.badgeOff}`}>Géré par l'autopilote</span>
                                    }
                                </div>

                                {/* Cards des modules */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
                                    {devs.map(device => (
                                        <ModuleCard
                                            key={device.esp_id}
                                            theme={theme}
                                            device={device}
                                            isManual={isManual}
                                            onSendCommand={sendCommand}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })
                )}

                {!isManual && devices.length > 0 && (
                    <p className={`text-xs text-center ${theme.textMuted}`}>
                        Passez en mode <span className="font-medium">Manuel</span> pour contrôler les actionneurs directement.
                    </p>
                )}
            </div>
        </div>
    );
}

// ============================
// MAIN APP
// ============================
export default function App() {
    const [isDark, setIsDark]         = useState(true);
    const [activePage, setActivePage] = useState('dashboard');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [currentData, setCurrentData] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [devices, setDevices]         = useState([]);
    const [thresholds, setThresholds] = useState({
        temp_high: 28, temp_low: 24,
        soil_low:  30, soil_high: 60,
        light_low: 300, light_high: 800,
    });

    const wsRef        = useRef(null);
    const reconnectRef = useRef(null);
    const theme        = isDark ? THEMES.dark : THEMES.light;

    useEffect(() => {
        // Historique
        fetch(`${BACKEND_API_URL}/api/history`)
            .then(r => r.json())
            .then(data => {
                if (data.length > 0) { setHistoryData(data); setCurrentData(data[0]); }
            })
            .catch(() => {});

        // Seuils autopilote
        fetch(`${BACKEND_API_URL}/api/autopilot`)
            .then(r => r.json())
            .then(({ thresholds: t }) => { if (t) setThresholds(t); })
            .catch(() => {});

        // Appareils connus
        fetch(`${BACKEND_API_URL}/api/devices`)
            .then(r => r.json())
            .then(data => { if (Array.isArray(data)) setDevices(data); })
            .catch(() => {});

        const connect = () => {
            const ws = new WebSocket(BACKEND_WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
                if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
            };
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.type === 'update') {
                    setCurrentData(msg.data);
                    setHistoryData(prev => applyWsMessage(msg, { historyData: prev }).historyData);
                } else if (msg.type === 'history') {
                    const patch = applyWsMessage(msg, {});
                    setHistoryData(patch.historyData);
                    if (patch.currentData !== undefined) setCurrentData(patch.currentData);
                } else if (msg.type === 'devices') {
                    setDevices(applyWsMessage(msg, {}).devices);
                }
            };
            ws.onclose = () => { setIsConnected(false); reconnectRef.current = setTimeout(connect, 3000); };
            ws.onerror = () => ws.close();
        };

        connect();
        return () => {
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
        };
    }, []);

    const renderPage = () => {
        switch (activePage) {
            case 'dashboard':  return <DashboardPage theme={theme} historyData={historyData} devices={devices} />;
            case 'manual':     return <ManualPage theme={theme} currentData={currentData} thresholds={thresholds} onThresholdsChange={setThresholds} devices={devices} />;
            case 'analysis':   return <AnalysisPage theme={theme} currentData={currentData} historyData={historyData} />;
            case 'history':    return <HistoryPage theme={theme} historyData={historyData} thresholds={thresholds} />;
            case 'monitoring': return <MonitoringPage theme={theme} devices={devices} />;
            default:           return <PlaceholderPage theme={theme} label={NAV_MAIN.find(n => n.id === activePage)?.label || activePage} />;
        }
    };

    return (
        <div className={`flex min-h-screen ${theme.mainBg} transition-colors duration-300`}>
            <Sidebar
                theme={theme} isDark={isDark}
                activePage={activePage} setActivePage={setActivePage}
                toggleTheme={() => setIsDark(d => !d)}
            />
            <MobileDrawer
                theme={theme} isDark={isDark}
                activePage={activePage} setActivePage={setActivePage}
                toggleTheme={() => setIsDark(d => !d)}
                isConnected={isConnected}
                open={mobileNavOpen} onClose={() => setMobileNavOpen(false)}
            />
            <div className="flex-1 flex flex-col min-w-0">
                <MobileTopBar
                    theme={theme} isConnected={isConnected}
                    onOpenMenu={() => setMobileNavOpen(true)}
                />
                <main className="flex-1 overflow-auto">
                    {renderPage()}
                </main>
            </div>
        </div>
    );
}
