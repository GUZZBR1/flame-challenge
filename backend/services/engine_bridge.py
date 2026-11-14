"""Bridge to the compiled C++ engine (core/build/freefall_engine.*.so).

When the extension cannot be imported (not built on this machine, wrong
platform/ABI), a pure-Python port of the reduced-order models is used so
the API keeps serving — ENGINE reports which backend is live and the
"engine" field in responses reflects it.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD_DIR = ROOT / "core" / "build"
if str(BUILD_DIR) not in sys.path:
    sys.path.insert(0, str(BUILD_DIR))

try:
    import freefall_engine as fe  # noqa: E402
    ENGINE = "c++"
except ImportError:
    from backend.services import engine_fallback as fe  # noqa: E402
    ENGINE = "python-fallback"

MODULE = getattr(fe, "__name__", "unknown")

CALIBRATION = ROOT / "shared" / "calibrated-data" / "calibration.json"


class UnknownInvestigationError(LookupError):
    """Raised when an investigationId isn't in the calibration table."""


_risks = fe.MaterialRisk()
_cal: dict = {"materials": [], "investigations": {}}
if CALIBRATION.exists():
    try:
        raw = json.loads(CALIBRATION.read_text())
    except (OSError, json.JSONDecodeError):
        raw = {}
    if isinstance(raw, dict):
        _cal = raw
        # full document — the engine picks the keys it knows
        # (materials, flowAnchors, coflow) and ignores the rest
        _risks.load_json(json.dumps(raw))


def materials() -> list[dict]:
    return _cal.get("materials", [])


def investigation_map() -> dict:
    return _cal.get("investigations", {})


def ignition_pressure(material_id: str, o2_pct: float) -> float:
    """Direct MaterialRisk::ignitionPressure — pure, no chamber state."""
    return max(0.0, _risks.ignition_pressure(material_id, float(o2_pct)))


def coflow_outcome(fuel: str, o2_pct: float = -1.0,
                   o2_end_pct: float = -1.0, mf_lo: float = -1.0,
                   mf_hi: float = -1.0, burn_time_s: float = -1.0) -> int:
    """MaterialRisk::coflowOutcome — 0 burn / 1 extinction / 2 no-ignition.
    Negative arguments mean "field absent in the source row"."""
    return int(_risks.coflow_outcome(
        fuel, float(o2_pct), float(o2_end_pct), float(mf_lo),
        float(mf_hi), float(burn_time_s)))


def _spec(investigation_id: str) -> dict:
    spec = investigation_map().get(investigation_id)
    if spec is None:
        known = ", ".join(sorted(investigation_map())) or "<none>"
        raise UnknownInvestigationError(
            f"unknown investigationId {investigation_id!r} "
            f"(known: {known})")
    return spec


def preview(investigation_id: str, o2_pct: float,
            flow_cms: float | None = None,
            pressure_kpa: float | None = None) -> dict:
    """Physics-computed ignition pressure + model metadata for the UI dial."""
    spec = _spec(investigation_id)
    material_id = spec.get("materialId", "pmma")
    pressure = _risks.ignition_pressure(material_id, float(o2_pct))
    effective_kpa = float(pressure_kpa if pressure_kpa is not None
                          else spec.get("pressureKpa", 101))
    return {
        "investigationId": investigation_id,
        "o2Pct": o2_pct,
        "ignitionPressure": max(0.0, pressure),
        "model": spec.get("model", "spread"),
        "materialId": material_id,
        "loc": spec.get("loc"),
        "o2Range": spec.get("o2Range", [18, 24]),
        "flowRangeCms": spec.get("flowRangeCms", [0, 10]),
        "pressureKpa": effective_kpa,
        "engine": ENGINE,
    }


def make_chamber(
    investigation_id: str,
    o2_pct: float,
    flow_cms: float | None = None,
    seed: int = 1,
    pressure_kpa: float | None = None,
    volume_liters: float | None = None,
    ambient_o2_pct: float | None = None,
    vent_per_sec: float | None = None,
    co2_pct: float | None = None,
    he_pct: float | None = None,
) -> fe.Chamber:
    spec = _spec(investigation_id)
    cfg = fe.ChamberConfig()
    cfg.investigationId = investigation_id
    cfg.materialId = spec.get("materialId", "pmma")
    model = spec.get("model", "spread")
    # coflow is an outcome criterion, not a transient regime — the
    # chamber has no coflow solver; spread is the closest visual proxy
    # for the live/WS surface. Replay scoring uses coflowOutcome
    # directly, which also evaluates the ramp fields a ChamberReq
    # doesn't carry — perfect agreement is impossible by design.
    if model == "coflow":
        model = "spread"
    cfg.model = model
    cfg.o2Pct = float(o2_pct)
    fr = spec.get("flowRangeCms") or [0, 10]
    if len(fr) < 2:
        # pad a partial range by repeating the known bound — padding with
        # zero would silently make the default flow 0 or negative-sorted
        fr = [fr[0], fr[0]] if fr else [0, 0]
    cfg.flowCms = float(flow_cms if flow_cms is not None
                        else (fr[0] + fr[1]) / 2)
    cfg.pressureKpa = float(pressure_kpa if pressure_kpa is not None
                            else spec.get("pressureKpa", 101))
    cfg.partialGravity = bool(spec.get("partialGravity", False))
    cfg.seed = seed
    # closed-chamber gas balance — all optional; volumeLiters=0 keeps
    # the historical open-atmosphere behavior
    if volume_liters is not None:
        cfg.volumeLiters = float(volume_liters)
    if ambient_o2_pct is not None:
        cfg.ambientO2Pct = float(ambient_o2_pct)
    if vent_per_sec is not None:
        cfg.ventPerSec = float(vent_per_sec)
    if co2_pct is not None:
        cfg.co2Pct = float(co2_pct)
    if he_pct is not None:
        cfg.hePct = float(he_pct)
    ch = fe.Chamber(_risks)
    ch.configure(cfg)
    return ch
