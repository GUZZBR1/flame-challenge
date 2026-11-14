"""Fit the cabin fire-risk model from normalized PSI experiment data.

Model (deterministic, interpretable — anchored on FLEX/CFI droplet data,
SoFIE/BASS-II spread limits and ACME sooting indices):

    margin(o2, loc)   = o2_pct - loc_pct
    P_ign(margin)     = 0                                margin <= -3
                        sigmoid(A + B*margin)            PSI logistic fit
                                                         (ignitionLogitA/B;
                                                         scope material /
                                                         material-null /
                                                         family:<name>)
                        0.04                             -3 < margin <= 0   (unfitted fallback)
                        min(1, 0.04 + 0.055*margin^1.35) margin > 0        (unfitted fallback)
    F_flow(flow)      = piecewise ventilation factor (radiative-extinction
                        window at very low flow, O2-supply enhancement in
                        the mid range, blow-off quench at high flow)
    H(material)       = 1 + 0.25*coolFlame + 0.15*smolder + 0.10*sootIndex
    risk_index        = clamp01( P_ign * F_flow * H )
                        (callers multiply by G(gravity) — see
                        backend/services/risk.py GRAVITY_FACTOR)

LOC per material is re-estimated from parsed runs when enough burn/extinct
points exist; otherwise the calibrated default is kept. All sources are
recorded so the UI can distinguish PSI-fitted vs literature-seeded values.

Inputs:
    data/processed/experiments.csv          (normalize_experiments.py)
    shared/calibrated-data/calibration.json (calibrate_constants.py)

Outputs:
    shared/calibrated-data/risk_model.json
    data/bundle/risk_model.json             (bundle copy)

Usage:
    python data/pipelines/fit_risk_model.py
"""

from __future__ import annotations

import csv
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # data/
REPO = ROOT.parent
EXP_CSV = ROOT / "processed" / "experiments.csv"
CALIBRATION = REPO / "shared" / "calibrated-data" / "calibration.json"
OUT = REPO / "shared" / "calibrated-data" / "risk_model.json"
BUNDLE_OUT = REPO / "data" / "bundle" / "risk_model.json"

BURNED = {"burnout", "disruption"}
EXTINCT = {"extinction", "no-ignition"}

# extinction regimes that actually bound flammability — 'radiative' and
# 'cool-flame' extinctions happen at ANY O2 (they are not limit evidence)
LIMIT_EXTINCT = {"oxygen-limit", "suppressant", "quiescent", "blow-off"}
# no-ignition is direct LOC evidence, but only below a plausible ceiling —
# ACME burner rows record no-ignition at 21-85% O2 for mechanical reasons
NOIGN_MAX_O2 = 25.0
# LOC fitting is restricted to droplet-family fuels (FLEX): for coflow
# gaseous flames "extinction" is a strain/blowoff limit, not an oxygen
# flammability limit — a boundary fit there produces meaningless LOCs
DROPLET_INVESTIGATIONS = {"flex-2"}
# sanity window for a fitted LOC (rejects degenerate envelopes; the
# literature range for condensable/gaseous fuels is ~10.5-16.5%)
LOC_FIT_MIN, LOC_FIT_MAX = 10.0, 17.0

# burn-rate fit: K(o2) = k0 + slope*o2_pct, least squares over runs with
# both fields; needs this many points to be written into the engine table
KFIT_MIN_POINTS = 8
# logistic ignition fit P(sustained burn | margin): per-material needs
# this many labeled rows with both classes present; materials whose
# labeled record is all-extinct get an explicit "never sustained burn"
# curve instead of falling back to a pooled estimate
LOGIT_MIN_LABELED = 25
LOGIT_MIN_CLASS = 5
NULL_FIT_MIN = 15
FAMILY_MIN_LABELED = 30
# fuel families for pooled fits — droplet fuels share FLEX physics,
# coflow gas fuels share ACME strain/extinction physics, solids are the
# BASS-II/SAFFIRE family
INVESTIGATION_FAMILY = {"flex-2": "droplet-fuels", "acme": "gaseous-fuels"}
# hot-flame extinction diameter = median Dext over radiative + cool-flame
# typed extinctions (the regimes that kill the hot flame while the droplet
# is still large — FLEX); minimum sustainable diameter = median Dext
# over oxygen-limit extinctions (the terminal burn-out size every
# combustion regime dies at, hot or cool)
DEXT_HOT_TYPES = {"radiative", "cool-flame"}
DEXT_HOT_MIN_POINTS = 3
DEXT_MIN_MIN_POINTS = 5

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


