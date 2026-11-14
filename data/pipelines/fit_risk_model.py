"""Fit the cabin fire-risk model from normalized PSI experiment data.

Model (deterministic, interpretable — anchored on FLEX/CFI droplet data,
SoFIE/BASS-II spread limits and ACME sooting indices):

    margin(o2, loc)   = o2_pct - loc_pct
    P_ign(margin)     = 0                                margin <= -3
                        0.04                             -3 < margin <= 0   (µg low-O2 persistence, SoFIE)
                        min(1, 0.04 + 0.055*margin^1.35) margin > 0        (ignition-pressure curve)
    F_flow(flow)      = piecewise ventilation factor (radiative-extinction
                        window at very low flow, O2-supply enhancement in
                        the mid range, blow-off quench at high flow)
    H(material)       = 1 + 0.25*coolFlame + 0.15*smolder + 0.10*sootIndex
    risk_index        = clamp01( P_ign * F_flow * H )

LOC per material is re-estimated from parsed runs when enough burn/extinct
points exist; otherwise the calibrated default is kept. All sources are
recorded so the UI can distinguish PSI-fitted vs literature-seeded values.

Inputs:
    data/processed/experiments.csv          (normalize_experiments.py)
    shared/calibrated-data/calibration.json (calibrate_constants.py)

Outputs:
    shared/calibrated-data/risk_model.json
    frontend/src/data/risk_model.json       (bundle copy for offline TS mirror)

Usage:
    python data/pipelines/fit_risk_model.py
"""

from __future__ import annotations

import csv
import json
import math
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # data/
REPO = ROOT.parent
EXP_CSV = ROOT / "processed" / "experiments.csv"
CALIBRATION = REPO / "shared" / "calibrated-data" / "calibration.json"
OUT = REPO / "shared" / "calibrated-data" / "risk_model.json"
FRONTEND_OUT = REPO / "frontend" / "src" / "data" / "risk_model.json"

BURNED = {"burnout", "disruption"}
EXTINCT = {"extinction", "no-ignition"}

# ventilation factor anchor points (cm/s -> multiplier); linear between
# anchors: quiescent radiative window, mid-flow O2 supply, high-flow blow-off
FLOW_ANCHORS = [
    [0.0, 0.80],   # quiescent: radiative extinction regime (SoFIE-GEL)
    [2.0, 0.90],
    [8.0, 1.05],
    [18.0, 1.15],  # worst-case opposed flow (BASS-II envelope)
    [40.0, 1.00],
    [80.0, 0.70],  # stretch/blow-off dominated
    [150.0, 0.45],
]


def flow_factor(flow_cms: float, anchors: list[list[float]] = FLOW_ANCHORS) -> float:
    f = max(0.0, float(flow_cms))
    if f <= anchors[0][0]:
        return anchors[0][1]
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if f <= x1:
            return y0 + (y1 - y0) * (f - x0) / (x1 - x0)
    return anchors[-1][1]


def ignition_pressure(margin: float) -> float:
    """Keep parity with MaterialRisk::ignitionPressure (C++) / physics.ts."""
    if margin <= 0:
        return 0.04 if margin > -3.0 else 0.0
    return min(1.0, 0.04 + 0.055 * margin ** 1.35)


def empirical_loc(burned: list[float], extinct: list[float]) -> float | None:
    """LOC estimate = midpoint of the burn/extinct boundary region."""
    if not burned or not extinct:
        return None
    lo_burn, hi_ext = min(burned), max(extinct)
    if hi_ext < lo_burn:                       # clean separation
        return round((hi_ext + lo_burn) / 2.0, 1)
    # overlap: mean of boundary points (top quartile extinct, bottom quartile burned)
    ext_q = statistics.quantiles(extinct, n=4)[-1] if len(extinct) >= 4 else statistics.mean(extinct)
    burn_q = statistics.quantiles(burned, n=4)[0] if len(burned) >= 4 else statistics.mean(burned)
    return round((ext_q + burn_q) / 2.0, 1)


