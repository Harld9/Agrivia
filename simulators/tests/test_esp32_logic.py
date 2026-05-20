"""Tests de la logique pure du simulateur ESP32."""

import esp32_logic


# ── Topics MQTT ─────────────────────────────────────────────────────────────

def test_build_topics_structure():
    topics = esp32_logic.build_topics("serre_01", "esp32_001")
    assert topics == {
        "sensors": "serre/serre_01/capteurs/esp32_001",
        "cmd":     "serre/serre_01/actionneurs/esp32_001/cmd",
        "state":   "serre/serre_01/actionneurs/esp32_001/state",
        "status":  "serre/serre_01/status/esp32_001",
    }


def test_build_topics_uses_given_ids():
    topics = esp32_logic.build_topics("greenhouse_42", "node_99")
    assert topics["sensors"] == "serre/greenhouse_42/capteurs/node_99"
    assert topics["cmd"].startswith("serre/greenhouse_42/actionneurs/node_99/")


# ── État par défaut ─────────────────────────────────────────────────────────

def test_default_actuators_shape():
    act = esp32_logic.default_actuators()
    assert set(act.keys()) == {"pump", "fan", "led", "nutrients"}
    for name in ("pump", "fan", "nutrients"):
        assert act[name]["active"] is False
    assert act["led"]["active"] is False
    assert act["led"]["intensity_pct"] == 0


def test_default_actuators_are_independent_copies():
    a = esp32_logic.default_actuators()
    b = esp32_logic.default_actuators()
    a["pump"]["active"] = True
    assert b["pump"]["active"] is False


def test_default_sim_state_shape():
    sim = esp32_logic.default_sim_state()
    assert set(sim.keys()) == {"temperature", "humidity_air", "humidity_soil", "luminosity", "npk"}
    assert set(sim["npk"].keys()) == {"nitrogen", "phosphorus", "potassium"}


def test_default_sim_state_are_independent_copies():
    a = esp32_logic.default_sim_state()
    b = esp32_logic.default_sim_state()
    a["npk"]["nitrogen"] = 999
    assert b["npk"]["nitrogen"] == 200


# ── Physique simulée : bornes des valeurs ───────────────────────────────────

def test_evolve_state_keeps_values_in_bounds():
    """Après de nombreuses itérations, toutes les valeurs restent réalistes."""
    sim = esp32_logic.default_sim_state()
    actuators = esp32_logic.default_actuators()
    for _ in range(500):
        esp32_logic.evolve_state(sim, actuators)
        assert 15.0 <= sim["temperature"] <= 42.0
        assert 20.0 <= sim["humidity_air"] <= 95.0
        assert 0.0 <= sim["humidity_soil"] <= 100.0
        assert 0 <= sim["luminosity"] <= 3000
        assert 50 <= sim["npk"]["nitrogen"] <= 400
        assert 10 <= sim["npk"]["phosphorus"] <= 150
        assert 50 <= sim["npk"]["potassium"] <= 500


def test_evolve_state_bounds_hold_with_all_actuators_on():
    """Les bornes tiennent même quand pompe/ventilateur/LED sont actifs."""
    sim = esp32_logic.default_sim_state()
    actuators = esp32_logic.default_actuators()
    actuators["pump"]["active"] = True
    actuators["fan"]["active"] = True
    actuators["led"]["active"] = True
    actuators["led"]["intensity_pct"] = 80
    for _ in range(500):
        esp32_logic.evolve_state(sim, actuators)
        assert 15.0 <= sim["temperature"] <= 42.0
        assert 20.0 <= sim["humidity_air"] <= 95.0
        assert 0.0 <= sim["humidity_soil"] <= 100.0
        assert 0 <= sim["luminosity"] <= 3000


def test_evolve_state_returns_numeric_types():
    sim = esp32_logic.default_sim_state()
    actuators = esp32_logic.default_actuators()
    esp32_logic.evolve_state(sim, actuators)
    assert isinstance(sim["temperature"], float)
    assert isinstance(sim["humidity_air"], float)
    assert isinstance(sim["humidity_soil"], float)
    assert isinstance(sim["luminosity"], int)
    for v in sim["npk"].values():
        assert isinstance(v, int)


