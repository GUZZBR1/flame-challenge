#!/usr/bin/env python3
"""Validate the combustion engine against parsed PSI runs.

Replays every scored run in data/processed/experiments.csv through the
engine (compiled freefall_engine when available, else the pure-Python
mirror in backend/services/engine_fallback.py) and scores two things:

  1. outcome agreement — did the engine ignite / sustain / extinguish
     the way the real test sheet recorded?
        truth:  burnout|disruption -> "burn"
                extinction         -> "extinction"
                no-ignition        -> "no-ignition"
        pred:   no "ignited" event             -> "no-ignition"
                droplet burnFraction >= 0.995  -> "burn"
                spread front traversed slab    -> "burn"
                ignited but died early         -> "extinction"

    (0.995 not 0.95: a cool flame legitimately consumes most of the
    droplet before dying at extinctionDMinMm — burnFraction ~0.98 with
    fuel left is still a recorded extinction, not a burnout)
  2. burning-rate error — for droplet runs with a measured kavg,
     |K_engine(o2) - kavg| / kavg per material.

This is the metric every physics change is measured against: run it
before and after touching core/src/ or the calibration pipeline.

Usage:
    python data/pipelines/validate_engine.py
    python data/pipelines/validate_engine.py --tag baseline \
        --out data/processed/validation_baseline.json
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services import engine_bridge as eb  # noqa: E402

EXP_CSV = ROOT / "data" / "processed" / "experiments.csv"
CAL_PATH = ROOT / "shared" / "calibrated-data" / "calibration.json"
REPORT_OUT = ROOT / "data" / "processed" / "validation_report.json"

fe = eb.fe
BURN = {"burnout", "disruption"}
KNOWN_OUTCOMES = BURN | {"extinction", "no-ignition"}

DT = 0.02
MAX_STEPS = 5000  # 100 s — droplet burn + cool-flame tail fit inside

# droplet-family fuels: only meaningful under the droplet solver even
# when their investigation record maps elsewhere
DROPLET_MATERIALS = {"heptane", "methanol", "decanol", "iso-octane",
                     "jp8", "ethanol", "butanol", "decane"}


def predicted_burn_rate(mat: dict, o2: float, pressure_kpa: float) -> float:
    """Mirror of DropletFlame::burnRateK / engine_fallback._burn_rate_k."""
    pscale = min(max(pressure_kpa, 0.0) / 101.0, 1.5)
    k0 = mat.get("burnRateK0Mm2s") or 0.0
    slope = mat.get("burnRateKO2Mm2sPct") or 0.0
    if k0 or slope:
        return max(0.05, k0 + slope * o2) * pscale
    loc = float(mat.get("locPct", 17.0))
    margin = o2 - loc
    press = 0.0
    if margin > 0:
        press = min(1.0, 0.04 + 0.055 * margin ** 1.35)
    elif margin > -3.0:
        press = 0.04
    return (0.45 + 0.55 * press) * pscale


def run_chamber(row: dict, spec: dict | None, mat_ids: set[str]):
    """Replay one PSI run. Returns (pred_outcome, detail) or None."""
    mid = row.get("material_id") or ""
    spec = spec or {}
    model = spec.get("model")
    if not model:
        model = "droplet" if (row.get("droplet_d0_mm")
                              or mid in DROPLET_MATERIALS) else "spread"

    if model == "coflow":
        # ACME CFI burner runs: reduced-order criterion on the fitted
        # ramp constants (fuel is the lookup key — coflow fuels are not
        # material-table entries)
        fuel = (row.get("fuel") or mid).strip().lower()
        if not fuel:
            return None, "no-fuel"

        def _v(k: str) -> float:
            x = row.get(k)
            try:
                return float(x) if x not in (None, "") else -1.0
            except ValueError:
                return -1.0

        pred = eb.coflow_outcome(
            fuel, _v("o2_pct"), _v("o2_end_pct"),
            _v("mass_flow_lo_mgs"), _v("mass_flow_hi_mgs"),
            _v("burn_time_s"))
        return {0: "burn", 1: "extinction", 2: "no-ignition"}[pred], None

    if mid not in mat_ids:
        return None, "material-not-calibrated"
    o2 = row.get("o2_pct")
    if not o2:
        return None, "no-o2"
    o2 = float(o2)

    cfg = fe.ChamberConfig()
    cfg.investigationId = row.get("investigation_id") or ""
    cfg.materialId = mid
    cfg.o2Pct = o2
    cfg.model = model
    fr = spec.get("flowRangeCms") or [0, 10]
    cfg.flowCms = float(row["flow_cms"]) if row.get("flow_cms") \
        else (fr[0] + fr[1]) / 2
    cfg.pressureKpa = float(row["pressure_kpa"]) if row.get("pressure_kpa") \
        else float(spec.get("pressureKpa", 101))
    cfg.partialGravity = bool(spec.get("partialGravity", False))
    if row.get("droplet_d0_mm"):
        cfg.dropletD0Mm = float(row["droplet_d0_mm"])
    cfg.seed = 1

    ch = fe.Chamber(eb._risks)
    ch.configure(cfg)
    for _ in range(MAX_STEPS):
        ch.step(DT)
        if ch.finished():
            break

    events = set(ch.drain_events())
    if "ignited" not in events:
        return "no-ignition", None
    if cfg.model == "droplet":
        frac = json.loads(ch.state_json()).get("burnFraction", 0.0)
        return ("burn" if frac >= 0.995 else "extinction"), None
    burn_len = json.loads(ch.state_json()).get("burnLengthCm", 0.0)
    return ("burn" if burn_len >= cfg.slabLengthCm - 1e-6
            else "extinction"), None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="current",
                    help="label stored in the report (e.g. baseline)")
    ap.add_argument("--out", default=str(REPORT_OUT))
    ap.add_argument("--csv", default=str(EXP_CSV))
    args = ap.parse_args()

    cal = json.loads(CAL_PATH.read_text())
    mats = {m["id"]: m for m in cal.get("materials", [])}
    specs = cal.get("investigations", {})
    rows = list(csv.DictReader(open(args.csv, encoding="utf-8")))

    confusion: Counter = Counter()          # (truth, pred) -> n
    skipped: Counter = Counter()
    by_inv: dict[str, Counter] = defaultdict(Counter)
    by_mat: dict[str, Counter] = defaultdict(Counter)
    k_err: dict[str, list[float]] = defaultdict(list)
    scored = 0

    for r in rows:
        truth_raw = r.get("outcome") or "unknown"
        if truth_raw not in KNOWN_OUTCOMES:
            skipped[f"outcome:{truth_raw or 'none'}"] += 1
            continue
        truth = "burn" if truth_raw in BURN else truth_raw
        spec = specs.get(r.get("investigation_id"))
        pred, note = run_chamber(r, spec, set(mats))
        if pred is None:
            skipped[note or "?"] += 1
            continue
        scored += 1
        confusion[(truth, pred)] += 1
        inv = r.get("investigation_id") or "?"
        by_inv[inv]["n"] += 1
        by_inv[inv]["ok"] += truth == pred
        mid = r.get("material_id") or "?"
        by_mat[mid]["n"] += 1
        by_mat[mid]["ok"] += truth == pred
        if r.get("burn_rate_mm2_s") and mid in mats:
            k_meas = float(r["burn_rate_mm2_s"])
            if k_meas > 0:
                k_pred = predicted_burn_rate(
                    mats[mid], float(r["o2_pct"] or 21),
                    float(r["pressure_kpa"] or 101))
                k_err[mid].append(abs(k_pred - k_meas) / k_meas)

    correct = sum(n for (t, p), n in confusion.items() if t == p)
    report = {
        "generated": "validate_engine.py",
        "tag": args.tag,
        "engine": eb.ENGINE,
        "engineModule": eb.MODULE,
        "runsTotal": len(rows),
        "runsScored": scored,
        "accuracy": round(correct / scored, 4) if scored else None,
        "confusion": {f"{t}->{p}": n for (t, p), n in sorted(confusion.items())},
        "perInvestigation": {
            k: {"n": v["n"], "accuracy": round(v["ok"] / v["n"], 3)}
            for k, v in sorted(by_inv.items())},
        "perMaterial": {
            k: {"n": v["n"], "accuracy": round(v["ok"] / v["n"], 3)}
            for k, v in sorted(by_mat.items())},
        "burnRateRelErrMedian": {
            m: round(sorted(e)[len(e) // 2], 3) for m, e in sorted(k_err.items())},
        "skipped": dict(skipped.most_common()),
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2) + "\n")

    print(f"[validate:{args.tag}] engine={eb.ENGINE} "
          f"scored={scored}/{len(rows)} "
          f"accuracy={report['accuracy']}")
    print("  truth->pred:")
    for k, n in sorted(confusion.items()):
        print(f"    {k[0]:>11s} -> {k[1]:<11s} {n}")
    print("  per-investigation accuracy:")
    for k, v in report["perInvestigation"].items():
        print(f"    {k:22s} n={v['n']:4d}  {v['accuracy']}")
    if report["burnRateRelErrMedian"]:
        print("  burn-rate median |rel err|:")
        for m, e in report["burnRateRelErrMedian"].items():
            print(f"    {m:12s} {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
