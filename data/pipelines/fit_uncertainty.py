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

import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # data/
REPO = ROOT.parent
EXP_CSV = ROOT / "processed" / "experiments.csv"
MODEL = REPO / "shared" / "calibrated-data" / "risk_model.json"
BUNDLE = REPO / "data" / "bundle" / "risk_model.json"

sys.path.insert(0, str(REPO))
from backend.services import risk                       # noqa: E402

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


def _mapie_predict(material_ids: list[str], X_cal, y_cal):
    """Run MAPIE split-conformal on (X_cal, y_cal); returns the
    per-level halfwidths MAPIE produces for the absolute score."""
    import numpy as np
    from mapie.regression import SplitConformalRegressor
    from sklearn.base import BaseEstimator, RegressorMixin

    class RiskRegressor(RegressorMixin, BaseEstimator):
        """Prefit adapter — predict() delegates to the production risk
        formula so MAPIE calibrates the shipped model, not a proxy.
        X rows are [material_index, o2_pct, flow_cms]."""

        # prefit marker — MAPIE inspects this instead of calling fit()
        n_features_in_ = 3

        def fit(self, X, y=None):  # noqa: N803 - sklearn signature
            return self

        def predict(self, X):  # noqa: N803 - sklearn signature
            X = np.asarray(X, dtype=float).reshape(-1, 3)
            return np.array([
                risk.risk_index(material_ids[int(mi)], float(o2),
                                float(fl), "microgravity")["riskIndex"]
                for mi, o2, fl in X
            ])

    reg = SplitConformalRegressor(
        estimator=RiskRegressor(),
        confidence_level=list(LEVELS),
        conformity_score="absolute",
        prefit=True,
    )
    reg.conformalize(np.asarray(X_cal, dtype=float),
                     np.asarray(y_cal, dtype=float))
    # absolute score -> symmetric, point-independent intervals: read the
    # halfwidth off a single conformalized row per level.
    _, bounds = reg.predict_interval(np.asarray(X_cal[:1], dtype=float))
    bounds = np.asarray(bounds, dtype=float)
    # shape: (n, 2, n_levels) — lower/upper per level
    hw = (bounds[0, 1, :] - bounds[0, 0, :]) / 2.0
    return {lvl: float(w) for lvl, w in zip(LEVELS, hw)}


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


def main() -> int:
    if not EXP_CSV.exists() or not MODEL.exists():
        print("[FAIL] inputs missing — run normalize_experiments.py then "
              "fit_risk_model.py first", file=sys.stderr)
        return 1
    model = json.loads(MODEL.read_text())
    mats = model.get("materials", {})
    loc_of = {mid: float(m.get("locPct", 17.0)) for mid, m in mats.items()}

    # row tuple: (mat_idx, o2, flow, margin, y, yhat) — material_index
    # indexes material_ids (the sklearn adapter can't carry strings)
    kept: list[tuple] = []
    material_ids: list[str] = []
    mat_idx: dict[str, int] = {}
    mat_family: dict[str, str] = {}
    dropped = 0
    with EXP_CSV.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            outcome = r.get("outcome")
            if outcome not in BURNED | EXTINCT:
                continue
            mid = r.get("material_id") or ""
            if mid not in mats:
                dropped += 1
                continue          # coflow fuels without a material entry
            o2 = _fnum(r.get("o2_pct"))
            if o2 is None:
                dropped += 1
                continue
            flow = _fnum(r.get("flow_cms")) or 0.0
            if mid not in mat_idx:
                mat_idx[mid] = len(material_ids)
                material_ids.append(mid)
            fam = INVESTIGATION_FAMILY.get(r.get("investigation_id") or "",
                                           "solid-materials")
            mat_family[mid] = fam
            y = 1.0 if outcome in BURNED else 0.0
            yhat = risk.risk_index(mid, o2, flow, "microgravity")["riskIndex"]
            kept.append((mat_idx[mid], o2, flow, o2 - loc_of[mid], y, yhat))
    if not kept:
        print("[FAIL] no labeled rows over calibrated materials",
              file=sys.stderr)
        return 1

    try:
        import numpy as np
        by_scope = {"global": kept}
        for fam in FAMILIES:
            idx = {mat_idx[m] for m, f in mat_family.items() if f == fam}
            by_scope[fam] = [r for r in kept if r[0] in idx]
        for mid, i in mat_idx.items():
            by_scope[f"material:{mid}"] = [r for r in kept if r[0] == i]

        qhats: dict[str, dict] = {}
        residuals: dict[str, list] = {}
        for scope, rows_sc in by_scope.items():
            residuals[scope] = [abs(r[4] - r[5]) for r in rows_sc]
        # single MAPIE call per scope that has enough rows
        for scope, rows_sc in by_scope.items():
            if len(rows_sc) < FAM_MIN:
                continue
            X = [[r[0], r[1], r[2]] for r in rows_sc]
            y = [r[4] for r in rows_sc]
            qh = _mapie_predict(material_ids, X, y)
            # cross-check against the closed-form quantile — identical
            # math, so a divergence means the MAPIE call path drifted
            for lvl in LEVELS:
                ref = _conformal_qhat(residuals[scope], lvl)
                assert abs(qh[lvl] - ref) < 1e-6, \
                    f"mapie/manual quantile drift on {scope}@{lvl}"
            qhats[scope] = {f"{k:.2f}": round(v, 4) for k, v in qh.items()}
        mapie_note = "mapie SplitConformalRegressor (prefit adapter over " \
                     "backend.services.risk.risk_index), absolute " \
                     "conformity score; per-level halfwidths verified " \
                     "against the closed-form finite-sample quantile"
    except ImportError:
        # no sci deps — emit the same artifact from the closed-form
        # quantile so the pipeline stays runnable on a lean venv
        qhats = {}
        residuals = {"global": [abs(r[4] - r[5]) for r in kept]}
        for fam in FAMILIES:
            idx = {mat_idx[m] for m, f in mat_family.items() if f == fam}
            residuals[fam] = [abs(r[4] - r[5]) for r in kept if r[0] in idx]
        for mid, i in mat_idx.items():
            residuals[f"material:{mid}"] = \
                [abs(r[4] - r[5]) for r in kept if r[0] == i]
        for scope, res in residuals.items():
            if len(res) >= FAM_MIN:
                qhats[scope] = {f"{lvl:.2f}": round(
                    _conformal_qhat(res, lvl), 4) for lvl in LEVELS}
        mapie_note = "closed-form finite-sample quantile (mapie not " \
                     "installed — same split-conformal math)"

    def scope_entry(scope: str, rows_sc: list[tuple]) -> dict | None:
        q = qhats.get(scope)
        if not q:
            return None
        return {"n": len(rows_sc), "qhat": q,
                "empiricalCoverage": _coverage(rows_sc, q),
                "envelope": _envelope(rows_sc)}

    families = {}
    for fam in FAMILIES:
        idx = {mat_idx[m] for m, f in mat_family.items() if f == fam}
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
        "global": scope_entry("global", kept),
        "families": families,
        "materials": mat_entries,
        "materialFamily": mat_family,
        "labeledRows": len(kept),
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
