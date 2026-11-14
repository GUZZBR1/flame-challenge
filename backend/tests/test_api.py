"""API hardening: real engine reporting, input range validation (422),
descriptive 404s for unknown investigations, fallback-engine parity."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import engine_bridge as eb
from backend.services import engine_fallback as fb

client = TestClient(app)


def test_health_reports_real_engine():
    j = client.get("/health").json()
    assert j["ok"] is True
    assert j["engine"] == eb.ENGINE
    assert j["engine"] in ("c++", "python-fallback")
    assert j["module"]


def test_preview_reports_engine_and_spec():
    r = client.post("/api/chamber/preview",
                    json={"investigationId": "saffire", "o2Pct": 21.0,
                          "flowCms": 10.0, "pressureKpa": 70.0})
    assert r.status_code == 200
    j = r.json()
    assert j["engine"] == eb.ENGINE
    assert j["materialId"] == "cotton"
    assert j["model"] == "spread"
    assert j["pressureKpa"] == pytest.approx(70.0)
    assert 0.0 <= j["ignitionPressure"] <= 1.0


def test_preview_unknown_investigation_is_404():
    r = client.post("/api/chamber/preview",
                    json={"investigationId": "not-a-study", "o2Pct": 21.0})
    assert r.status_code == 404
    detail = r.json()["detail"]
    assert "not-a-study" in detail
    assert "saffire" in detail  # message lists known ids


@pytest.mark.parametrize("o2", [-0.1, 100.1, "nan", "-inf", "inf"])
def test_preview_o2_out_of_range_is_422(o2):
    r = client.post("/api/chamber/preview",
                    json={"investigationId": "saffire", "o2Pct": o2})
    assert r.status_code == 422
    assert r.json()["detail"]


@pytest.mark.parametrize("field,bad", [("flowCms", -1.0), ("flowCms", 300.1),
                                       ("pressureKpa", 0.0),
                                       ("pressureKpa", 300.1)])
def test_preview_flow_pressure_ranges(field, bad):
    r = client.post("/api/chamber/preview",
                    json={"investigationId": "saffire", "o2Pct": 21.0,
                          field: bad})
    assert r.status_code == 422


@pytest.mark.parametrize("field", ["o2Pct", "flowCms", "pressureKpa"])
@pytest.mark.parametrize("value", [float("inf"), float("-inf"), float("nan")])
def test_numeric_non_finite_input_is_422_not_500(field, value):
    """Bodies like {"flowCms": 1e309} decode to non-finite floats — the
    422 error payload echoes the input and must still serialize."""
    payload = {"investigationId": "saffire", "o2Pct": 21, field: value}
    r = client.post("/api/chamber/preview",
                    content=json.dumps(payload).encode(),
                    headers={"content-type": "application/json"})
    assert r.status_code == 422
    assert r.json()["detail"]


def test_risk_post_and_get_validation():
    assert client.post("/api/risk", json={
        "materialId": "pmma", "o2Pct": 21.0, "flowCms": 0.0}).status_code == 200
    for body in ({"o2Pct": -1.0}, {"o2Pct": 150.0}, {"o2Pct": "nan"},
                 {"flowCms": -0.5}, {"flowCms": "inf"}):
        r = client.post("/api/risk", json={"materialId": "pmma", **body})
        assert r.status_code == 422, body
    assert client.get("/api/risk", params={"o2Pct": "nan"}).status_code == 422
    assert client.get("/api/risk", params={"o2Pct": "1e309"}).status_code == 422
    assert client.get("/api/risk",
                      params={"o2Pct": 21.0, "flowCms": -2}).status_code == 422
    assert client.get("/api/risk",
                      params={"o2Pct": 21.0}).status_code == 200


@pytest.mark.parametrize("value", ["nan", "1e309", "-0.5", "100.5"])
def test_neighbors_o2_validation(value):
    assert client.get("/api/neighbors",
                      params={"o2Pct": value}).status_code == 422


def test_neighbors_flow_and_k_validation():
    assert client.get("/api/neighbors",
                      params={"flowCms": -5}).status_code == 422
    assert client.get("/api/neighbors", params={"k": 0}).status_code == 422
    assert client.get("/api/neighbors").status_code == 200


def test_decision_cards_reports_live_engine_and_validates():
    """engine must name the live backend (python-fallback when the .so is
    absent), and o2/flow need the same bounds as /api/risk — non-finite
    floats used to echo into the response and 500 the serializer."""
    j = client.get("/api/decision-cards").json()
    assert j["engine"] == eb.ENGINE
    for params in ({"o2Pct": "nan"}, {"o2Pct": "1e309"},
                   {"o2Pct": -1}, {"flowCms": -5}):
        r = client.get("/api/decision-cards", params=params)
        assert r.status_code == 422, params


# ---------- pure-Python fallback engine ----------

def test_fallback_ignition_pressure_formula():
    m = fb.Material(id="t", name="t", locPct=15.0)
    cases = {10.0: 0.0,        # margin -5 < -3  → hard zero
             13.0: 0.04,       # residual µg band
             15.0: 0.04,       # at LOC
             21.0: min(1.0, 0.04 + 0.055 * 6.0 ** 1.35),
             100.0: 1.0}
    for o2, want in cases.items():
        assert fb._ignition_pressure(m, o2) == pytest.approx(want)


def test_fallback_unknown_material_returns_minus_one():
    assert fb.MaterialRisk().ignition_pressure("unobtanium", 21.0) == -1.0


def test_fallback_chamber_spread_run_terminates():
    risks = fb.MaterialRisk()
    cfg = fb.ChamberConfig(materialId="pmma", model="spread",
                           o2Pct=21.0, flowCms=5.0)
    ch = fb.Chamber(risks)
    ch.configure(cfg)
    steps = 0
    while not ch.finished() and steps < 5000:
        ch.step(1 / 30)
        steps += 1
    st = json.loads(ch.state_json())
    assert st["model"] == "spread"
    assert st["finished"] is True
    assert st["ignited"] is True


def test_fallback_chamber_droplet_run_terminates():
    risks = fb.MaterialRisk()
    cfg = fb.ChamberConfig(materialId="heptane", model="droplet", o2Pct=21.0)
    ch = fb.Chamber(risks)
    ch.configure(cfg)
    steps = 0
    while not ch.finished() and steps < 5000:
        ch.step(1 / 30)
        steps += 1
    st = json.loads(ch.state_json())
    assert st["model"] == "droplet"
    assert st["finished"] is True
    assert st["burnFraction"] == pytest.approx(1.0, abs=1e-2)


def test_fallback_chambers_do_not_share_caller_config():
    """configure() must copy cfg (the C++ engine takes Config by value) —
    one chamber's update_atmosphere cannot leak into another."""
    cfg = fb.ChamberConfig(materialId="pmma", model="spread",
                           o2Pct=21.0, flowCms=5.0)
    risks = fb.MaterialRisk()
    a, b = fb.Chamber(risks), fb.Chamber(risks)
    a.configure(cfg)
    b.configure(cfg)
    before = b.ignition_pressure()
    a.update_atmosphere(0.0, 0.0, 101.0)
    assert cfg.o2Pct == 21.0          # caller's object untouched
    assert b.ignition_pressure() == pytest.approx(before)


