# AGENTS.md — flame-challenge

NASA Space Apps Challenge 2026: **"Flame in Freefall"** → **Freefall Foundry**,
the physics + data + API core of an orbital shipyard sim where crew build
modules, run microgravity combustion experiments and fabricate a ship.
Experiment risk, fire spread and hidden-flame incidents are driven by real
NASA PSI data and a compiled C++ physics core. The repo is engine, ETL and
backend only — no client. See `docs/`.

## Layout (monorepo)

- `core/` — C++20 physics: `combustion_solver` (FLEX droplet d²-law +
  cool-flame regime), `airflow_propagator` (SAFFIRE-type spread with two
  extinction regimes), `material_risk` (ACME flammability matrix),
  `chamber.hpp` aggregate API. `src/bindings.cpp` → pybind11 module;
  `src/bindings_wasm.cpp` → Emscripten-ready embind.
- `data/` — Python ETL (`pipelines/`): `psi_search.py` (PSI catalog via
  `geode-py/ws`), `psi_files.py` (per-test data files), `ntrs_search.py`
  (citations + fulltext), `normalize_experiments.py` (unified CSV),
  `build_index.py` (retrieval corpus), `fit_risk_model.py` (risk surface),
  `build_dataset.py`, `calibrate_constants.py` → `data/processed/` +
  `shared/calibrated-data/*.json` (canonical) + `data/bundle/` (merged
  dataset + generated JSON artifacts)
- `shared/` — contracts: `schemas/` JSON schemas + `calibrated-data/`
  (`calibration.json`, `risk_profiles.json` — the single source of truth
  for the C++ core)
- `backend/` — `api/` FastAPI routes + `services/` (`engine_bridge.py`
  pybind, `engine_fallback.py` pure-Python mirror, `rag.py`
  retrieval/SQL-RAG, `risk.py` cabin simulator, `investigations.py`
  scored leaderboard + detail + insights, `diff.py` run-pair differ,
  `si_copilot.py` conversational/voice SI):
  `/health`, `/api/chamber/preview`,
  `/api/materials`, `WS /ws/chamber` (30 Hz), `/api/search`, `/api/ask`,
  `/api/risk`, `/api/risk/curve`, `/api/risk/rank`, `/api/rag/stats`,
  `/api/investigations` (leaderboard), `/api/investigations/{id}`,
  `/api/investigations/matrix` (dashboard attribute feed),
  `/api/insights`, `/api/runs`, `/api/diff`, `/api/diffs`,
  `/api/decision-cards`, `/api/neighbors`, `POST /api/si/chat`,
  `POST /api/si/voice` (multipart `audio` + `state`)
- SI copilot: every answer first builds a factual packet (risk model +
  engine ignition pressure + `neighbors` 3 nearest PSI runs + `tactics`
  cards), then asks the local 9Router gateway (OpenAI-compatible, strict
  JSON schema → `briefing` / `recommended_action` / `ui_command`).
  whisper.cpp does STT. Either service down → deterministic offline
  fallback. Env via `backend/.env` (see `.env.example`):
  `NINE_ROUTER_BASE_URL`, `NINE_ROUTER_API_KEY`, `NINE_ROUTER_MODEL`,
  `WHISPER_CPP_URL`.
- `site/` — IGNIS dashboard (Vite + React 19 + Tailwind 4 + GSAP):
  editorial hero/challenge + `#dashboard` section (summarize · rank ·
  interpret pillars, theme-filtered investigation matrix, scenario risk
  ranking, tactical cards, investigation diff) + `#mission-control`
  SiConsole (chat + push-to-talk voice via MediaRecorder, applies
  `ui_command` to chamber state, highlights decision card,
  speechSynthesis readback). Offline fallback mirrors
  the same fitted model via `src/lib/risk.ts` + `src/lib/dashboard.ts`;
  live mode proxies `/api` to :8000 (see `vite.config.ts`).
- `docs/` — challenge brief, ARCHITECTURE.md, NASA_PSI_REFERENCES.md,
  data-schema.md
- `assets/` — media sources (tilesets, crew sprites, audio); empty

## Commands (WSL: `/home/lucas_coimbra/flame-challenge`)

- `cd core && cmake -S . -B build -DPython3_EXECUTABLE=/usr/bin/python3
  && cmake --build build -j && ./build/test_physics`
- `./.venv/bin/python data/pipelines/calibrate_constants.py`
- `./.venv/bin/uvicorn backend.api.main:app --port 8000`
- `./.venv/bin/pip install ...` — PEP 668 managed env; always use `.venv`
- `cd site && npm run build` (tsc + vite) / `npm run dev` / `npx oxlint`
- `./.venv/bin/python -m pytest backend/tests` — API + services tests
- ETL (in order): `psi_search.py --all` → `psi_files.py --all` →
  `ntrs_search.py --all --fulltext 3` → `normalize_experiments.py` →
  `build_index.py` → `build_dataset.py` → `calibrate_constants.py` →
  `fit_risk_model.py` → `build_master_sheet.py` (auditable
  `data/processed/nasa_combustion_master.csv` + `data/bundle/master_sheet.json`)
  → `build_investigation_diffs.py` (`data/bundle/investigation_diffs.json`)
  → `build_site_snapshot.py` (`site/src/data/psi_snapshot.json` — baked
  leaderboard/details/insights for the site's offline fallback)
- Validate physics changes: `./.venv/bin/python data/pipelines/validate_engine.py`
  → `data/processed/validation_report.json` (74.1% peak on K/Dext fits; 64.4% on the
  re-normalized labels — ACME 18.6% → 61% via the fitted coflow
  criterion: ignition gates + fuel-ramp strain + oxidizer-depletion
  extinction, fitted per fuel into calibration.json["coflow"])

## Conventions

- All user-facing copy in English (NASA judges). Docs may be bilingual.
- Provenance: starter dataset records carry `verified: false`; only
  pipeline-ingested records set `verified: true`.
- Determinism matters: the C++ engine uses a seeded xorshift. Keep it
  reproducible.
