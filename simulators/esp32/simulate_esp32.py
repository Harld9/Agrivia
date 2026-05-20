import os
import json
import time
import random
import paho.mqtt.client as mqtt
from datetime import datetime, timezone

BROKER   = os.getenv("MQTT_BROKER", "localhost")
PORT     = int(os.getenv("MQTT_PORT", "1883"))
MQTT_WS  = os.getenv("MQTT_WS", "false").lower() == "true"
SERRE_ID = os.getenv("SERRE_ID", "serre_01")
ESP_ID   = os.getenv("ESP_ID", "esp32_001")
INTERVAL = int(os.getenv("SEND_INTERVAL", "10"))

TOPIC_SENSORS = f"serre/{SERRE_ID}/capteurs/{ESP_ID}"
TOPIC_CMD     = f"serre/{SERRE_ID}/actionneurs/{ESP_ID}/cmd"
TOPIC_STATE   = f"serre/{SERRE_ID}/actionneurs/{ESP_ID}/state"
TOPIC_STATUS  = f"serre/{SERRE_ID}/status/{ESP_ID}"

# ── État des actionneurs ────────────────────────────────────────────────────
actuators = {
    "pump":      {"active": False},
    "fan":       {"active": False},
    "led":       {"active": False, "intensity_pct": 0},
    "nutrients": {"active": False},
}

# ── État physique simulé (persistant entre les mesures) ────────────────────
# Valeurs initiales pensées pour déclencher l'autopilote immédiatement :
#   - température trop haute → ventilateur
#   - sol trop sec          → pompe
#   - luminosité trop faible → LED
sim = {
    "temperature":   29.5,   # °C
    "humidity_air":  65.0,   # %
    "humidity_soil": 25.0,   # %
    "luminosity":    180,    # lux
    "npk": {
        "nitrogen":   200,
        "phosphorus":  60,
        "potassium":  280,
    },
}

def now():
    return datetime.now(timezone.utc).isoformat()

def evolve_state():
    """
    Simule la physique de la serre sur un intervalle de mesure.

    Lois appliquées :
      - Température : monte naturellement (effet de serre), réduite par le ventilateur.
      - Humidité sol : baisse par évaporation, remontée par la pompe.
      - Humidité air : légère variation ; le ventilateur l'assèche un peu.
      - Luminosité : ambiante faible (intérieur), fortement boostée par la LED.
      - NPK : dérive lente.
    """
    # Température
    drift_temp = random.uniform(0.1, 0.5)              # chaleur naturelle
    fan_effect = -2.5 if actuators["fan"]["active"] else 0
    sim["temperature"] += drift_temp + fan_effect + random.uniform(-0.1, 0.1)
    sim["temperature"] = round(max(15.0, min(42.0, sim["temperature"])), 1)

    # Humidité de l'air
    sim["humidity_air"] += random.uniform(-1.5, 1.5)
    if actuators["fan"]["active"]:
        sim["humidity_air"] -= 1.0
    sim["humidity_air"] = round(max(20.0, min(95.0, sim["humidity_air"])), 1)

    # Humidité du sol
    evaporation  = random.uniform(0.3, 1.0)
    pump_effect  = 6.0 if actuators["pump"]["active"] else 0
    sim["humidity_soil"] += -evaporation + pump_effect + random.uniform(-0.2, 0.2)
    sim["humidity_soil"] = round(max(0.0, min(100.0, sim["humidity_soil"])), 1)

    # Luminosité
    ambient  = random.randint(100, 250)
    led_boost = 0
    if actuators["led"]["active"]:
        led_boost = int(actuators["led"]["intensity_pct"] * 10)  # 80% → +800 lux
    noise = random.randint(-30, 30)
    sim["luminosity"] = max(0, min(3000, ambient + led_boost + noise))

    # NPK (dérive lente)
    sim["npk"]["nitrogen"]   = max(50,  min(400, sim["npk"]["nitrogen"]   + random.randint(-2, 2)))
    sim["npk"]["phosphorus"] = max(10,  min(150, sim["npk"]["phosphorus"] + random.randint(-1, 1)))
    sim["npk"]["potassium"]  = max(50,  min(500, sim["npk"]["potassium"]  + random.randint(-2, 2)))