def test_evolve_state_temperature_rounded_one_decimal():
    sim = esp32_logic.default_sim_state()
    actuators = esp32_logic.default_actuators()
    for _ in range(50):
        esp32_logic.evolve_state(sim, actuators)
        assert round(sim["temperature"], 1) == sim["temperature"]


def test_evolve_state_led_boost_increases_luminosity():
    """À LED allumée et intensité forte, la luminosité dépasse l'ambiant max."""
    sim = esp32_logic.default_sim_state()
    actuators = esp32_logic.default_actuators()
    actuators["led"]["active"] = True
    actuators["led"]["intensity_pct"] = 80
    high_readings = []
    for _ in range(20):
        esp32_logic.evolve_state(sim, actuators)
        high_readings.append(sim["luminosity"])
    # ambient max = 250 + noise max 30 = 280 ; LED 80% ajoute ~800 lux
    assert max(high_readings) > 280


# ── Trame sensor_data ───────────────────────────────────────────────────────

def test_build_sensor_payload_structure():
    sim = esp32_logic.default_sim_state()
    actuators = esp32_logic.default_actuators()
    msg = esp32_logic.build_sensor_payload(sim, actuators, "esp32_001", "serre_01")

    assert set(msg.keys()) == {"timestamp", "esp_id", "serre_id", "type", "payload", "meta"}
    assert msg["type"] == "sensor_data"
    assert msg["esp_id"] == "esp32_001"
    assert msg["serre_id"] == "serre_01"
    assert isinstance(msg["timestamp"], str)


def test_build_sensor_payload_payload_fields_and_types():
    sim = esp32_logic.default_sim_state()
    actuators = esp32_logic.default_actuators()
    p = esp32_logic.build_sensor_payload(sim, actuators, "e", "s")["payload"]

    assert set(p.keys()) == {"temperature", "humidity_air", "humidity_soil", "luminosity", "npk"}
    assert isinstance(p["temperature"], float)
    assert isinstance(p["humidity_air"], float)
    assert isinstance(p["humidity_soil"], float)
    assert isinstance(p["luminosity"], int)
    assert set(p["npk"].keys()) == {"nitrogen", "phosphorus", "potassium"}
    for v in p["npk"].values():
        assert isinstance(v, int)


def test_build_sensor_payload_meta_fields():
    sim = esp32_logic.default_sim_state()
    actuators = esp32_logic.default_actuators()
    meta = esp32_logic.build_sensor_payload(sim, actuators, "e", "s")["meta"]
    assert meta["firmware_version"] == "1.0.2"
    assert isinstance(meta["rssi"], int)
    assert -80 <= meta["rssi"] <= -50


def test_build_sensor_payload_npk_is_a_copy():
    """La trame ne doit pas exposer la référence interne du NPK."""
    sim = esp32_logic.default_sim_state()
    actuators = esp32_logic.default_actuators()
    msg = esp32_logic.build_sensor_payload(sim, actuators, "e", "s")
    msg["payload"]["npk"]["nitrogen"] = -1
    assert sim["npk"]["nitrogen"] != -1


# ── Trame heartbeat ─────────────────────────────────────────────────────────

def test_build_heartbeat_structure():
    msg = esp32_logic.build_heartbeat("esp32_001", "serre_01", start_time=0)
    expected = {
        "timestamp", "esp_id", "serre_id", "type", "status",
        "uptime_s", "wifi_rssi", "firmware_version", "ai_mode",
    }
    assert set(msg.keys()) == expected
    assert msg["type"] == "heartbeat"
    assert msg["status"] == "online"
    assert msg["esp_id"] == "esp32_001"
    assert msg["serre_id"] == "serre_01"
    assert msg["ai_mode"] == "gateway"
    assert msg["firmware_version"] == "1.0.2"


def test_build_heartbeat_uptime_is_positive_int():
    msg = esp32_logic.build_heartbeat("e", "s", start_time=0)
    assert isinstance(msg["uptime_s"], int)
    assert msg["uptime_s"] >= 0


