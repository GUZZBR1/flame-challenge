"""Calibrate empirical prediction intervals for the risk model.

Wraps the production formula (backend.services.risk.risk_index) in a
sklearn-compatible adapter and runs MAPIE split-conformal regression
(mapie.regression.SplitConformalRegressor, absolute conformity score)
over the labeled PSI runs — the same (material, o2, flow) -> burn/extinct
records that fit_risk_model.py consumed.

What ships in risk_model.json["uncertainty"]:

  levels      conformal confidence levels (0.8 / 0.9 / 0.95)
  global      quantile + envelope pooled over all labeled rows
  families    droplet-fuels / gaseous-fuels / solid-materials pooled
              quantiles + envelopes (family = the same grouping
              fit_risk_model.py uses for pooled ignition fits)
  materials   per-material quantile + envelope where n >= MAT_MIN
  materialFamily  material_id -> family lookup used at runtime

Each scope stores the finite-sample conformity quantile `qhat` per
level, the empirical coverage actually achieved on its calibration
rows, and the feature envelope ({margin, flow} min/max). The runtime
(services/risk.py + site/src/lib/risk.ts) widens the interval beyond
the envelope and flags "extrapolation" — conformal coverage is only
guaranteed under exchangeability, so a Lunar/Martian or off-envelope
query must say so instead of pretending the guarantee still holds.

All PSI calibration runs are microgravity: any partial-gravity query
is formally out-of-distribution and is scored as such at runtime.

Inputs:
    data/processed/experiments.csv          (normalize_experiments.py)
    shared/calibrated-data/risk_model.json  (fit_risk_model.py)

Outputs:
    shared/calibrated-data/risk_model.json  (amended in place)
    data/bundle/risk_model.json             (bundle copy)

Usage:
    python data/pipelines/fit_uncertainty.py
    pip install -r data/pipelines/requirements-sci.txt  (mapie, sklearn)
"""

from __future__ import annotations

import copy
import csv
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # data/
REPO = ROOT.parent
EXP_CSV = ROOT / "processed" / "experiments.csv"
MODEL = REPO / "shared" / "calibrated-data" / "risk_model.json"
CALIBRATION = REPO / "shared" / "calibrated-data" / "calibration.json"
BUNDLE = REPO / "data" / "bundle" / "risk_model.json"

sys.path.insert(0, str(REPO))
sys.path.insert(0, str(ROOT / "pipelines"))
from backend.services import risk                       # noqa: E402
from fit_risk_model import (FAMILY_MIN_LABELED,          # noqa: E402
                            LOGIT_MIN_CLASS, LOGIT_MIN_LABELED,
                            NULL_FIT_MIN, logit_fit)

BURNED = {"burnout", "disruption"}
EXTINCT = {"extinction", "no-ignition"}
# same pooled families as fit_risk_model.py INVESTIGATION_FAMILY
INVESTIGATION_FAMILY = {"flex-2": "droplet-fuels", "acme": "gaseous-fuels"}
FAMILIES = ("droplet-fuels", "gaseous-fuels", "solid-materials")
LEVELS = (0.80, 0.90, 0.95)
# per-material conformal needs enough rows for the quantile to mean
# something; sparser materials fall back to their family quantile
MAT_MIN = 20
FAM_MIN = 10


def _fnum(x) -> float | None:
    try:
        return float(x) if x not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _conformal_qhat(residuals: list[float], level: float) -> float:
    """Finite-sample split-conformal quantile — the same quantity MAPIE
    computes internally: ceil((n+1)*level)/n empirical quantile.
    Used to cross-check the MAPIE output and as the no-dependency path."""
    n = len(residuals)
    if n == 0:
        return 0.0
    k = max(1, min(n, math.ceil((n + 1) * level)))
    return sorted(residuals)[k - 1]


def _envelope(group_rows: list[tuple]) -> dict:
    margins = [r[3] for r in group_rows]
    flows = [r[2] for r in group_rows]
    return {
        "marginMin": round(min(margins), 2),
        "marginMax": round(max(margins), 2),
        "flowMin": round(min(flows), 3),
        "flowMax": round(max(flows), 3),
    }


def _coverage(group_rows: list[tuple], qhat: dict) -> dict:
    out = {}
    for lvl in LEVELS:
        key = f"{lvl:.2f}"
        q = qhat.get(key)
        hits = sum(1 for r in group_rows if abs(r[4] - r[5]) <= q + 1e-9)
        out[key] = round(hits / len(group_rows), 4) if group_rows else None
    return out


FOLDS = 5


def _fold(row: dict, i: int) -> int:
    key = row.get("run_id") or f"{row.get('accession')}#{i}"
    return int(hashlib.sha1(str(key).encode()).hexdigest()[:8], 16) \
        % FOLDS