def build_sensor_payload():
    """Fait évoluer l'état et retourne la trame sensor_data."""
    evolve_state()
    return {
        "timestamp": now(),
        "esp_id":    ESP_ID,
        "serre_id":  SERRE_ID,
        "type":      "sensor_data",
        "payload": {
            "temperature":   sim["temperature"],
            "humidity_air":  sim["humidity_air"],
            "humidity_soil": sim["humidity_soil"],
            "luminosity":    sim["luminosity"],
            "npk":           dict(sim["npk"]),
        },
        "meta": {
            "firmware_version": "1.0.2",
            "rssi": random.randint(-80, -50),
        },
    }

def build_heartbeat():
    return {
        "timestamp":        now(),
        "esp_id":           ESP_ID,
        "serre_id":         SERRE_ID,
        "type":             "heartbeat",
        "status":           "online",
        "uptime_s":         int(time.time() - start_time),
        "wifi_rssi":        random.randint(-80, -50),
        "firmware_version": "1.0.2",
        "ai_mode":          "gateway",
    }

# ── Callbacks MQTT ──────────────────────────────────────────────────────────

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[{ESP_ID}] Connecté au broker MQTT {BROKER}:{PORT}")
        client.subscribe(TOPIC_CMD, qos=2)
        print(f"[{ESP_ID}] Abonné aux commandes : {TOPIC_CMD}")
    else:
        print(f"[{ESP_ID}] Échec connexion MQTT, code : {rc}")

def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload)
        source = data.get("source", "inconnu")
        print(f"\n[{ESP_ID}] Commande reçue (source: {source}) :")

        changed = False
        for actuator, params in data.get("commands", {}).items():
            if actuator in actuators:
                prev_state = actuators[actuator]["active"]
                actuators[actuator]["active"] = params.get("state", False)
                if "intensity_pct" in params:
                    actuators[actuator]["intensity_pct"] = params["intensity_pct"]

                state_str   = "ON"  if actuators[actuator]["active"] else "OFF"
                change_str  = " ← changé" if prev_state != actuators[actuator]["active"] else ""
                print(f"  {actuator:12s}: {state_str}{change_str}")
                if prev_state != actuators[actuator]["active"]:
                    changed = True

        # ACK → retour de l'état complet
        ack = {
            "timestamp":  now(),
            "esp_id":     ESP_ID,
            "serre_id":   SERRE_ID,
            "type":       "actuator_state",
            "source":     source,
            "command_id": data.get("command_id"),
            "actuators":  actuators,
        }
        client.publish(TOPIC_STATE, json.dumps(ack), qos=1)
        if changed:
            print(f"[{ESP_ID}] ACK envoyé")

    except Exception as e:
        print(f"[{ESP_ID}] Erreur traitement commande : {e}")

# ── Client MQTT ─────────────────────────────────────────────────────────────

client = mqtt.Client(client_id=ESP_ID, transport="websockets" if MQTT_WS else "tcp")
client.on_connect = on_connect
client.on_message = on_message

print(f"[{ESP_ID}] Connexion à {BROKER}:{PORT}...")
client.connect(BROKER, PORT, keepalive=60)
client.loop_start()

start_time = time.time()
tick = 0

print(f"[{ESP_ID}] Simulation démarrée")
print(f"[{ESP_ID}] État initial — T={sim['temperature']}°C | Sol={sim['humidity_soil']}% | Lux={sim['luminosity']} lux")
print(f"[{ESP_ID}] L'autopilote backend devrait réagir dès les premières mesures")

# ── Boucle principale ────────────────────────────────────────────────────────

while True:
    time.sleep(INTERVAL)
    tick += 1

    payload = build_sensor_payload()
    client.publish(TOPIC_SENSORS, json.dumps(payload), qos=1)

    p          = payload["payload"]
    fan_str    = "ON " if actuators["fan"]["active"]  else "OFF"
    pump_str   = "ON " if actuators["pump"]["active"] else "OFF"
    led_str    = "ON " if actuators["led"]["active"]  else "OFF"

    print(
        f"[{ESP_ID}] T={p['temperature']:5.1f}°C | "
        f"Air={p['humidity_air']:4.1f}% | "
        f"Sol={p['humidity_soil']:5.1f}% | "
        f"Lux={p['luminosity']:4d} | "
        f"Fan={fan_str} Pump={pump_str} LED={led_str}"
    )

    # Heartbeat toutes les ~60 s
    if tick % max(1, 60 // INTERVAL) == 0:
        client.publish(TOPIC_STATUS, json.dumps(build_heartbeat()), qos=0)
        print(f"[{ESP_ID}] Heartbeat")