def test_fallback_chambers_isolated_from_later_risk_table_mutation():
    """Chamber must own its MaterialRisk/Material copy — C++ passes both
    by value. Mutating the shared table must not rewrite live chambers."""
    risks = fb.MaterialRisk()
    cfg = fb.ChamberConfig(materialId="pmma", model="spread",
                           o2Pct=21.0, flowCms=5.0)
    a = fb.Chamber(risks)
    a.configure(cfg)
    before = a.ignition_pressure()
    # simulate a calibration reload: locPct jump would flip the pressure
    risks.table["pmma"].locPct = 30.0
    assert a.ignition_pressure() == pytest.approx(before)


def test_fallback_matches_cpp_engine_when_built():
    """Step both engines through the same run — states must agree."""
    if eb.ENGINE != "c++":
        pytest.skip("compiled engine not available in this environment")
    mats = json.dumps({"materials": eb.materials()})
    for inv_id, material, model, o2, flow in (
            ("saffire", "cotton", "spread", 21.0, 10.0),
            ("flex-2", "heptane", "droplet", 21.0, 0.0)):
        cpp = eb.make_chamber(inv_id, o2, flow, seed=7)
        risks_py = fb.MaterialRisk()
        risks_py.load_json(mats)
        # mirror the same chamber atmosphere make_chamber pulls from the
        # investigation spec (SAFFIRE runs at 70 kPa — pressure now scales
        # the spread rate)
        p_kpa = float(eb.investigation_map().get(inv_id, {})
                      .get("pressureKpa", 101))
        cfg = fb.ChamberConfig(investigationId=inv_id, materialId=material,
                               model=model, o2Pct=o2, flowCms=flow, seed=7,
                               pressureKpa=p_kpa)
        py = fb.Chamber(risks_py)
        py.configure(cfg)
        for _ in range(120):
            cpp.step(1 / 30)
            py.step(1 / 30)
        s_cpp, s_py = json.loads(cpp.state_json()), json.loads(py.state_json())
        assert s_py.keys() == s_cpp.keys()
        for k, v in s_cpp.items():
            if isinstance(v, float):
                assert s_py[k] == pytest.approx(v, rel=1e-9, abs=1e-9), k
            else:
                assert s_py[k] == v, k
        assert py.drain_events() == cpp.drain_events()