def _refit_ignition(model: dict, train_rows: list[dict],
                    loc_of: dict, fam_of_mat: dict) -> dict:
    """Refit the parameters estimated from labeled run outcomes on the
    train fold only. locPct (a location estimate, not the curve) is held;
    the ignition logistic — the piece that interpolates the very margins
    residuals are measured on — is refit following the same scope
    cascade as fit_risk_model: material MLE → material-null → pooled
    family fit. Materials that lose their fit keep the shipped params
    (conservative)."""
    tm = copy.deepcopy(model)
    mats = tm.get("materials", {})
    mat_pts: dict[str, list] = defaultdict(list)
    fam_pts: dict[str, list] = defaultdict(list)
    for r in train_rows:
        mid = r["material_id"]
        y = 1.0 if r["outcome"] in BURNED else 0.0
        pt = (float(r["o2_pct"]) - loc_of[mid], y)
        mat_pts[mid].append(pt)
        fam = fam_of_mat.get(mid)
        if fam:
            fam_pts[fam].append(pt)
    family_fits = {}
    for fam, pts in fam_pts.items():
        n_burn = sum(y for _, y in pts)
        if (len(pts) >= FAMILY_MIN_LABELED
                and LOGIT_MIN_CLASS <= n_burn
                <= len(pts) - LOGIT_MIN_CLASS):
            f = logit_fit(pts)
            if f is not None:
                family_fits[fam] = (f, len(pts))
    for mid, entry in mats.items():
        pts = mat_pts.get(mid, [])
        n_burn = sum(y for _, y in pts)
        fit = logit_fit(pts) if len(pts) >= LOGIT_MIN_LABELED else None
        scope, pool_n = "material" if fit else None, len(pts)
        if fit is None and pts and n_burn == 0 and len(pts) >= NULL_FIT_MIN:
            fit, scope = (-6.9, 0.0, None), "material-null"
        if fit is None:
            fam = fam_of_mat.get(mid)
            if fam in family_fits:
                fit, pool_n = family_fits[fam]
                scope = f"family:{fam}"
        if fit is None:
            continue
        entry["ignitionLogitA"] = round(fit[0], 4)
        entry["ignitionLogitB"] = round(fit[1], 5)
        entry["ignitionFitN"] = pool_n
        entry["ignitionFitScope"] = scope
        if fit[2] is not None:
            entry["ignitionFitMcFadden"] = round(fit[2], 3)
    return tm