def ignition_pressure(margin: float, material: dict | None = None) -> float:
    """Keep parity with MaterialRisk::ignitionPressure (C++) / risk.ts."""
    if margin <= -3.0:
        return 0.0
    if material and float(material.get("ignitionFitN") or 0) > 0:
        z = material["ignitionLogitA"] + material["ignitionLogitB"] * margin
        return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, z))))
    if margin <= 0:
        return 0.04
    return min(1.0, 0.04 + 0.055 * margin ** 1.35)


def sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, z))))


def logit_fit(pts: list[tuple[float, float]]) -> tuple[float, float, float] | None:
    """Newton/IRLS logistic regression y ~ sigmoid(a + b*x).
    Returns (a, b, mcfadden_r2) or None for single-class inputs."""
    n = len(pts)
    if n < 4:
        return None
    ys = [y for _, y in pts]
    p0 = sum(ys) / n
    if p0 <= 0.0 or p0 >= 1.0:
        return None                        # single class → no MLE
    a, b = math.log(p0 / (1.0 - p0)), 0.0
    for _ in range(64):
        g0 = g1 = h00 = h01 = h11 = 0.0
        for x, y in pts:
            p = sigmoid(a + b * x)
            w = p * (1.0 - p)
            r = y - p
            g0 += r
            g1 += r * x
            h00 += w
            h01 += w * x
            h11 += w * x * x
        h00 += 1e-6                        # ridge — keeps det positive
        det = h00 * h11 - h01 * h01
        if det <= 1e-12:
            break
        da = max(-10.0, min(10.0, (g0 * h11 - g1 * h01) / det))
        db = max(-10.0, min(10.0, (g1 * h00 - g0 * h01) / det))
        a += da
        b += db
        if abs(da) < 1e-9 and abs(db) < 1e-9:
            break
    ll = sum(y * math.log(max(sigmoid(a + b * x), 1e-9))
             + (1 - y) * math.log(max(1.0 - sigmoid(a + b * x), 1e-9))
             for x, y in pts)
    ll0 = n * (p0 * math.log(p0) + (1.0 - p0) * math.log(1.0 - p0))
    return a, b, (1.0 - ll / ll0) if ll0 < 0 else 0.0


def family_of(investigation_id: str | None) -> str:
    return INVESTIGATION_FAMILY.get(investigation_id or "", "solid-materials")


