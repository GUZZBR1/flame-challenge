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
| `MaterialRisk` | ACME / all | per-material LOC, spread range, soot index, cool-flame & smolder flags; `ignitionPressure` is a **PSI logistic fit** `P(sustained burn | o₂−loc)` when `ignitionFitN>0` (scope: material / material-null / family) |
| `Chamber` | — | aggregate API; **closed-volume gas balance** when `volumeLiters>0` — combustion depletes chamber O₂, ventilation exchanges toward ambient, CO₂/He suppressants cut effective O₂; `setSuppressants()` injects mid-run |

The shared flow anchors live once in `calibration.json` (`flowAnchors`) —
`calibrate_constants.py` owns them, `fit_risk_model.py` consumes them,
`MaterialRisk::flowFactor` interpolates them for both the risk formula
and the spread model.

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
