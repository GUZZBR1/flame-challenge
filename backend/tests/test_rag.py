"""Regression tests for backend.services.rag review findings."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.services import rag

ROWS = [
    # run_id, accession, fuel, o2, outcome, file, burn_rate, cool_flame, inv
    ("r1", "PSI-144", "heptane", 15.0, "extinction", "f.csv", 0.5, True, "flex-2"),
    ("r2", "PSI-144", "heptane", 17.0, "burnout", "f.csv", 0.6, True, "flex-2"),
    ("r3", "PSI-159", "methane", 18.0, "extinction", "f.csv", 0.7, False, "acme"),
    ("r4", "PSI-151", "pmma", 19.0, "burnout", "f.csv", 0.8, False, "saffire"),
    # flex-2 row that is NOT a cool flame — makes the count filter matter
    ("r5", "PSI-144", "decane", 16.0, "burnout", "f.csv", 0.4, False, "flex-2"),
]


@pytest.fixture()
def fake_duck(monkeypatch):
    duckdb = pytest.importorskip("duckdb")
    conn = duckdb.connect(":memory:")
    conn.execute(
        "CREATE TABLE experiments (run_id VARCHAR, accession VARCHAR, "
        "fuel VARCHAR, o2_pct DOUBLE, outcome VARCHAR, source_file VARCHAR, "
        "burn_rate_mm2_s DOUBLE, cool_flame BOOLEAN, "
        "investigation_id VARCHAR)")
    conn.executemany("INSERT INTO experiments VALUES (?,?,?,?,?,?,?,?,?)", ROWS)
    monkeypatch.setattr(rag, "_duck", conn)
    monkeypatch.setattr(rag, "_ready", True)
    yield conn
    conn.close()


def test_grounding_explicit_name_beats_cool_flame_topic():
    _, inv, _ = rag._ground("ACME cool flame experiments")
    assert inv == "acme"


def test_grounding_cfi_g_maps_to_acme():
    _, inv, _ = rag._ground("CFI-G experiments")
    assert inv == "acme"


def test_grounding_no_substring_alias():
    _, inv, _ = rag._ground("Give me a breakdown of heptane runs")
    assert inv is None


def test_grounding_hyphenated_ids_and_topics():
    assert rag._ground("flex-2 droplet tests")[1] == "flex-2"
    assert rag._ground("how do cool flames behave")[1] == "flex-2"
    assert rag._ground("sofie-gel samples")[1] == "sofie-gel"


def test_cool_flame_count_is_filtered(fake_duck):
    res = rag.ask("how many cool flame runs")
    assert res["mode"] == "sql-rag"
    assert "2 matching" in res["answer"]
    assert sum(r["runs"] for r in res["rows"]) == 2


def test_plain_count_still_covers_all_rows(fake_duck):
    res = rag.ask("how many test runs")
    assert res["mode"] == "sql-rag"
    assert "5 matching" in res["answer"]


def test_concurrent_ask_and_stats_do_not_race(fake_duck):
    def work(i: int):
        if i % 3 == 0:
            return ("stats", rag.stats()["experimentRows"])
        return ("ask", rag.ask("how many cool flame runs")["answer"])

    with ThreadPoolExecutor(16) as ex:
        results = list(ex.map(work, range(48)))
    assert all(
        (kind == "stats" and value == 5)
        or (kind == "ask" and "2 matching" in value)
        for kind, value in results)
