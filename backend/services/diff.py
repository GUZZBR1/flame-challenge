"""Investigation diff — field-level comparison of real PSI test runs.

The challenge asks dashboards to show "how tests within an investigation
differed and what remained the same". Every row in
data/processed/experiments.csv is one normalized PSI test run; this
module diffs two runs field-by-field and emits the result as
changed / held pairs — the "diff card" a judge can audit end-to-end.

build_investigation_diffs.py freezes the curated pairs below into
data/bundle/investigation_diffs.json; the same functions also serve
arbitrary pairs live over /api/diff.
"""
from __future__ import annotations

import csv
import json
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXPERIMENTS = ROOT / "data" / "processed" / "experiments.csv"
DIFFS_BUNDLE = ROOT / "data" / "bundle" / "investigation_diffs.json"

# compared fields, in display order — labels are what the UI prints
FIELDS: list[tuple[str, str]] = [
    ("accession", "psi accession"),
    ("fuel", "fuel / sample"),
    ("material_id", "material"),
    ("o2_pct", "O₂ %"),
    ("n2_pct", "N₂ %"),
    ("co2_pct", "CO₂ %"),
    ("he_pct", "He %"),
    ("flow_cms", "flow cm/s"),
    ("pressure_kpa", "pressure kPa"),
    ("temp_k", "ambient K"),
    ("droplet_d0_mm", "droplet d₀ mm"),
    ("burn_rate_mm2_s", "burn rate mm²/s"),
    ("burn_time_s", "burn time s"),
    ("extinction_d_mm", "extinction Ø mm"),
    ("outcome", "outcome"),
    ("extinction_type", "extinction mode"),
    ("cool_flame", "cool flame"),
    ("fiber_support", "fiber support"),
]

# Curated pairs — real PSI runs whose diff shows a meaningful sweep.
# The card itself is the evidence: CHANGED lists every field that moved
# and HELD the controls, so where the record couples variables (pressure
# or droplet size moving with the intended one) the insight says so —
# exposing confounds is the point of the view.
CURATED: list[dict] = [
    {
        "id": "flex-co2-vs-he",
        "a": "FLEX-154",
        "b": "FLEX-239",
        "title": "FLEX — suppressant swap at fixed O₂",
        "hook": "co₂ vs he, 15% each",
        "insight": (
            "Same fuel (heptane), same 18% O₂, same 15% diluent fraction — "
            "CO₂ leaves a cool flame burning after the visible flame dies; "
            "He does not. Suppressant chemistry, not just O₂ displacement, "
            "decides whether a fire is really out. Caveat: the record also "
            "couples droplet size (3.7 vs 2.3 mm) — the changed list shows it."
        ),
    },
    {
        "id": "flex-n2-vs-co2",
        "a": "FLEX-065",
        "b": "FLEX-140",
        "title": "FLEX — diluent switch on methanol",
        "hook": "n₂ vs co₂ at 15% O₂",
        "insight": (
            "Methanol at 15% O₂: swapping 85% N₂ for 50% CO₂ did not change "
            "the terminal mode — both runs still ended in radiative "
            "extinction. Pressure also moved (102 → 71 kPa), so this pair "
            "shows the regime's robustness, not a boundary crossing."
        ),
    },
    {
        "id": "flex-o2-window",
        "a": "FLEX-008",
        "b": "FLEX-063",
        "title": "FLEX — the O₂ window on heptane",
        "hook": "21% vs 18% O₂ in N₂",
        "insight": (
            "Dropping O₂ from 21% to 18% moved heptane from disruption "
            "(flame torn off the droplet) to clean burnout — different "
            "terminal events, neither quiescent extinction. Droplet size "
            "co-varied (2.95 → 2.15 mm); treat the window as approximate."
        ),
    },
    {
        "id": "cfi-fuel-dilution",
        "a": "21112 F2",
        "b": "21130 A3",
        "title": "CFI-G — fuel dilution flips the outcome",
        "hook": "propane vs 30% propane",
        "insight": (
            "Cutting the fuel feed from propane to 30% propane flipped "
            "oxygen-limit extinction into no-ignition — but chamber "
            "pressure doubled (101 → 203 kPa) between the runs. The diff "
            "surfaces the coupling; the outcome flip can't be credited to "
            "fuel fraction alone."
        ),
    },
    {
        "id": "bass-sphere-size",
        "a": "20; 30",
        "b": "104; 50",
        "title": "BASS — the sample was the variable",
        "hook": "1 cm vs 2 cm pmma sphere",
        "insight": (
            "Same MSG duct, same polymer — BASS swept form factor (1 cm → "
            "2 cm spheres, slabs, sheets, candles). These two rows carry "
            "no outcome labels, so the card demonstrates the held/varied "
            "sweep itself rather than an outcome shift."
        ),
    },
    {
        "id": "saffire-cross-vehicle",
        "a": "PSI-98-row0",
        "b": "PSI-99-row4",
        "title": "SAFFIRE — same fabric, different vehicle",
        "hook": "sibal in two cargo ships",
        "insight": (
            "Independent burns of SIBAL fabric in two Cygnus vehicles at "
            "~21–22% O₂ / 20 cm/s — both ran to burnout. At vehicle scale, "
            "material identity beat vehicle identity."
        ),
    },
    {
        "id": "efield-fuel-matrix",
        "a": "PSI-22-row0",
        "b": "PSI-22-row14",
        "title": "ACME E-FIELD — fuel matrix under the field",
        "hook": "100% vs 40% ch₄",
        "insight": (
            "E-FIELD held burner and electrode rig constant while sweeping "
            "fuel composition (100% → 40% CH₄, also C₂H₄) — the runs here "
            "carry no outcome labels, so the card documents the matrix "
            "itself: one rig, many fuels, one 'gravity knob'."
        ),
    },
]


