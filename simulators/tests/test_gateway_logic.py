"""Tests de la logique pure du simulateur de passerelle."""

import json

import gateway_logic


# ── Topics MQTT ─────────────────────────────────────────────────────────────

def test_subscription_topic():
    assert gateway_logic.subscription_topic("serre_01") == "serre/serre_01/#"
    assert gateway_logic.subscription_topic("gh_42") == "serre/gh_42/#"


def test_command_topic():
    topic = gateway_logic.command_topic("serre_01", "esp32_001")
    assert topic == "serre/serre_01/actionneurs/esp32_001/cmd"


def test_command_topic_uses_given_ids():
    topic = gateway_logic.command_topic("gh_42", "node_99")
    assert topic == "serre/gh_42/actionneurs/node_99/cmd"


# ── Trame d'authentification ────────────────────────────────────────────────

def test_build_auth_message_structure():
    msg = gateway_logic.build_auth_message("TOKEN", "serre_01", "rpi_01")
    assert msg == {
        "type": "auth",
        "token": "TOKEN",
        "serre_id": "serre_01",
        "raspberry_id": "rpi_01",
    }


def test_build_auth_message_is_json_serializable():
    msg = gateway_logic.build_auth_message("T", "s", "r")
    # Ne doit pas lever
    assert json.loads(json.dumps(msg)) == msg


# ── Règle de relais MQTT → WebSocket ────────────────────────────────────────

def test_should_relay_to_ws_accepts_sensor_data():
    assert gateway_logic.should_relay_to_ws({"type": "sensor_data"}) is True


def test_should_relay_to_ws_accepts_all_uplink_types():
    for t in ("sensor_data", "actuator_state", "heartbeat", "device_status", "error"):
        assert gateway_logic.should_relay_to_ws({"type": t}) is True


def test_should_relay_to_ws_rejects_commands():
    assert gateway_logic.should_relay_to_ws({"type": "manual_command"}) is False
    assert gateway_logic.should_relay_to_ws({"type": "ai_command"}) is False


def test_should_relay_to_ws_rejects_unknown_type():
    assert gateway_logic.should_relay_to_ws({"type": "garbage"}) is False
    assert gateway_logic.should_relay_to_ws({}) is False


def test_should_relay_to_ws_rejects_non_dict():
    assert gateway_logic.should_relay_to_ws("not a dict") is False
    assert gateway_logic.should_relay_to_ws(None) is False
    assert gateway_logic.should_relay_to_ws([1, 2, 3]) is False


# ── Parsing des messages MQTT ───────────────────────────────────────────────

def test_parse_mqtt_message_valid_bytes():
    raw = json.dumps({"type": "sensor_data", "esp_id": "e1"}).encode()
    data = gateway_logic.parse_mqtt_message(raw)
    assert data == {"type": "sensor_data", "esp_id": "e1"}


def test_parse_mqtt_message_valid_str():
    data = gateway_logic.parse_mqtt_message('{"type": "heartbeat"}')
    assert data == {"type": "heartbeat"}


def test_parse_mqtt_message_invalid_json_returns_none():
    assert gateway_logic.parse_mqtt_message(b"not json") is None
    assert gateway_logic.parse_mqtt_message("{broken") is None


def test_parse_mqtt_message_non_object_returns_none():
    assert gateway_logic.parse_mqtt_message("[1, 2, 3]") is None
    assert gateway_logic.parse_mqtt_message("42") is None
    assert gateway_logic.parse_mqtt_message('"a string"') is None


def test_parse_mqtt_message_none_input_returns_none():
    assert gateway_logic.parse_mqtt_message(None) is None


# ── Parsing / validation des commandes WebSocket ────────────────────────────

def test_parse_ws_command_valid_manual_command():
    raw = json.dumps({"type": "manual_command", "esp_id": "esp32_001"})
    relay, topic, data = gateway_logic.parse_ws_command(raw, "serre_01")
    assert relay is True
    assert topic == "serre/serre_01/actionneurs/esp32_001/cmd"
    assert data["type"] == "manual_command"


def test_parse_ws_command_valid_ai_command():
    raw = json.dumps({"type": "ai_command", "esp_id": "node_7"})
    relay, topic, data = gateway_logic.parse_ws_command(raw, "gh_2")
    assert relay is True
    assert topic == "serre/gh_2/actionneurs/node_7/cmd"


def test_parse_ws_command_non_command_type_not_relayed():
    raw = json.dumps({"type": "auth", "esp_id": "esp32_001"})
    relay, topic, data = gateway_logic.parse_ws_command(raw, "serre_01")
    assert relay is False
    assert topic is None
    assert data["type"] == "auth"


def test_parse_ws_command_missing_esp_id_not_relayed():
    raw = json.dumps({"type": "manual_command"})
    relay, topic, data = gateway_logic.parse_ws_command(raw, "serre_01")
    assert relay is False
    assert topic is None
    assert data is not None


def test_parse_ws_command_invalid_json():
    relay, topic, data = gateway_logic.parse_ws_command("{not json", "serre_01")
    assert relay is False
    assert topic is None
    assert data is None


def test_parse_ws_command_non_object_json():
    relay, topic, data = gateway_logic.parse_ws_command("[1,2,3]", "serre_01")
    assert relay is False
    assert topic is None
    assert data is None


def test_parse_ws_command_none_input():
    relay, topic, data = gateway_logic.parse_ws_command(None, "serre_01")
    assert relay is False
    assert topic is None
    assert data is None