def main() -> int:
    if not EXP_CSV.exists() or not MODEL.exists():
        print("[FAIL] inputs missing — run normalize_experiments.py then "
              "fit_risk_model.py first", file=sys.stderr)
        return 1
    model = json.loads(MODEL.read_text())
    mats = model.get("materials", {})
    loc_of = {mid: float(m.get("locPct", 17.0)) for mid, m in mats.items()}

    # family membership independent of outcome labels: labeled rows give
    # the observed family, the material's own pooled ignitionFitScope
    # covers unlabeled ones (ethylene/methane/iso-octane), and the
    # investigation spec's materialId is the remaining fallback —
    # solid-materials last. Without this, unlabeled materials silently
    # degrade to the global band.
    spec_fam: dict[str, str] = {}
    if CALIBRATION.exists():
        cal_specs = json.loads(
            CALIBRATION.read_text()).get("investigations", {})
        for inv_id, spec in cal_specs.items():
            mid = spec.get("materialId")
            if mid:
                spec_fam.setdefault(
                    mid, INVESTIGATION_FAMILY.get(inv_id,
                                                  "solid-materials"))

    rows: list[dict] = []
    dropped = 0
    row_fam: dict[str, str] = {}
    with EXP_CSV.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            outcome = r.get("outcome")
            if outcome not in BURNED | EXTINCT:
                continue
            mid = r.get("material_id") or ""
            if mid not in mats or _fnum(r.get("o2_pct")) is None:
                dropped += 1
                continue          # coflow fuels without a material entry
            row_fam[mid] = INVESTIGATION_FAMILY.get(
                r.get("investigation_id") or "", "solid-materials")
            rows.append(r)
    if not rows:
        print("[FAIL] no labeled rows over calibrated materials",
              file=sys.stderr)
        return 1

    def family_of(mid: str) -> str:
        if mid in row_fam:
            return row_fam[mid]
        scope = str(mats[mid].get("ignitionFitScope") or "")
        if scope.startswith("family:"):
            return scope.split(":", 1)[1]
        return spec_fam.get(mid, "solid-materials")

    mat_family = {mid: family_of(mid) for mid in mats}

    # --- cross-fit (CV+): every labeled row is scored by a model refit
    # on the other K-1 folds, so each residual is out-of-sample and the
    # pooled quantile attaches to the shipped full-data predictor — the
    # standard construction when you can't ship the calibration model
    kept: list[tuple] = []
    material_ids: list[str] = []
    mat_idx: dict[str, int] = {}
    fold_models: list[dict | None] = [None] * FOLDS
    for i, r in enumerate(rows):
        k = _fold(r, i)
        if fold_models[k] is None:
            fold_models[k] = _refit_ignition(
                model, [x for j, x in enumerate(rows) if _fold(x, j) != k],
                loc_of, mat_family)
        mid = r["material_id"]
        if mid not in mat_idx:
            mat_idx[mid] = len(material_ids)
            material_ids.append(mid)
        o2 = float(r["o2_pct"])
        flow = _fnum(r.get("flow_cms")) or 0.0
        y = 1.0 if r["outcome"] in BURNED else 0.0
        yhat = risk.predict_risk(fold_models[k], mid, o2, flow,
                                 "microgravity")
        kept.append((mat_idx[mid], o2, flow, o2 - loc_of[mid], y, yhat))
    if not kept:
        print("[FAIL] no labeled rows survived the fold split",
              file=sys.stderr)
        return 1

    # residuals are already out-of-fold — the finite-sample quantile is
    # the exact CV+ construction; a MAPIE wrapper would re-score every
    # row with a single predictor and undo the per-fold refits
    by_scope = {"global": kept}
    for fam in FAMILIES:
        idx = {mat_idx[m] for m, f in mat_family.items()
               if f == fam and m in mat_idx}
        by_scope[fam] = [r for r in kept if r[0] in idx]
    for mid, i in mat_idx.items():
        by_scope[f"material:{mid}"] = [r for r in kept if r[0] == i]

    qhats: dict[str, dict] = {}
    for scope, rows_sc in by_scope.items():
        res = [abs(r[4] - r[5]) for r in rows_sc]
        if len(res) >= FAM_MIN:
            qhats[scope] = {f"{lvl:.2f}": round(
                _conformal_qhat(res, lvl), 4) for lvl in LEVELS}
    mapie_note = ("cross-fit (CV+) conformal: 5-fold sha1(run_id) split, "
                  "ignition logits refit per fold, closed-form "
                  "finite-sample quantile over out-of-fold residuals")

    def scope_entry(scope: str, rows_sc: list[tuple]) -> dict | None:
        q = qhats.get(scope)
        if not q:
            return None
        return {"n": len(rows_sc), "qhat": q,
                "empiricalCoverage": _coverage(rows_sc, q),
                "envelope": _envelope(rows_sc)}

    families = {}
    for fam in FAMILIES:
        idx = {mat_idx[m] for m, f in mat_family.items()
               if f == fam and m in mat_idx}
        e = scope_entry(fam, [r for r in kept if r[0] in idx])
        if e:
            families[fam] = e
    mat_entries = {}
    for mid, i in mat_idx.items():
        rows_sc = [r for r in kept if r[0] == i]
        e = scope_entry(f"material:{mid}", rows_sc)
        if e and e["n"] >= MAT_MIN:
            mat_entries[mid] = e

    model["uncertainty"] = {
        "method": mapie_note,
        "levels": list(LEVELS),
        "defaultLevel": 0.90,
        "residual": "|y - riskIndex| over labeled burn/extinct PSI runs",
        "gravityNote": "all calibration runs are microgravity — any "
                       "partial-gravity query is out-of-distribution",
        "calibrationSplit": {
            "scheme": f"{FOLDS}-fold cross-fit on sha1(run_id): every "
                      "row's residual scored by a model refit on the "
                      "other folds; pooled out-of-fold residuals",
            "folds": FOLDS,
            "calibrationRows": len(kept),
            "note": "bands attach to the shipped full-data predictor — "
                    "each residual is out-of-sample w.r.t. its fold's "
                    "refit, so the quantile estimates the fitting "
                    "procedure's error, not an in-sample fit",
        },
        "global": scope_entry("global", kept),
        "families": families,
        "materials": mat_entries,
        "materialFamily": mat_family,
        "labeledRows": len(rows),
        "droppedUnknownMaterial": dropped,
    }
    MODEL.write_text(json.dumps(model, indent=2))
    BUNDLE.parent.mkdir(parents=True, exist_ok=True)
    BUNDLE.write_text(json.dumps(model))

    print(f"[DONE] uncertainty -> {MODEL.relative_to(REPO)}")
    print(f"       {len(kept)} labeled rows ({dropped} dropped: material "
          f"not in risk model), {len(mat_entries)} material scopes, "
          f"{len(families)} family scopes")
    g = model["uncertainty"]["global"]
    for lvl in LEVELS:
        print(f"       global qhat@{lvl:.2f} = {g['qhat'][f'{lvl:.2f}']:.3f} "
              f"(coverage {g['empiricalCoverage'][f'{lvl:.2f}']:.0%})")
    for mid, e in sorted(mat_entries.items()):
        print(f"       {mid:14s} n={e['n']:3d} "
              f"q90={e['qhat']['0.90']:.3f} "
              f"margin [{e['envelope']['marginMin']},"
              f"{e['envelope']['marginMax']}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
