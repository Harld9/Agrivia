import os
import json
import time
import paho.mqtt.client as mqtt

from esp32_logic import (
    build_topics,
    default_actuators,
    default_sim_state,
    build_sensor_payload,
    build_heartbeat,
    apply_command,
    build_actuator_state,
)

BROKER   = os.getenv("MQTT_BROKER", "localhost")
PORT     = int(os.getenv("MQTT_PORT", "1883"))
MQTT_WS  = os.getenv("MQTT_WS", "false").lower() == "true"
SERRE_ID = os.getenv("SERRE_ID", "serre_01")
ESP_ID   = os.getenv("ESP_ID", "esp32_001")
INTERVAL = int(os.getenv("SEND_INTERVAL", "10"))

TOPICS        = build_topics(SERRE_ID, ESP_ID)
TOPIC_SENSORS = TOPICS["sensors"]
TOPIC_CMD     = TOPICS["cmd"]
TOPIC_STATE   = TOPICS["state"]
TOPIC_STATUS  = TOPICS["status"]

# ── État des actionneurs ────────────────────────────────────────────────────
actuators = default_actuators()

# ── État physique simulé (persistant entre les mesures) ────────────────────
sim = default_sim_state()


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

        changed, applied = apply_command(data, actuators)
        for entry in applied:
            state_str  = "ON"  if entry["active"] else "OFF"
            change_str = " ← changé" if entry["changed"] else ""
            print(f"  {entry['actuator']:12s}: {state_str}{change_str}")

        # ACK → retour de l'état complet
        ack = build_actuator_state(data, actuators, ESP_ID, SERRE_ID)
        client.publish(TOPIC_STATE, json.dumps(ack), qos=1)
        if changed:
            print(f"[{ESP_ID}] ACK envoyé")

    except Exception as e:
        print(f"[{ESP_ID}] Erreur traitement commande : {e}")


def main():
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

    # ── Boucle principale ────────────────────────────────────────────────────
    while True:
        time.sleep(INTERVAL)
        tick += 1

        payload = build_sensor_payload(sim, actuators, ESP_ID, SERRE_ID)
        client.publish(TOPIC_SENSORS, json.dumps(payload), qos=1)

        p        = payload["payload"]
        fan_str  = "ON " if actuators["fan"]["active"]  else "OFF"
        pump_str = "ON " if actuators["pump"]["active"] else "OFF"
        led_str  = "ON " if actuators["led"]["active"]  else "OFF"

        print(
            f"[{ESP_ID}] T={p['temperature']:5.1f}°C | "
            f"Air={p['humidity_air']:4.1f}% | "
            f"Sol={p['humidity_soil']:5.1f}% | "
            f"Lux={p['luminosity']:4d} | "
            f"Fan={fan_str} Pump={pump_str} LED={led_str}"
        )

        # Heartbeat toutes les ~60 s
        if tick % max(1, 60 // INTERVAL) == 0:
            client.publish(TOPIC_STATUS, json.dumps(build_heartbeat(ESP_ID, SERRE_ID, start_time)), qos=0)
            print(f"[{ESP_ID}] Heartbeat")


if __name__ == "__main__":
    main()
