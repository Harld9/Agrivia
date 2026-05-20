import os
import json
import time
import asyncio
import paho.mqtt.client as mqtt
import websockets
from datetime import datetime, timezone

MQTT_BROKER  = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT    = int(os.getenv("MQTT_PORT", "1883"))
WS_URL       = os.getenv("BACKEND_WS_URL", "ws://localhost:3000/ws")
SERRE_ID     = os.getenv("SERRE_ID", "serre_01")
RASPBERRY_ID = os.getenv("RASPBERRY_ID", "rpi_01")
AUTH_TOKEN   = os.getenv("AUTH_TOKEN", "RASPBERRY_SECRET_TOKEN")

def now():
    return datetime.now(timezone.utc).isoformat()

# File partagée entre le thread MQTT et la coroutine WebSocket
message_queue = asyncio.Queue()

def on_mqtt_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[Gateway] Connecté au broker MQTT {MQTT_BROKER}:{MQTT_PORT}")
        client.subscribe(f"serre/{SERRE_ID}/#", qos=1)
        print(f"[Gateway] Abonné à serre/{SERRE_ID}/#")
    else:
        print(f"[Gateway] Échec connexion MQTT, code : {rc}")

def on_mqtt_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload)
        loop = userdata["loop"]
        # Ne pas relayer les commandes (éviter les boucles)
        if data.get("type") in ("sensor_data", "actuator_state", "heartbeat", "device_status", "error"):
            asyncio.run_coroutine_threadsafe(message_queue.put(data), loop)
            print(f"[Gateway] MQTT → WS : {data.get('type')} | {data.get('esp_id', '')}")
    except Exception as e:
        print(f"[Gateway] Erreur lecture message MQTT : {e}")

async def run_gateway():
    loop = asyncio.get_event_loop()

    # Configurer le client MQTT
    mqtt_client = mqtt.Client(client_id=RASPBERRY_ID)
    mqtt_client.user_data_set({"loop": loop})
    mqtt_client.on_connect = on_mqtt_connect
    mqtt_client.on_message = on_mqtt_message

    print(f"[Gateway] Connexion MQTT à {MQTT_BROKER}:{MQTT_PORT}...")
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    mqtt_client.loop_start()

    # Attendre que MQTT soit prêt
    await asyncio.sleep(2)

    while True:
        try:
            print(f"[Gateway] Connexion WebSocket à {WS_URL}...")
            async with websockets.connect(WS_URL) as ws:
                print(f"[Gateway] WebSocket connecté")

                # Authentification
                auth = {
                    "type": "auth",
                    "token": AUTH_TOKEN,
                    "serre_id": SERRE_ID,
                    "raspberry_id": RASPBERRY_ID,
                }
                await ws.send(json.dumps(auth))
                print(f"[Gateway] Auth envoyée")

                # Tâche 1 : relayer MQTT → WebSocket
                async def mqtt_to_ws():
                    while True:
                        data = await message_queue.get()
                        await ws.send(json.dumps(data))

                # Tâche 2 : recevoir les commandes WebSocket → MQTT
                async def ws_to_mqtt():
                    async for message in ws:
                        try:
                            data = json.loads(message)
                            msg_type = data.get("type")
                            esp_id   = data.get("esp_id")
                            print(f"[Gateway] WS → MQTT : {msg_type} | {esp_id}")

                            if msg_type in ("manual_command", "ai_command"):
                                topic = f"serre/{SERRE_ID}/actionneurs/{esp_id}/cmd"
                                mqtt_client.publish(topic, json.dumps(data), qos=2)
                        except Exception as e:
                            print(f"[Gateway] Erreur traitement message WS : {e}")

                await asyncio.gather(mqtt_to_ws(), ws_to_mqtt())

        except (websockets.exceptions.ConnectionClosed, OSError) as e:
            print(f"[Gateway] WebSocket déconnecté : {e} — reconnexion dans 5s...")
            await asyncio.sleep(5)

asyncio.run(run_gateway())
