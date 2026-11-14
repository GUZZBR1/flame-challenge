"""Exact Shapley attribution for the multiplicative risk model.

    risk = P_ign(margin) * F_flow(flow) * H(material) * G(gravity)

is multilinear in its four physical factors, so the interventional
Shapley values of the deviation from a baseline operating point have a
closed form — no sampling, no approximation, O(n·2^(n-1)) with n=4.
data/pipelines/validate_scientific_bounds.py re-checks every element
of this decomposition against shap.PermutationExplainer and ships the
agreement in the validation report.

Baseline — the "benign reference module" (documented, fixed so bars
stay comparable across calls):
    P: 0.04   the hand-set floor the model assigns at/below LOC
    F: 1.0    neutral ventilation multiplier
    H: 1.0    hazard-free material (no cool-flame/smolder/soot penalty)
    G: 1.0    microgravity — the worst case the other regimes discount

Contributions are signed in risk units (phi): positive pushes the index
up from baseline, negative is protective (e.g. partial gravity, a
quiescent airflow window, margin below LOC).
"""
from __future__ import annotations

import itertools
import math

# (key, human label) — keys match the breakdown dict order
FACTORS = (
    ("o2Margin", "o₂ margin vs loc"),
    ("airflow", "ventilation factor"),
    ("materialHazard", "material hazard"),
    ("gravity", "gravity regime"),
)

BASELINE = {
    "o2Margin": 0.04,
    "airflow": 1.0,
    "materialHazard": 1.0,
    "gravity": 1.0,
}


def _w(s: int, n: int) -> float:
    return (math.factorial(s) * math.factorial(n - s - 1)
            / math.factorial(n))


def shapley_product(values: dict[str, float],
                    baseline: dict[str, float] | None = None) -> dict:
    """Exact interventional Shapley decomposition of prod(x) - prod(b).

    For a multilinear f(x) = prod(x_i):
        phi_i = sum over S⊆N\\{i} of
                |S|!(n-|S|-1)!/n! · (x_i-b_i) · prod(x_j for j in S)
                                              · prod(b_j for j in rest)
    returns {phi, deviation, share} — share is phi normalized by the
    total |phi| so UI bars can show signed percentages.
    """
    base = dict(BASELINE)
    if baseline:
        base.update(baseline)
    keys = [k for k, _ in FACTORS]
    n = len(keys)
    x = [float(values[k]) for k in keys]
    b = [float(base[k]) for k in keys]

    phi: list[float] = []
    for i in range(n):
        others = [j for j in range(n) if j != i]
        acc = 0.0
        for r in range(n):
            for S in itertools.combinations(others, r):
                sset = set(S)
                prod = x[i] - b[i]
                for j in S:
                    prod *= x[j]
                for j in others:
                    if j not in sset:
                        prod *= b[j]
                acc += _w(len(S), n) * prod
        phi.append(acc)

    deviation = math.prod(x) - math.prod(b)   # == sum(phi) (efficiency)
    total = sum(abs(p) for p in phi)
    shares = [p / total if total > 0 else 0.0 for p in phi]
    return {
        "phi": dict(zip(keys, phi)),
        "share": dict(zip(keys, shares)),
        "deviation": deviation,
        "baselineRisk": math.prod(b),
    }


def explain(breakdown: dict, risk_index: float | None = None) -> dict:
    """Attach the attribution block to a risk_index() breakdown."""
    values = {
        "o2Margin": float(breakdown["ignitionPressure"]),
        "airflow": float(breakdown["flowFactor"]),
        "materialHazard": float(breakdown["hiddenFactor"]),
        "gravity": float(breakdown["gravityFactor"]),
    }
    dec = shapley_product(values)
    contribs = []
    labels = dict(FACTORS)
    for k in dec["phi"]:
        contribs.append({
            "factor": k,
            "label": labels[k],
            "value": round(values[k], 4),
            "baseline": BASELINE[k],
            "phi": round(dec["phi"][k], 4),
            "share": round(dec["share"][k], 4),
        })
    contribs.sort(key=lambda c: -abs(c["share"]))
    return {
        "method": "exact-shapley-multiplicative",
        "baseline": dict(BASELINE),
        "baselineRisk": round(dec["baselineRisk"], 4),
        "deviation": round(dec["deviation"], 4),
        "unclamped": (risk_index is not None
                      and math.prod(list(values.values())) > 1.0),
        "contributions": contribs,
    }
