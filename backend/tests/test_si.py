"""SI copilot: strict contract, deterministic offline fallback, STT
degradation path. All tests run with 9Router and whisper.cpp DOWN —
the services must degrade, never fail."""
from __future__ import annotations

import io
import json

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import si_copilot as si

client = TestClient(app)

STATE = {"materialId": "cotton", "o2Pct": 30.0, "flowCms": 20.0,
         "gravity": "microgravity", "investigationId": "saffire"}


@pytest.fixture(autouse=True)
def _no_llm(monkeypatch):
    """Guarantee the gateway is 'down' regardless of local services."""
    monkeypatch.setattr(si, "_llm_client", lambda: None)


def test_chat_offline_contract():
    r = client.post("/api/si/chat",
                    json={"message": "what should we do about the fire?",
                          "current_chamber_state": STATE})
    assert r.status_code == 200
    j = r.json()
    assert j["mode"] == "offline-fallback"
    assert j["recommended_action"] in si.ACTION_CODES
    assert j["briefing"]
    assert j["engine"] in ("c++", "python-fallback")
    # evidence = the 3 nearest consolidated-sheet runs
    assert 1 <= len(j["evidence"]) <= 3
    assert all("accession" in e and "runId" in e for e in j["evidence"])
    # chamber echo resolves the material through the investigation spec
    assert j["chamber"]["materialId"] == "cotton"
    assert 0.0 <= j["chamber"]["riskIndex"] <= 1.0


def test_chat_forced_flow_high_o2_cuts_ventilation():
    r = client.post("/api/si/chat",
                    json={"message": "fire signature!",
                          "current_chamber_state": STATE})
    j = r.json()
    assert j["recommended_action"] == "CUT_VENTILATION"
    assert j["ui_command"]["set_airflow_cm_s"] == 0.0


def test_chat_below_loc_suppresses_locally():
    st = {**STATE, "o2Pct": 10.0, "flowCms": 0.0}
    r = client.post("/api/si/chat",
                    json={"message": "status?", "current_chamber_state": st})
    j = r.json()
    assert j["recommended_action"] == "SUPPRESS_LOCAL"
    assert j["chamber"]["level"] in ("minimal", "low")


def test_chat_high_margin_reduces_o2():
    st = {**STATE, "o2Pct": 35.0, "flowCms": 0.0}
    r = client.post("/api/si/chat",
                    json={"message": "bring risk down",
                          "current_chamber_state": st})
    j = r.json()
    assert j["recommended_action"] in ("REDUCE_O2", "COOL_AND_ISOLATE")
    if j["ui_command"] and j["ui_command"].get("set_o2_percent") is not None:
        assert j["ui_command"]["set_o2_percent"] < 35.0


def test_chat_validation_422():
    r = client.post("/api/si/chat",
                    json={"message": "hi",
                          "current_chamber_state": {"o2Pct": 250}})
    assert r.status_code == 422
    r = client.post("/api/si/chat", json={"current_chamber_state": {}})
    assert r.status_code == 422


def test_chat_default_state_ok():
    r = client.post("/api/si/chat", json={"message": "status report"})
    assert r.status_code == 200
    assert r.json()["chamber"]["materialId"] == "pmma"


def test_voice_stt_offline_degrades():
    r = client.post(
        "/api/si/voice",
        files={"audio": ("clip.webm", io.BytesIO(b"fake-webm-bytes"),
                         "audio/webm")},
        data={"state": json.dumps(STATE)})
    assert r.status_code == 200
    j = r.json()
    assert j["stt"] == "offline"
    assert j["transcript"] is None
    # deterministic response still present — the console never dead-ends
    assert j["response"]["recommended_action"] in si.ACTION_CODES


def test_voice_bad_state_422():
    r = client.post(
        "/api/si/voice",
        files={"audio": ("clip.webm", io.BytesIO(b"x"), "audio/webm")},
        data={"state": "{not json"})
    assert r.status_code == 422


def test_llm_malformed_json_falls_back(monkeypatch):
    """A reachable gateway returning garbage must not reach the client."""
    class _Msg:
        content = "definitely not json"

    class _Choice:
        message = _Msg()

    class _Completion:
        choices = [_Choice()]

    class _Completions:
        async def create(self, **kwargs):
            return _Completion()

    class _Chat:
        completions = _Completions()

    class _Stub:
        chat = _Chat()

    monkeypatch.setattr(si, "_llm_client", lambda: _Stub())
    r = client.post("/api/si/chat",
                    json={"message": "status",
                          "current_chamber_state": STATE})
    j = r.json()
    assert j["mode"] == "offline-fallback"
    assert j["recommended_action"] in si.ACTION_CODES


def test_llm_valid_json_passes_through(monkeypatch):
    payload = {
        "briefing": "SAFFIRE regime — cut the forced flow first.",
        "recommended_action": "cut_ventilation",  # coerced to code
        "ui_command": {"set_airflow_cm_s": 0.0},
    }

    class _Msg:
        content = json.dumps(payload)

    class _Choice:
        message = _Msg()

    class _Completion:
        choices = [_Choice()]

    class _Completions:
        async def create(self, **kwargs):
            return _Completion()

    class _Chat:
        completions = _Completions()

    class _Stub:
        chat = _Chat()

    monkeypatch.setattr(si, "_llm_client", lambda: _Stub())
    r = client.post("/api/si/chat",
                    json={"message": "contain it",
                          "current_chamber_state": STATE})
    j = r.json()
    assert j["mode"] == "llm"
    assert j["recommended_action"] == "CUT_VENTILATION"
    assert j["ui_command"]["set_airflow_cm_s"] == 0.0
    assert j["evidence"]  # packet still attached for provenance