def linfit(pts: list[tuple[float, float]]) -> tuple[float, float, float] | None:
    """Least-squares y = a + b*x over (x, y) points.
    Returns (a, b, r2) or None for degenerate inputs."""
    n = len(pts)
    if n < 2:
        return None
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    sxx = sum((p[0] - mx) ** 2 for p in pts)
    if sxx <= 0:
        return None
    b = sum((p[0] - mx) * (p[1] - my) for p in pts) / sxx
    a = my - b * mx
    sst = sum((p[1] - my) ** 2 for p in pts)
    ss_res = sum((p[1] - a - b * p[0]) ** 2 for p in pts)
    r2 = 1.0 - ss_res / sst if sst > 0 else 0.0
    return a, b, r2


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
    if not CALIBRATION.exists():
        print(f"[FAIL] calibration input missing: {CALIBRATION}\n"
              "       run data/pipelines/build_dataset.py then "
              "data/pipelines/calibrate_constants.py first — fitting "
              "without calibrated materials would write an empty risk model",
              file=sys.stderr)
        return 1
    cal = json.loads(CALIBRATION.read_text())
    # preserve the literature LOC in its own field — once a psi-data fit
    # is written back, locPct alone can no longer tell fit from baseline
    for m in cal.get("materials", []):
        m.setdefault("locBaseline", m.get("locPct"))

    stats: dict[str, dict] = {}
    for r in rows:
        mid = r.get("material_id")
        if not mid:
            continue
        s = stats.setdefault(mid, {"burned": [], "extinct": [], "cool": 0,
                                   "n": 0, "kavg": [], "kpts": [],
                                   "dext": [], "dext_hot": [],
                                   "dext_min": [], "ext_limit": [],
                                   "labeled": [], "families": Counter(),
                                   "droplet": False})
        s["n"] += 1
        s["families"][family_of(r.get("investigation_id"))] += 1
        if r.get("investigation_id") in DROPLET_INVESTIGATIONS:
            s["droplet"] = True
        try:
            o2 = float(r["o2_pct"]) if r.get("o2_pct") else None
        except ValueError:
            o2 = None
        if o2 is not None:
            if r.get("outcome") in BURNED:
                s["burned"].append(o2)
                s["labeled"].append((o2, 1.0))
            elif r.get("outcome") in EXTINCT:
                s["extinct"].append(o2)
                s["labeled"].append((o2, 0.0))
                if (r.get("extinction_type") in LIMIT_EXTINCT
                        or (r.get("outcome") == "no-ignition"
                            and o2 <= NOIGN_MAX_O2)):
                    s["ext_limit"].append(o2)
        try:
            d = float(r["extinction_d_mm"]) if r.get("extinction_d_mm") else None
            if d:
                s["dext"].append(d)
                etype = r.get("extinction_type")
                if etype in DEXT_HOT_TYPES:
                    s["dext_hot"].append(d)
                elif etype == "oxygen-limit":
                    s["dext_min"].append(d)
        except ValueError:
            pass
        if r.get("cool_flame") in ("True", "true", True):
            s["cool"] += 1
        try:
            k = float(r["burn_rate_mm2_s"]) if r.get("burn_rate_mm2_s") else None
            if k:
                s["kavg"].append(k)
                if o2 is not None:
                    s["kpts"].append((o2, k))
        except ValueError:
            pass

    materials: dict[str, dict] = {}
    fitted = 0
    for m in cal.get("materials", []):
        mid = m["id"]
        s = stats.get(mid)
        loc, loc_src = m.get("locBaseline", m.get("locPct", 17.0)), "calibration"
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
            entry["psiRuns"] = s["n"]
            entry["psiBurned"] = len(s["burned"])
            entry["psiExtinguished"] = len(s["extinct"])
            entry["psiCoolFlameRuns"] = s["cool"]
            if s["extinct"]:
                # measured extinction-limit envelope (NOT classical LOC —
                # radiative extinctions at high O2 are part of the envelope)
                entry["extinctionLimitMinPct"] = round(min(s["extinct"]), 1)
                entry["extinctionLimitMaxPct"] = round(max(s["extinct"]), 1)
            if s["dext"]:
                entry["extinctionDiameterMedianMm"] = round(
                    statistics.median(s["dext"]), 2)
            # FLEX extinction diameters feed the engine directly:
            # extinctionDHotMm — droplets at/above this size lose the hot
            # flame to radiative loss (or transition to cool-flame
            # chemistry); extinctionDMinMm — minimum sustainable droplet
            # diameter: the terminal burn-out size every combustion
            # regime dies at. Both are measured medians, not tuned.
            if len(s["dext_hot"]) >= DEXT_HOT_MIN_POINTS:
                entry["extinctionDHotMm"] = round(
                    statistics.median(s["dext_hot"]), 2)
            if len(s["dext_min"]) >= DEXT_MIN_MIN_POINTS:
                entry["extinctionDMinMm"] = round(
                    statistics.median(s["dext_min"]), 2)
            if s["kavg"]:
                entry["burnRateMedianMm2s"] = round(statistics.median(s["kavg"]), 3)
            # K(o2) linear fit — the engine burns with measured droplet
            # rates instead of deriving K from the ignition-pressure curve
            if len(s["kpts"]) >= KFIT_MIN_POINTS:
                fit = linfit(s["kpts"])
                if fit is not None:
                    a, b, r2 = fit
                    entry["burnRateK0Mm2s"] = round(a, 4)
                    entry["burnRateKO2Mm2sPct"] = round(b, 5)
                    entry["burnRateFitR2"] = round(r2, 3)
            # LOC refit — two estimators, both labelled in locMethod:
            #  1. boundary-midpoint: clean burn/extinct separation (rare —
            #     radiative extinctions at high O2 usually overlap)
            #  2. extinction-floor: droplet fuels only; the median of the
            #     three lowest limit-type extinctions approximates the
            #     empirical flammability floor — the O2 at which the flame
            #     demonstrably still dies. Robust to a single outlier row;
            #     radiative/cool-flame extinctions excluded via ext_limit.
            loc_fit = empirical_loc(s["burned"], s["extinct"])
            if (loc_fit is not None and s["burned"] and s["extinct"]
                    and max(s["extinct"]) < min(s["burned"])
                    and len(s["burned"]) + len(s["extinct"]) >= 6):
                entry["locPct"] = loc_fit
                entry["locSource"] = "psi-data"
                entry["locMethod"] = "boundary-midpoint"
                fitted += 1
            elif s["droplet"] and len(s["ext_limit"]) >= 10:
                floor = statistics.median(sorted(s["ext_limit"])[:3])
                if LOC_FIT_MIN <= floor <= LOC_FIT_MAX:
                    entry["locPct"] = round(floor, 1)
                    entry["locSource"] = "psi-data"
                    entry["locMethod"] = "extinction-floor"
                    fitted += 1
        entry["hiddenFactor"] = round(
            1.0 + 0.25 * entry["coolFlameCapable"]
            + 0.15 * entry["smoldering"]
            + 0.10 * float(entry["sootIndex"]), 3)
        materials[mid] = entry

    # ---- logistic ignition fit: P(sustained burn | margin) -----------
    # margin uses each material's final locPct — the same value the
    # engine uses at runtime. Priority: per-material fit > explicit
    # all-extinct null curve > pooled family curve > hand-set formula.
    mat_family: dict[str, str] = {}
    for mid, s in stats.items():
        if s["families"]:
            mat_family[mid] = s["families"].most_common(1)[0][0]
    # table materials with no parsed runs inherit the family of the
    # investigation spec that references them (ethylene → acme → gases)
    for inv_id, spec in cal.get("investigations", {}).items():
        if spec.get("materialId"):
            mat_family.setdefault(spec["materialId"], family_of(inv_id))

    family_pts: dict[str, list] = defaultdict(list)
    mat_pts: dict[str, list] = {}
    for m in cal.get("materials", []):
        mid = m["id"]
        s = stats.get(mid)
        if not s or not s["labeled"]:
            continue
        loc = materials[mid]["locPct"]
        pts = [(o2 - loc, y) for o2, y in s["labeled"]]
        mat_pts[mid] = pts
        fam = mat_family.get(mid)
        if fam:
            family_pts[fam].extend(pts)

    family_fits: dict[str, tuple] = {}
    for fam, pts in family_pts.items():
        n_burn = sum(y for _, y in pts)
        if (len(pts) >= FAMILY_MIN_LABELED and n_burn >= LOGIT_MIN_CLASS
                and len(pts) - n_burn >= LOGIT_MIN_CLASS):
            fit = logit_fit(pts)
            if fit is not None:
                family_fits[fam] = fit

    logit_fitted = 0
    for m in cal.get("materials", []):
        mid = m["id"]
        entry = materials.get(mid)
        if entry is None:
            continue
        pts = mat_pts.get(mid, [])
        n_burn = sum(y for _, y in pts)
        fit = logit_fit(pts) if len(pts) >= LOGIT_MIN_LABELED else None
        scope = "material" if fit is not None else None
        pool_n = len(pts)
        if fit is None and pts and n_burn == 0 and len(pts) >= NULL_FIT_MIN:
            # every labeled run failed to sustain burning — an honest
            # near-zero curve, not a logistic MLE (none exists for a
            # single-class response)
            fit, scope = (-6.9, 0.0, None), "material-null"
        if fit is None:
            fam = mat_family.get(mid)
            if fam in family_fits:
                fit, scope = family_fits[fam], f"family:{fam}"
                pool_n = len(family_pts[fam])
        if fit is None:
            continue
        entry["ignitionLogitA"] = round(fit[0], 4)
        entry["ignitionLogitB"] = round(fit[1], 5)
        entry["ignitionFitN"] = pool_n
        entry["ignitionFitScope"] = scope
        if fit[2] is not None:
            entry["ignitionFitMcFadden"] = round(fit[2], 3)
        logit_fitted += 1

    # propagate the canonical LOC back into calibration.json — the C++
    # chamber (materials[].locPct), the backend bridge and the TS fallback
    # must all burn with ONE value; investigations[].effectiveLoc follows
    # the same loc ?? material rule calibrate_constants.py emits. This
    # runs every time, not only when something fitted: a material whose
    # evidence dropped below the fitting bar reverts to locBaseline
    # instead of silently keeping a stale psi-data number.
    FIT_FIELDS = ("burnRateK0Mm2s", "burnRateKO2Mm2sPct", "burnRateFitR2",
                  "extinctionDHotMm", "extinctionDMinMm",
                  "ignitionLogitA", "ignitionLogitB", "ignitionFitN",
                  "ignitionFitScope", "ignitionFitMcFadden")
    # renamed/dropped engine fields — always popped so a stale key from
    # an older fit can't shadow the current semantics
    DEAD_FIELDS = ("extinctionDCoolMm",)
    for m in cal.get("materials", []):
        fitted_mat = materials.get(m["id"])
        if fitted_mat and fitted_mat.get("locSource") == "psi-data":
            m["locPct"] = fitted_mat["locPct"]
            m["locSource"] = "psi-data"
            if fitted_mat.get("locMethod"):
                m["locMethod"] = fitted_mat["locMethod"]
        elif m.get("locSource") == "psi-data":
            m["locPct"] = m.get("locBaseline", m["locPct"])
            m["locSource"] = "calibration"
            m.pop("locMethod", None)
        # measured engine fields follow the same contract as locPct —
        # written when the data supports a fit, removed when it doesn't,
        # so a shrinking dataset can't leave stale physics behind
        for f in FIT_FIELDS:
            if fitted_mat and f in fitted_mat:
                m[f] = fitted_mat[f]
            else:
                m.pop(f, None)
        for f in DEAD_FIELDS:
            m.pop(f, None)
    mat_loc = {m["id"]: m.get("locPct") for m in cal.get("materials", [])}
    for spec in cal.get("investigations", {}).values():
        spec["effectiveLoc"] = spec.get("loc") \
            if spec.get("loc") is not None \
            else mat_loc.get(spec.get("materialId"))
    CALIBRATION.write_text(json.dumps(cal, indent=2))
    bundle_cal = REPO / "data" / "bundle" / "calibration.json"
    bundle_cal.parent.mkdir(parents=True, exist_ok=True)
    bundle_cal.write_text(json.dumps(cal))

    model = {
        "generated": "fit_risk_model.py",
        "formula": {
            "description": "risk = clamp01(P_ign(o2-loc) * F_flow(flow) * H(material))",
            "ignitionBase": 0.04, "ignitionK": 0.055, "ignitionExp": 1.35,
            "residualBand": 3.0,
            "coolFlameAdd": 0.25, "smolderAdd": 0.15, "sootAdd": 0.10,
        },
        # flowAnchors come from calibration.json (calibrate_constants.py
        # is the canonical owner); the local table is a fallback
        "flowAnchors": cal.get("flowAnchors") or FLOW_ANCHORS,
        "materials": materials,
        "provenance": {
            "psiRunsParsed": len(rows),
            "materialsFittedFromPsi": fitted,
            "note": "locSource=psi-data -> LOC re-estimated from parsed PSI "
                    "test sheets: locMethod=boundary-midpoint for clean "
                    "burn/extinct separation, extinction-floor for "
                    "droplet fuels (median of 3 lowest limit-type "
                    "radiative/cool-flame extinctions excluded). "
                    "locSource=calibration -> literature-seeded. "
                    "extinctionLimitMin/MaxPct = measured extinction "
                    "envelope (includes radiative extinctions — not a "
                    "flammability limit). burnRateK0/KO2Mm2sPct = "
                    "least-squares K(o2) over measured kavg (engine "
                    "d²-law rate). extinctionDHotMm = median Dext over "
                    "radiative+cool-flame extinctions (large-droplet "
                    "hot-flame death); extinctionDMinMm = median Dext "
                    "over oxygen-limit extinctions (terminal "
                    "diameter all combustion dies at). "
                    "ignitionLogitA/B = logistic P(sustained burn | "
                    "o2-loc): scope=material (per-material MLE), "
                    "material-null (all labeled runs extinct — no MLE "
                    "exists, ~0 curve written explicitly), or "
                    "family:<name> (pooled droplet-fuels/gaseous-fuels/"
                    "solid-materials fit). ignitionFitMcFadden = "
                    "pseudo-R2 of the fit.",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(model, indent=2))
    BUNDLE_OUT.parent.mkdir(parents=True, exist_ok=True)
    BUNDLE_OUT.write_text(json.dumps(model))

    print(f"[DONE] risk model -> {OUT.relative_to(REPO)}")
    print(f"       {len(materials)} materials, {fitted} LOC values fitted "
          f"from {len(rows)} parsed runs, "
          f"{logit_fitted} logistic ignition curves")
    for mid, entry in sorted(materials.items()):
        if entry.get("ignitionFitScope"):
            print(f"       {mid:14s} {entry['ignitionFitScope']:>20s} "
                  f"a={entry['ignitionLogitA']:+.3f} "
                  f"b={entry['ignitionLogitB']:+.4f} "
                  f"n={entry['ignitionFitN']}")
    for mid, s in sorted(stats.items(), key=lambda kv: -kv[1]['n'])[:8]:
        print(f"       {mid:14s} n={s['n']:4d} burned={len(s['burned']):4d} "
              f"extinct={len(s['extinct']):4d} cool={s['cool']:3d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
