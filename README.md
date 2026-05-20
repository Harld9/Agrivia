# Agrivia

## Architecture

```
[ESP32 sim]  ──MQTT──►  [Mosquitto]  ──MQTT──►  [Gateway sim]  ──WebSocket──►  [Backend]
  capteurs               broker local              Raspberry Pi                  Node.js
```

Chaque élément physique du projet est émulé dans un conteneur Docker :

| Conteneur | Émule | Rôle |
|---|---|---|
| `mosquitto` | Raspberry Pi (broker) | Reçoit les messages MQTT des ESP32 |
| `esp32_sim_1` / `esp32_sim_2` | ESP32 | Publie de fausses données capteurs toutes les 10s |
| `gateway_sim` | Raspberry Pi (gateway) | Relaie MQTT → WebSocket vers le backend |
| `backend` | Serveur Node.js | API + WebSocket (à développer) |
| `postgres` | Base de données | Stockage des données |

---

## Lancer la simulation

### Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé et démarré

### Sans backend (tester les capteurs uniquement)

```bash
docker compose up --build mosquitto esp32_sim_1 esp32_sim_2
```

### Tout lancer

```bash
docker compose up --build
```

### Voir les messages MQTT en temps réel

```bash
docker exec -it agrivia_mosquitto mosquitto_sub -h localhost -t "serre/#" -v
```

### Stopper

```bash
# Arrêter
Ctrl+C

# Supprimer les conteneurs et le réseau
docker compose down
```

---

## Structure du projet

```
Agrivia/
├── docker-compose.yml
├── mosquitto/
│   └── mosquitto.conf          # config du broker MQTT
├── simulators/
│   ├── esp32/
│   │   ├── Dockerfile
│   │   └── simulate_esp32.py   # simule un ESP32 (capteurs + actionneurs)
│   └── gateway/
│       ├── Dockerfile
│       └── simulate_gateway.py # simule le Raspberry Pi (relais MQTT ↔ WebSocket)
└── backend/
    └── Dockerfile              # à compléter avec le code Node.js
```

---

## Variables d'environnement

### ESP32 (`esp32_sim_1`, `esp32_sim_2`)

| Variable | Défaut | Description |
|---|---|---|
| `MQTT_BROKER` | `mosquitto` | Adresse du broker MQTT |
| `SERRE_ID` | `serre_01` | Identifiant de la serre |
| `ESP_ID` | `esp32_001` | Identifiant unique de l'ESP32 |
| `SEND_INTERVAL` | `10` | Secondes entre chaque mesure |

### Gateway (`gateway_sim`)

| Variable | Défaut | Description |
|---|---|---|
| `MQTT_BROKER` | `mosquitto` | Adresse du broker MQTT |
| `BACKEND_WS_URL` | `ws://backend:3000/ws` | URL WebSocket du backend |
| `SERRE_ID` | `serre_01` | Identifiant de la serre |
| `AUTH_TOKEN` | `RASPBERRY_SECRET_TOKEN` | Token d'authentification |
