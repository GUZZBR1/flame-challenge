# Architecture — Freefall Foundry

```
┌──────────────────────────────────────────────────────────────────┐
│ data/ (Python pipelines)                                         │
│   psi_search.py → raw PSI JSON    calibrate_constants.py         │
│   ntrs_search.py → raw NTRS JSON  ──────────────┐                │
│   build_dataset.py → merged dataset             ▼                │
│                  shared/calibrated-data/*.json                   │
└──────────────┬───────────────────────────────┬───────────────────┘
               │ materials + inv→model map     │ dataset
               ▼                               ▼
┌──────────────────────────┐     ┌──────────────────────────────────┐
│ core/ (C++20)            │     │ frontend/ (React + PixiJS)       │
│  combustion_solver  —    │     │  src/game/      sim (crew, fire) │
│    FLEX droplet d²-law   │     │  src/renderer/  iso world        │
│  airflow_propagator —    │     │  src/sim-bridge/                 │
│    SAFFIRE solid spread  │     │    physics.ts ──┐                │
│  material_risk — ACME    │     │                 │ fallback       │
│    flammability matrix   │     │  src/ui/        HUD + modals     │
│  chamber.hpp — aggregate │     │                 ▼                │
│    API used by the game  │     │  preview: local model (offline)  │
└──────────┬───────────────┘     └─────────────▲────────────────────┘
           │ pybind11                          │ HTTP /api/*, WS /ws/*
           ▼                                   │
┌──────────────────────────┐                   │
│ backend/ (FastAPI)       │───────────────────┘
│  api/ + services/        │  services/engine_bridge.py
│  /health                 │  loads freefall_engine .so +
│  /api/chamber/preview    │  calibration.json
│  /api/materials          │
│  /ws/chamber (30 Hz)     │
└──────────────────────────┘
```

## Data flow — a run experiment

1. Player picks an `Investigation` (real PSI record) + O₂ level in the modal.
2. `physics.ts` calls `POST /api/chamber/preview` → the C++ `MaterialRisk`
   returns `ignitionPressure` for that material/atmosphere. Offline, the
   mirrored TS model returns the same curve.
3. `specFor()` maps pressure → ignition risk % and decomposes it into
   `RiskFactors` (ignition / propagation / detection / persistence) using
   weights from `risk_profiles.json`; dataset fields also feed
   hidden-fire / smolder flags.
4. The TS sim runs the chamber on the ship deck (crew, spread, damage);
   the C++ solver gates *whether and how* ignition happens.
5. For live chamber telemetry, `WS /ws/chamber` streams `stateJson()`
   at 30 Hz — flame radius, spread front, regime transitions — ready for
   a dedicated chamber view.

## Physics models (reduced order, calibrated to PSI records)

| Model | Investigation anchor | Implementation |
|---|---|---|
| `DropletFlame` | FLEX / ACME | d²-law burn-down, spherical diffusion standoff `r_f/r_d ∝ O₂−LOC`, two-stage cool-flame regime for capable fuels |
| `SolidSpread` | SoFIE / BASS-II / SAFFIRE | spread rate interpolated within measured `[min,max]` by O₂ margin; **two extinction regimes** — oxygen-limit at high flow, radiative at quiescent flow; partial-g correction |
| `MaterialRisk` | ACME / all | per-material LOC, spread range, soot index, cool-flame & smolder flags |

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