_lock = threading.Lock()
_rows: dict[str, dict] | None = None


def _load() -> dict[str, dict]:
    """run_id → raw experiments.csv row (parsed once)."""
    global _rows
    if _rows is not None:
        return _rows
    with _lock:
        if _rows is not None:
            return _rows
        rows: dict[str, dict] = {}
        if EXPERIMENTS.exists():
            with EXPERIMENTS.open(newline="", encoding="utf-8") as fh:
                for r in csv.DictReader(fh):
                    rid = (r.get("run_id") or "").strip()
                    # keep the first row per id — PSI ids are unique in the
                    # normalized set; collisions would make diffs ambiguous
                    if rid and rid not in rows:
                        rows[rid] = dict(r)
        _rows = rows
        return _rows


def reload() -> None:
    global _rows, _curated_cache
    _rows = None
    _curated_cache = None


def _val(row: dict, field: str) -> str:
    return (row.get(field) or "").strip()


def _same(a: str, b: str, field: str) -> bool:
    if a == b:
        return True
    # '21' vs '21.0' are the same condition; compare numerically when both
    # parse so the diff reports physics, not formatting
    try:
        fa, fb = float(a), float(b)
    except (TypeError, ValueError):
        return False
    return fa == fb


def diff_runs(run_a: str, run_b: str) -> dict | None:
    """Field-level diff of two normalized runs. None if an id is unknown."""
    rows = _load()
    ra, rb = rows.get(run_a), rows.get(run_b)
    if ra is None or rb is None:
        return None
    changed, held = [], []
    for field, label in FIELDS:
        va, vb = _val(ra, field), _val(rb, field)
        if not va and not vb:
            continue
        if va and vb and _same(va, vb, field):
            held.append({"field": field, "label": label, "value": va})
        else:
            changed.append({"field": field, "label": label,
                            "a": va, "b": vb})
    return {
        "runA": run_a,
        "runB": run_b,
        "investigationId": _val(ra, "investigation_id"),
        "sameInvestigation": (
            _val(ra, "investigation_id") == _val(rb, "investigation_id")),
        "accessions": [_val(ra, "accession"), _val(rb, "accession")],
        "changed": changed,
        "held": held,
        "sourceUrls": [_val(ra, "source_url"), _val(rb, "source_url")],
        "verified": [_val(ra, "verified").lower() == "true",
                     _val(rb, "verified").lower() == "true"],
    }


def _snapshot(run_id: str) -> dict:
    """Compact run card for the UI: non-empty compared fields + ids."""
    row = _load()[run_id]
    out = {"runId": run_id, "accession": _val(row, "accession"),
           "investigationId": _val(row, "investigation_id")}
    for field, _ in FIELDS:
        v = _val(row, field)
        if v and field not in out:
            out[field] = v
    out["comments"] = _val(row, "comments")
    out["sourceUrl"] = _val(row, "source_url")
    return out


def build_cards() -> list[dict]:
    """The curated diff cards — pair spec + computed changed/held."""
    cards = []
    for spec in CURATED:
        d = diff_runs(spec["a"], spec["b"])
        if d is None:
            continue
        cards.append({
            "id": spec["id"],
            "title": spec["title"],
            "hook": spec["hook"],
            "insight": spec["insight"],
            "runA": _snapshot(spec["a"]),
            "runB": _snapshot(spec["b"]),
            "investigationId": d["investigationId"],
            "sameInvestigation": d["sameInvestigation"],
            "accessions": d["accessions"],
            "changed": d["changed"],
            "held": d["held"],
            "verified": d["verified"],
        })
    return cards


_curated_cache: list[dict] | None = None


def curated() -> list[dict]:
    """Cards from the frozen bundle when present, else computed live —
    the API serves the same payload before and after the pipeline runs."""
    global _curated_cache
    if _curated_cache is not None:
        return _curated_cache
    if DIFFS_BUNDLE.exists():
        try:
            _curated_cache = json.loads(DIFFS_BUNDLE.read_text(
                encoding="utf-8"))["cards"]
            return _curated_cache
        except (OSError, json.JSONDecodeError, KeyError):
            pass
    _curated_cache = build_cards()
    return _curated_cache


def runs(investigation: str | None = None, accession: str | None = None,
         limit: int = 100) -> list[dict]:
    """Run picker feed — filterable by app investigation id or PSI
    accession (PSI-22 vs the umbrella 'acme' id)."""
    inv = (investigation or "").strip().lower()
    acc = (accession or "").strip().upper()
    out = []
    for rid, r in _load().items():
        if inv and _val(r, "investigation_id").lower() != inv:
            continue
        if acc and _val(r, "accession").upper() != acc:
            continue
        out.append({
            "runId": rid,
            "accession": _val(r, "accession"),
            "investigationId": _val(r, "investigation_id"),
            "fuel": _val(r, "fuel"),
            "o2Pct": _val(r, "o2_pct"),
            "flowCms": _val(r, "flow_cms"),
            "outcome": _val(r, "outcome"),
            "extinctionType": _val(r, "extinction_type"),
            "coolFlame": _val(r, "cool_flame").lower() == "true",
        })
        if len(out) >= limit:
            break
    return out
