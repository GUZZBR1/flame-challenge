# Architecture — Freefall Foundry

```
┌──────────────────────────────────────────────────────────────────┐
│ data/ (Python pipelines)                                         │
│   psi_search.py → raw PSI JSON    calibrate_constants.py         │
│   ntrs_search.py → raw NTRS JSON  ──────────────┐                │
│   build_dataset.py → data/bundle/*.json         ▼                │
│                  shared/calibrated-data/*.json                   │
└──────────────┬───────────────────────────────────────────────────┘
               │ materials + inv→model map
               ▼
┌──────────────────────────┐
│ core/ (C++20)            │
│  combustion_solver  —    │
│    FLEX droplet d²-law   │
│  airflow_propagator —    │
│    SAFFIRE solid spread  │
│  material_risk — ACME    │
│    flammability matrix   │
│  chamber.hpp — aggregate │
│    API                   │
└──────────┬───────────────┘
           │ pybind11
           ▼
┌──────────────────────────┐
│ backend/ (FastAPI)       │  services/engine_bridge.py
│  api/ + services/        │  loads freefall_engine .so +
│  /health                 │  calibration.json
│  /api/chamber/preview    │
│  /api/materials          │  → HTTP /api/*, WS /ws/*
│  /ws/chamber (30 Hz)     │    for API consumers
└──────────────────────────┘
```

## Data flow — a run experiment

1. A client picks an `Investigation` (real PSI record) + O₂ level.
2. `POST /api/chamber/preview` → the C++ `MaterialRisk`
   returns `ignitionPressure` for that material/atmosphere.
3. `specFor()` maps pressure → ignition risk % and decomposes it into
   `RiskFactors` (ignition / propagation / detection / persistence) using
   weights from `risk_profiles.json`; dataset fields also feed
   hidden-fire / smolder flags.
4. The C++ solver gates *whether and how* ignition happens.
5. For live chamber telemetry, `WS /ws/chamber` streams `stateJson()`
   at 30 Hz — flame radius, spread front, regime transitions — ready for
   a dedicated chamber view.

## Physics models (reduced order, calibrated to PSI records)

| Model | Investigation anchor | Implementation |
|---|---|---|
| `DropletFlame` | FLEX / ACME | d²-law burn-down with measured `K(o₂)=k0+slope·o₂` fits; spherical diffusion standoff; **dual diameter extinction** — radiative death at `d ≥ extinctionDHotMm`, terminal death at `d ≤ extinctionDMinMm`; two-stage cool-flame regime |
| `SolidSpread` | SoFIE / BASS-II / SAFFIRE | spread rate interpolated within measured `[min,max]` by O₂ margin × shared `F_flow` anchors (mid-flow boost, high-flow **blow-off**) × √pressure; oxygen-limit/quiescent extinction regimes; partial-g correction |
| `MaterialRisk` | ACME / all | per-material LOC, spread range, soot index, cool-flame & smolder flags; `ignitionPressure` is a **PSI logistic fit** `P(sustained burn | o₂−loc)` when `ignitionFitN>0` (scope: material / material-null / family); `riskBreakdown`/`riskIndex` evaluate the full `clamp01(P·F·H·G)` contract natively |
| `Chamber` | — | aggregate API; **closed-volume gas balance** when `volumeLiters>0` — combustion depletes chamber O₂, ventilation exchanges toward ambient, CO₂/He suppressants cut effective O₂; `setSuppressants()` injects mid-run |

The shared flow anchors live once in `calibration.json` (`flowAnchors`) —
`calibrate_constants.py` owns them, `fit_risk_model.py` consumes them,
`MaterialRisk::flowFactor` interpolates them for both the risk formula
and the spread model.

## Scientific assurance layer

The risk index is **analytical** — `clamp01(P_ign·F_flow·H·G)` — mirrored
identically in C++ (`MaterialRisk`), Python (`services/risk.py` +
`engine_fallback.py`) and TypeScript (`site/src/lib/risk.ts`). Three
optional pipelines certify it without adding runtime dependencies
(`data/pipelines/requirements-sci.txt`):

| Pipeline | Tool | Output |
|---|---|---|
| `fit_uncertainty.py` | MAPIE `SplitConformalRegressor` | `risk_model.json["uncertainty"]` — calibrated halfwidths (global + per-material scope) and the feature envelope of the labeled PSI runs |
| `validate_scientific_bounds.py` | Cantera GRI-Mech 3.0 + `shap.ExactExplainer` | `data/processed/scientific_bounds_report.json` |

- **Uncertainty** — conformal intervals ride every `risk_index` response
  (`uncertainty{lower,upper,halfwidth,regime}`). Coverage is only
  guaranteed inside the calibration envelope, so out-of-envelope inputs
  (any `flow>0`, margins beyond the fitted band) are flagged
  `regime:"extrapolation"` and the halfwidth is widened by the
  extrapolation score — exactly the ISS→Lunar/Mars trust problem.
- **Explanation** — the model is multilinear in its four factors, so
  interventional Shapley values have a closed form
  (`services/explain.py`, exact, deterministic). `ExactExplainer`
  re-derives every element in the validator; agreement is
  machine-epsilon (~2e-16) and shipped in the report.
- **Thermodynamic bounds** — Cantera equilibrium (φ=1, 300 K, 1 atm)
  checks each calibrated `locPct` against the adiabatic flame-temperature
  limit window and the CO₂>N₂>He diluent ordering (He via Ar, same molar
  cp). Fuels outside GRI-Mech's C1–C4 scope are reported as such, not
  silently approximated.
- **Native inference, not ONNX/Treelite** — the "model" is a logistic
  sigmoid plus piecewise-linear anchors. Embedding an ML runtime would
  add a heavy dependency to interpret a ~20-byte coefficient vector, so
  `MaterialRisk::riskIndex` evaluates the composite head directly in the
  same `.so`/`.wasm` as the physics — microseconds, zero deps, and parity
  with the Python/TS mirrors is enforced by `test_physics`.

## Build matrix

| Target | Toolchain | Output | Consumer |
|---|---|---|---|
| `ffengine` (static) | g++ ≥11, CMake | `libffengine.a` | tests, both bindings |
| `freefall_engine` | + pybind11 | `.cpython-*.so` | `backend`, calibration tests |
| `ffengine_wasm` | Emscripten (`-DEMSCRIPTEN=ON`) | `freefall_engine.js/.wasm` | future in-browser physics |
| `test_physics` | g++ | ctest binary | CI accuracy gate |

## Determinism

The solver seeds its own xorshift32 per chamber; identical `(config, seed)`
replays produce identical trajectories — required both for the demo's
reproducibility story and for the accuracy tests.