def main() -> int:
    rows: list[dict] = []
    if EXP_CSV.exists():
        with EXP_CSV.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
    cal = json.loads(CALIBRATION.read_text()) if CALIBRATION.exists() \
        else {"materials": []}

    stats: dict[str, dict] = {}
    for r in rows:
        mid = r.get("material_id")
        if not mid:
            continue
        s = stats.setdefault(mid, {"burned": [], "extinct": [], "cool": 0,
                                   "n": 0, "kavg": []})
        s["n"] += 1
        try:
            o2 = float(r["o2_pct"]) if r.get("o2_pct") else None
        except ValueError:
            o2 = None
        if o2 is not None:
            if r.get("outcome") in BURNED:
                s["burned"].append(o2)
            elif r.get("outcome") in EXTINCT:
                s["extinct"].append(o2)
        if r.get("cool_flame") in ("True", "true", True):
            s["cool"] += 1
        try:
            k = float(r["burn_rate_mm2_s"]) if r.get("burn_rate_mm2_s") else None
            if k:
                s["kavg"].append(k)
        except ValueError:
            pass

    materials: dict[str, dict] = {}
    fitted = 0
    for m in cal.get("materials", []):
        mid = m["id"]
        s = stats.get(mid)
        loc, loc_src = m.get("locPct", 17.0), "calibration"
        entry: dict = {
            "id": mid, "name": m.get("name", mid),
            "locPct": loc, "locSource": loc_src,
            "spreadMinCms": m.get("spreadMinCms"),
            "spreadMaxCms": m.get("spreadMaxCms"),
            "sootIndex": m.get("sootIndex", 0.3),
            "coolFlameCapable": bool(m.get("coolFlameCapable")),
            "smoldering": bool(m.get("smoldering")),
            "hiddenFactor": 1.0,
        }
        if s:
            loc_fit = empirical_loc(s["burned"], s["extinct"])
            entry["psiRuns"] = s["n"]
            entry["psiBurned"] = len(s["burned"])
            entry["psiExtinguished"] = len(s["extinct"])
            entry["psiCoolFlameRuns"] = s["cool"]
            if s["kavg"]:
                entry["burnRateMedianMm2s"] = round(statistics.median(s["kavg"]), 3)
            if loc_fit is not None and len(s["burned"]) + len(s["extinct"]) >= 6:
                entry["locPct"] = loc_fit
                entry["locSource"] = "psi-data"
                fitted += 1
        entry["hiddenFactor"] = round(
            1.0 + 0.25 * entry["coolFlameCapable"]
            + 0.15 * entry["smoldering"]
            + 0.10 * float(entry["sootIndex"]), 3)
        materials[mid] = entry

    model = {
        "generated": "fit_risk_model.py",
        "formula": {
            "description": "risk = clamp01(P_ign(o2-loc) * F_flow(flow) * H(material))",
            "ignitionBase": 0.04, "ignitionK": 0.055, "ignitionExp": 1.35,
            "residualBand": 3.0,
            "coolFlameAdd": 0.25, "smolderAdd": 0.15, "sootAdd": 0.10,
        },
        "flowAnchors": FLOW_ANCHORS,
        "materials": materials,
        "provenance": {
            "psiRunsParsed": len(rows),
            "materialsFittedFromPsi": fitted,
            "note": "locSource=psi-data -> LOC re-estimated from parsed PSI test "
                    "sheets; locSource=calibration -> literature-seeded value.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(model, indent=2))
    FRONTEND_OUT.parent.mkdir(parents=True, exist_ok=True)
    FRONTEND_OUT.write_text(json.dumps(model))

    print(f"[DONE] risk model -> {OUT.relative_to(REPO)}")
    print(f"       {len(materials)} materials, {fitted} LOC values fitted "
          f"from {len(rows)} parsed runs")
    for mid, s in sorted(stats.items(), key=lambda kv: -kv[1]['n'])[:8]:
        print(f"       {mid:14s} n={s['n']:4d} burned={len(s['burned']):4d} "
              f"extinct={len(s['extinct']):4d} cool={s['cool']:3d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