# ---------- investigation intelligence endpoints ----------

def test_investigations_leaderboard_shape_and_order():
    r = client.get("/api/investigations")
    assert r.status_code == 200
    j = r.json()
    assert set(j["weights"]) == {"flammability", "hiddenHazard",
                                 "explorationRelevance", "dataRichness"}
    assert abs(sum(j["weights"].values()) - 1.0) < 1e-9
    items = j["items"]
    assert len(items) >= 8
    # strictly ranked and every component inside [0,100]
    assert [c["rank"] for c in items] == list(range(1, len(items) + 1))
    assert all(items[i]["score"] >= items[i + 1]["score"]
               for i in range(len(items) - 1))
    for c in items:
        assert set(c["breakdown"]) == set(j["weights"])
        assert all(0.0 <= v <= 100.0 for v in c["breakdown"].values())
        assert 0.0 <= c["score"] <= 100.0


def test_investigation_detail_carrying_engine_fidelity():
    r = client.get("/api/investigations/flex-2")
    assert r.status_code == 200
    j = r.json()
    assert j["name"] == "FLEX-2"
    assert j["materialId"] == "heptane"
    assert j["engineFidelity"]["scoredRuns"] > 100
    assert j["engineFidelity"]["accuracy"] > 0.5
    assert j["stats"]["nRuns"] > 200
    assert j["stats"]["coolFlameRuns"] > 0
    assert j["summary"]
    assert j["sampleRuns"]


def test_investigation_detail_404_lists_known_ids():
    r = client.get("/api/investigations/nope")
    assert r.status_code == 404
    detail = r.json()["detail"]
    assert "nope" in detail and "flex-2" in detail


def test_insights_are_evidence_backed():
    r = client.get("/api/insights")
    assert r.status_code == 200
    j = r.json()
    assert j["labeledRuns"] > 300
    assert j["items"]
    for item in j["items"]:
        assert item["severity"] in ("high", "medium", "info")
        assert item["evidence"]          # every claim cites its counts
        assert item["sources"]
    ids = {i["id"] for i in j["items"]}
    assert "cool-flame-detection-gap" in ids
    assert "engine-fidelity-map" in ids
