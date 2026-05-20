import os
import json
import time
import random
import paho.mqtt.client as mqtt
from datetime import datetime, timezone

BROKER   = os.getenv("MQTT_BROKER", "localhost")
PORT     = int(os.getenv("MQTT_PORT", "1883"))
SERRE_ID = os.getenv("SERRE_ID", "serre_01")
ESP_ID   = os.getenv("ESP_ID", "esp32_001")
INTERVAL = int(os.getenv("SEND_INTERVAL", "10"))

TOPIC_SENSORS = f"serre/{SERRE_ID}/capteurs/{ESP_ID}"
TOPIC_CMD     = f"serre/{SERRE_ID}/actionneurs/{ESP_ID}/cmd"
TOPIC_STATE   = f"serre/{SERRE_ID}/actionneurs/{ESP_ID}/state"
TOPIC_STATUS  = f"serre/{SERRE_ID}/status/{ESP_ID}"

# État interne des actionneurs
actuators = {
    "pump":      {"active": False},
    "fan":       {"active": False},
    "led":       {"active": False, "intensity_pct": 0},
    "nutrients": {"active": False},
}

def now():
    return datetime.now(timezone.utc).isoformat()

def fake_sensors():
    return {
        "timestamp": now(),
        "esp_id": ESP_ID,
        "serre_id": SERRE_ID,
        "type": "sensor_data",
        "payload": {
            "temperature":   round(random.uniform(20.0, 35.0), 1),
            "humidity_air":  round(random.uniform(40.0, 80.0), 1),
            "humidity_soil": round(random.uniform(20.0, 70.0), 1),
            "luminosity":    random.randint(200, 2000),
            "npk": {
                "nitrogen":   random.randint(100, 300),
                "phosphorus": random.randint(30, 100),
                "potassium":  random.randint(150, 400),
            },
        },
        "meta": {
            "firmware_version": "1.0.2",
            "rssi": random.randint(-80, -50),
        },
    }

def heartbeat():
    return {
        "timestamp": now(),
        "esp_id": ESP_ID,
        "serre_id": SERRE_ID,
        "type": "heartbeat",
        "status": "online",
        "uptime_s": int(time.time() - start_time),
        "wifi_rssi": random.randint(-80, -50),
        "firmware_version": "1.0.2",
        "ai_mode": "gateway",
    }

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[{ESP_ID}] Connecté au broker MQTT {BROKER}:{PORT}")
        client.subscribe(TOPIC_CMD, qos=2)
        print(f"[{ESP_ID}] Abonné aux commandes : {TOPIC_CMD}")
    else:
        print(f"[{ESP_ID}] Échec connexion, code : {rc}")

def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload)
        print(f"[{ESP_ID}] Commande reçue : {json.dumps(data, indent=2)}")

        # Appliquer les commandes
        for actuator, params in data.get("commands", {}).items():
            if actuator in actuators:
                actuators[actuator]["active"] = params.get("state", False)
                if "intensity_pct" in params:
                    actuators[actuator]["intensity_pct"] = params["intensity_pct"]

        # Envoyer ACK
        ack = {
            "timestamp": now(),
            "esp_id": ESP_ID,
            "serre_id": SERRE_ID,
            "type": "actuator_state",
            "command_id": data.get("command_id"),
            "actuators": actuators,
        }
        client.publish(TOPIC_STATE, json.dumps(ack), qos=1)
        print(f"[{ESP_ID}] ACK envoyé")

    except Exception as e:
        print(f"[{ESP_ID}] Erreur traitement commande : {e}")

client = mqtt.Client(client_id=ESP_ID)
client.on_connect = on_connect
client.on_message = on_message

print(f"[{ESP_ID}] Connexion à {BROKER}:{PORT}...")
client.connect(BROKER, PORT, keepalive=60)
client.loop_start()

start_time = time.time()
tick = 0

while True:
    time.sleep(INTERVAL)
    tick += 1

    # Données capteurs
    payload = fake_sensors()
    client.publish(TOPIC_SENSORS, json.dumps(payload), qos=1)
    print(f"[{ESP_ID}] Capteurs publiés — temp={payload['payload']['temperature']}°C "
          f"sol={payload['payload']['humidity_soil']}% lux={payload['payload']['luminosity']}")

    # Heartbeat toutes les 60s
    if tick % (60 // INTERVAL) == 0:
        client.publish(TOPIC_STATUS, json.dumps(heartbeat()), qos=0)
        print(f"[{ESP_ID}] Heartbeat envoyé")
