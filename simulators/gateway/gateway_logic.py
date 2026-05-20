"""Logique pure du simulateur de passerelle (Raspberry Pi).

Ce module ne fait AUCUNE connexion réseau et ne démarre AUCUNE boucle.
Il regroupe la construction des topics et trames JSON, ainsi que les règles
de relais MQTT <-> WebSocket, afin de rendre ces parties testables.
"""

import json
from datetime import datetime, timezone

# Types de messages relayés du MQTT vers le WebSocket (remontée capteurs/états).
MQTT_TO_WS_TYPES = ("sensor_data", "actuator_state", "heartbeat", "device_status", "error")

# Types de messages relayés du WebSocket vers le MQTT (commandes descendantes).
WS_TO_MQTT_TYPES = ("manual_command", "ai_command")


def now():
    """Horodatage ISO 8601 en UTC."""
    return datetime.now(timezone.utc).isoformat()


# ── Topics MQTT ─────────────────────────────────────────────────────────────

def subscription_topic(serre_id):
    """Topic de souscription wildcard pour une serre donnée."""
    return f"serre/{serre_id}/#"


def command_topic(serre_id, esp_id):
    """Topic MQTT de commande pour un actionneur d'un ESP donné."""
    return f"serre/{serre_id}/actionneurs/{esp_id}/cmd"


# ── Trames JSON ─────────────────────────────────────────────────────────────

def build_auth_message(auth_token, serre_id, raspberry_id):
    """Construit la trame d'authentification envoyée au backend via WebSocket."""
    return {
        "type": "auth",
        "token": auth_token,
        "serre_id": serre_id,
        "raspberry_id": raspberry_id,
    }


# ── Règles de relais ────────────────────────────────────────────────────────

def should_relay_to_ws(data):
    """Indique si un message MQTT désérialisé doit être relayé vers le WebSocket.

    Seuls les messages de remontée (capteurs, états, heartbeat...) sont relayés ;
    les commandes ne le sont pas (évite les boucles).
    """
    if not isinstance(data, dict):
        return False
    return data.get("type") in MQTT_TO_WS_TYPES


def parse_mqtt_message(raw):
    """Désérialise un payload MQTT brut (bytes ou str).

    Retourne le dict décodé, ou `None` si le payload est invalide.
    """
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    return data


def parse_ws_command(raw, serre_id):
    """Désérialise et valide une commande reçue via WebSocket.

    Retourne un tuple `(relay, topic, data)` :
      - `relay` : booléen, vrai si la commande doit être publiée sur MQTT.
      - `topic` : topic MQTT cible (ou `None` si non relayée).
      - `data`  : dict décodé (ou `None` si le payload est invalide).
    """
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return False, None, None
    if not isinstance(data, dict):
        return False, None, None

    msg_type = data.get("type")
    esp_id   = data.get("esp_id")
    if msg_type in WS_TO_MQTT_TYPES and esp_id:
        return True, command_topic(serre_id, esp_id), data
    return False, None, data
