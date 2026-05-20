"""Logique pure du simulateur ESP32.

Ce module ne fait AUCUNE connexion réseau et ne démarre AUCUNE boucle.
Il regroupe la génération des données capteurs, la construction des trames
JSON, le parsing des commandes entrantes et la construction des topics MQTT,
afin de rendre ces parties testables unitairement.
"""

import random
import time
from datetime import datetime, timezone

FIRMWARE_VERSION = "1.0.2"


# ── Topics MQTT ─────────────────────────────────────────────────────────────

def build_topics(serre_id, esp_id):
    """Construit les topics MQTT pour une serre / un ESP donnés."""
    return {
        "sensors": f"serre/{serre_id}/capteurs/{esp_id}",
        "cmd":     f"serre/{serre_id}/actionneurs/{esp_id}/cmd",
        "state":   f"serre/{serre_id}/actionneurs/{esp_id}/state",
        "status":  f"serre/{serre_id}/status/{esp_id}",
    }


def now():
    """Horodatage ISO 8601 en UTC."""
    return datetime.now(timezone.utc).isoformat()


# ── État par défaut ─────────────────────────────────────────────────────────

def default_actuators():
    """Retourne un dictionnaire neuf représentant l'état des actionneurs."""
    return {
        "pump":      {"active": False},
        "fan":       {"active": False},
        "led":       {"active": False, "intensity_pct": 0},
        "nutrients": {"active": False},
    }


def default_sim_state():
    """Retourne un dictionnaire neuf représentant l'état physique simulé.

    Valeurs initiales pensées pour déclencher l'autopilote immédiatement :
      - température trop haute → ventilateur
      - sol trop sec          → pompe
      - luminosité trop faible → LED
    """
    return {
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


# ── Physique simulée ────────────────────────────────────────────────────────

def evolve_state(sim, actuators):
    """Fait évoluer l'état physique `sim` sur un intervalle de mesure.

    Lois appliquées :
      - Température : monte naturellement (effet de serre), réduite par le ventilateur.
      - Humidité sol : baisse par évaporation, remontée par la pompe.
      - Humidité air : légère variation ; le ventilateur l'assèche un peu.
      - Luminosité : ambiante faible (intérieur), fortement boostée par la LED.
      - NPK : dérive lente.

    Modifie `sim` en place et le retourne.
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

    return sim


# ── Construction des trames JSON ────────────────────────────────────────────

def build_sensor_payload(sim, actuators, esp_id, serre_id):
    """Fait évoluer l'état et retourne la trame `sensor_data`."""
    evolve_state(sim, actuators)
    return {
        "timestamp": now(),
        "esp_id":    esp_id,
        "serre_id":  serre_id,
        "type":      "sensor_data",
        "payload": {
            "temperature":   sim["temperature"],
            "humidity_air":  sim["humidity_air"],
            "humidity_soil": sim["humidity_soil"],
            "luminosity":    sim["luminosity"],
            "npk":           dict(sim["npk"]),
        },
        "meta": {
            "firmware_version": FIRMWARE_VERSION,
            "rssi": random.randint(-80, -50),
        },
    }


def build_heartbeat(esp_id, serre_id, start_time):
    """Retourne la trame `heartbeat`."""
    return {
        "timestamp":        now(),
        "esp_id":           esp_id,
        "serre_id":         serre_id,
        "type":             "heartbeat",
        "status":           "online",
        "uptime_s":         int(time.time() - start_time),
        "wifi_rssi":        random.randint(-80, -50),
        "firmware_version": FIRMWARE_VERSION,
        "ai_mode":          "gateway",
    }


# ── Traitement des commandes entrantes ──────────────────────────────────────

def apply_command(data, actuators):
    """Applique une commande entrante `data` sur l'état `actuators`.

    `data` est le dictionnaire déjà désérialisé depuis le JSON reçu.
    Les actionneurs inconnus sont ignorés. Modifie `actuators` en place.

    Retourne un tuple `(changed, applied)` :
      - `changed` : booléen, vrai si au moins un actionneur a changé d'état.
      - `applied` : liste de dicts décrivant chaque actionneur traité
        `{"actuator", "active", "changed"}`.
    """
    changed = False
    applied = []
    commands = data.get("commands", {})
    if not isinstance(commands, dict):
        commands = {}

    for actuator, params in commands.items():
        if actuator not in actuators:
            continue
        if not isinstance(params, dict):
            params = {}
        prev_state = actuators[actuator]["active"]
        actuators[actuator]["active"] = params.get("state", False)
        if "intensity_pct" in params:
            actuators[actuator]["intensity_pct"] = params["intensity_pct"]

        actuator_changed = prev_state != actuators[actuator]["active"]
        if actuator_changed:
            changed = True
        applied.append({
            "actuator": actuator,
            "active":   actuators[actuator]["active"],
            "changed":  actuator_changed,
        })

    return changed, applied


def build_actuator_state(data, actuators, esp_id, serre_id):
    """Construit la trame `actuator_state` (ACK) renvoyée après une commande."""
    return {
        "timestamp":  now(),
        "esp_id":     esp_id,
        "serre_id":   serre_id,
        "type":       "actuator_state",
        "source":     data.get("source", "inconnu"),
        "command_id": data.get("command_id"),
        "actuators":  actuators,
    }