def test_build_heartbeat_wifi_rssi_in_range():
    msg = esp32_logic.build_heartbeat("e", "s", start_time=0)
    assert -80 <= msg["wifi_rssi"] <= -50


# ── Parsing / validation des commandes ──────────────────────────────────────

def test_apply_command_turns_actuator_on():
    actuators = esp32_logic.default_actuators()
    data = {"commands": {"pump": {"state": True}}}
    changed, applied = esp32_logic.apply_command(data, actuators)
    assert changed is True
    assert actuators["pump"]["active"] is True
    assert applied == [{"actuator": "pump", "active": True, "changed": True}]


def test_apply_command_no_change_when_state_already_set():
    actuators = esp32_logic.default_actuators()
    data = {"commands": {"pump": {"state": False}}}
    changed, applied = esp32_logic.apply_command(data, actuators)
    assert changed is False
    assert applied[0]["changed"] is False


def test_apply_command_sets_led_intensity():
    actuators = esp32_logic.default_actuators()
    data = {"commands": {"led": {"state": True, "intensity_pct": 75}}}
    changed, applied = esp32_logic.apply_command(data, actuators)
    assert changed is True
    assert actuators["led"]["active"] is True
    assert actuators["led"]["intensity_pct"] == 75


def test_apply_command_ignores_unknown_actuator():
    actuators = esp32_logic.default_actuators()
    data = {"commands": {"laser": {"state": True}}}
    changed, applied = esp32_logic.apply_command(data, actuators)
    assert changed is False
    assert applied == []
    assert "laser" not in actuators


def test_apply_command_handles_missing_commands_key():
    actuators = esp32_logic.default_actuators()
    changed, applied = esp32_logic.apply_command({}, actuators)
    assert changed is False
    assert applied == []


def test_apply_command_handles_commands_not_a_dict():
    actuators = esp32_logic.default_actuators()
    changed, applied = esp32_logic.apply_command({"commands": "oops"}, actuators)
    assert changed is False
    assert applied == []


def test_apply_command_handles_params_not_a_dict():
    actuators = esp32_logic.default_actuators()
    changed, applied = esp32_logic.apply_command({"commands": {"pump": "on"}}, actuators)
    # params invalides => state par défaut False => pas de changement
    assert changed is False
    assert actuators["pump"]["active"] is False


def test_apply_command_missing_state_defaults_to_false():
    actuators = esp32_logic.default_actuators()
    actuators["fan"]["active"] = True
    changed, applied = esp32_logic.apply_command({"commands": {"fan": {}}}, actuators)
    assert changed is True
    assert actuators["fan"]["active"] is False


def test_apply_command_multiple_actuators():
    actuators = esp32_logic.default_actuators()
    data = {"commands": {"pump": {"state": True}, "fan": {"state": True}}}
    changed, applied = esp32_logic.apply_command(data, actuators)
    assert changed is True
    assert len(applied) == 2
    assert actuators["pump"]["active"] is True
    assert actuators["fan"]["active"] is True


# ── Trame actuator_state (ACK) ──────────────────────────────────────────────

def test_build_actuator_state_structure():
    actuators = esp32_logic.default_actuators()
    data = {"source": "backend", "command_id": "cmd-123"}
    ack = esp32_logic.build_actuator_state(data, actuators, "esp32_001", "serre_01")
    assert set(ack.keys()) == {
        "timestamp", "esp_id", "serre_id", "type", "source", "command_id", "actuators",
    }
    assert ack["type"] == "actuator_state"
    assert ack["source"] == "backend"
    assert ack["command_id"] == "cmd-123"
    assert ack["esp_id"] == "esp32_001"
    assert ack["serre_id"] == "serre_01"
    assert ack["actuators"] is actuators


def test_build_actuator_state_defaults_for_missing_fields():
    actuators = esp32_logic.default_actuators()
    ack = esp32_logic.build_actuator_state({}, actuators, "e", "s")
    assert ack["source"] == "inconnu"
    assert ack["command_id"] is None
