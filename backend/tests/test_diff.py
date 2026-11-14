"""Investigation diff + ranking endpoints — the summarize/rank verbs."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.services import diff

client = TestClient(app)


def test_investigations_feed_covers_named_experiments():
    j = client.get("/api/investigations").json()
    invs = {i["id"]: i for i in j["investigations"]}
    # the names the challenge text calls out must all be present
    for iid in ("bass", "bass-ii", "flex-2", "same", "same-r", "spice",
                "slice", "acme", "acme-efield", "cfi", "saffire",
                "sofie-gel", "confined-combustion", "flare"):
        assert iid in invs, iid
    # dashboard attributes present on every record
    for inv in invs.values():
        assert inv["objectives"] and inv["sensors"], inv["id"]
        assert inv["testVariables"]["varied"], inv["id"]
        assert inv["themes"], inv["id"]
    # accession citations for the records backed by parsed runs
    assert invs["acme-efield"]["psiAccessions"] == ["PSI-22"]
    assert invs["bass"]["psiAccessions"] == ["PSI-26"]
    assert "PSI-22" in invs["acme"]["psiAccessions"]


def test_diffs_cards_are_real_run_pairs():
    j = client.get("/api/diffs").json()
    cards = {c["id"]: c for c in j["cards"]}
    assert len(cards) == len(diff.CURATED)
    flex = cards["flex-co2-vs-he"]
    changed = {c["field"] for c in flex["changed"]}
    held = {h["field"] for h in flex["held"]}
    # the suppressant swap is the point of the card
    assert "co2_pct" in changed and "he_pct" in changed
    # fuel and O₂ are the controls
    assert "fuel" in held and "o2_pct" in held
    assert flex["sameInvestigation"] is True


def test_diff_runs_field_math():
    d = diff.diff_runs("FLEX-154", "FLEX-239")
    assert d is not None
    fields = {c["field"] for c in d["changed"]} | \
             {h["field"] for h in d["held"]}
    # every populated field lands in exactly one bucket
    assert not ({c["field"] for c in d["changed"]}
                & {h["field"] for h in d["held"]})
    assert "co2_pct" in fields and "he_pct" in fields
    assert diff.diff_runs("nope", "FLEX-239") is None


def test_diff_endpoint_and_404():
    r = client.get("/api/diff", params={"a": "FLEX-154", "b": "FLEX-239"})
    assert r.status_code == 200
    assert r.json()["changed"]
    assert client.get("/api/diff", params={"a": "?", "b": "?"}
                      ).status_code == 404


def test_runs_picker_filters_by_accession():
    j = client.get("/api/runs", params={"accession": "PSI-22"}).json()
    assert j["runs"]
    assert all(r["accession"] == "PSI-22" for r in j["runs"])
    # umbrella id and accession disagree → empty, not wrong rows
    j2 = client.get("/api/runs", params={
        "investigation": "saffire", "accession": "PSI-22"}).json()
    assert j2["runs"] == []


def test_risk_rank_is_sorted_and_bounded():
    j = client.get("/api/risk/rank",
                   params={"o2Pct": 34.0, "gravity": "lunar"}).json()
    ranked = j["ranked"]
    assert len(ranked) <= 10
    scores = [r["riskIndex"] for r in ranked]
    assert scores == sorted(scores, reverse=True)
    # at 34% O₂ at least one material should sit above the floor
    assert scores[0] > 0
    assert client.get("/api/risk/rank", params={"o2Pct": "nan"}
                      ).status_code == 422
    assert client.get("/api/risk/rank", params={"top": 0}
                      ).status_code == 422


@pytest.mark.parametrize("card_id", ["flex-co2-vs-he", "flex-n2-vs-co2",
                                     "cfi-fuel-dilution", "bass-sphere-size",
                                     "saffire-cross-vehicle",
                                     "efield-fuel-matrix"])
def test_each_curated_card_links_back_to_psi(card_id):
    j = client.get("/api/diffs").json()
    card = next(c for c in j["cards"] if c["id"] == card_id)
    for run in (card["runA"], card["runB"]):
        assert run["accession"].startswith("PSI-")
        assert "psi.nasa.gov" in run["sourceUrl"]
