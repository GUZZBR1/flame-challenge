"""Freefall Foundry backend — serves the C++ physics core over HTTP + WebSocket.

Run (from repo root, venv active):
    uvicorn backend.api.main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import time
from pathlib import Path

from fastapi import (FastAPI, File, Form, HTTPException, Query, Request,
                     UploadFile, WebSocket, WebSocketDisconnect)
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from backend.services import engine_bridge as eb
from backend.services import (diff, investigations, neighbors, rag, risk,
                              si_copilot, tactics)

app = FastAPI(title="Freefall Foundry Engine API", version="0.1.0")
_extra_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"] + _extra_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Physical bounds for atmosphere/config inputs. O₂ is a percentage; the
# calibrated flow data tops out ~70 cm/s and pressures are 57–101 kPa, so
# the upper bounds below leave generous headroom while still rejecting
# pathological values (negative, NaN/inf, >32-bit seeds) with a 422
# instead of letting them reach the engine as a 500.
_O2 = {"ge": 0.0, "le": 100.0, "allow_inf_nan": False}
_FLOW = {"ge": 0.0, "le": 300.0, "allow_inf_nan": False}
_PRESSURE = {"ge": 1.0, "le": 300.0, "allow_inf_nan": False}
_SEED = {"ge": 0, "le": 4_294_967_295}  # C++ unsigned int


@app.exception_handler(eb.UnknownInvestigationError)
def unknown_investigation(_: Request,
                          exc: eb.UnknownInvestigationError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


def _json_safe(value):
    """Replace non-finite floats recursively so the payload serializes —
    a rejected `1e309`/`NaN` input would otherwise turn the 422 into a 500."""
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")[:2000]
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


@app.exception_handler(RequestValidationError)
async def invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
    # same shape as FastAPI's default 422 handler, but sanitized
    try:
        content = jsonable_encoder({"detail": _json_safe(exc.errors()),
                                    "body": _json_safe(exc.body)})
    except Exception:
        content = {"detail": "Invalid request body",
                   "type": "request_validation"}
    return JSONResponse(status_code=422, content=content)


class PreviewReq(BaseModel):
    investigationId: str
    o2Pct: float = Field(**_O2)
    flowCms: float | None = Field(default=None, **_FLOW)
    pressureKpa: float | None = Field(default=None, **_PRESSURE)


class ChamberReq(BaseModel):
    investigationId: str
    o2Pct: float = Field(**_O2)
    flowCms: float | None = Field(default=None, **_FLOW)
    pressureKpa: float | None = Field(default=None, **_PRESSURE)
    seed: int = Field(default=1, **_SEED)
    # closed-chamber gas balance — all optional
    volumeLiters: float | None = Field(default=None, ge=0.0, le=1e6)
    ambientO2Pct: float | None = Field(default=None, **_O2)
    ventPerSec: float | None = Field(default=None, ge=0.0, le=10.0)
    co2Pct: float | None = Field(default=None, ge=0.0, le=100.0)
    hePct: float | None = Field(default=None, ge=0.0, le=100.0)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "engine": eb.ENGINE, "module": eb.MODULE}


@app.get("/api/materials")
def get_materials() -> dict:
    return {"materials": eb.materials(), "investigations": eb.investigation_map()}


@app.post("/api/chamber/preview")
def chamber_preview(req: PreviewReq) -> dict:
    return eb.preview(req.investigationId, req.o2Pct, req.flowCms,
                      req.pressureKpa)


# ---------- SI layer: retrieval, SQL-RAG, risk simulator ----------

class AskReq(BaseModel):
    q: str
    k: int = 6


class RiskReq(BaseModel):
    materialId: str = "pmma"
    o2Pct: float = Field(default=21.0, **_O2)
    flowCms: float = Field(default=0.0, **_FLOW)
    gravity: str = "microgravity"


@app.get("/api/rag/stats")
def rag_stats() -> dict:
    return rag.stats()


@app.get("/api/search")
def api_search(q: str, k: int = 8) -> dict:
    return rag.search(q, k)


@app.post("/api/ask")
def api_ask(req: AskReq) -> dict:
    return rag.ask(req.q, req.k)


@app.post("/api/risk")
def api_risk(req: RiskReq) -> dict:
    return risk.risk_index(req.materialId, req.o2Pct, req.flowCms, req.gravity)


@app.get("/api/risk")
def api_risk_get(materialId: str = "pmma",
                 o2Pct: float = Query(21.0, ge=0.0, le=100.0,
                                      allow_inf_nan=False),
                 flowCms: float = Query(0.0, ge=0.0, le=300.0,
                                        allow_inf_nan=False),
                 gravity: str = "microgravity") -> dict:
    return risk.risk_index(materialId, o2Pct, flowCms, gravity)


@app.get("/api/risk/curve")
def api_risk_curve(materialId: str = "pmma",
                   flowCms: float = Query(0.0, ge=0.0, le=300.0,
                                          allow_inf_nan=False),
                   gravity: str = "microgravity",
                   o2Min: float = Query(8.0, ge=0.0, le=100.0,
                                        allow_inf_nan=False),
                   o2Max: float = Query(40.0, ge=0.0, le=100.0,
                                        allow_inf_nan=False)) -> dict:
    return risk.curve(materialId, flowCms, gravity, o2Min, o2Max)


@app.get("/api/risk/materials")
def api_risk_materials() -> dict:
    return {"materials": risk.materials()}


# ---------- SI layer: investigation leaderboard, detail cards, insights ----------

@app.get("/api/investigations")
def api_investigations() -> dict:
    """Ranked investigation cards — the challenge's 'rank' deliverable.
    Composite score (flammability · hidden hazard · exploration
    relevance · data richness) with per-component breakdown."""
    return investigations.leaderboard()


_BUNDLE = Path(__file__).resolve().parents[2] / "data" / "bundle"


_matrix_cache: dict | None = None


@app.get("/api/investigations/matrix")
def api_investigation_matrix() -> dict:
    """Summarize feed — the full investigation matrix served to the
    dashboard (objectives, fuels, conditions, variation, sensors)."""
    global _matrix_cache
    path = _BUNDLE / "investigations.json"
    if not path.exists():
        return {"investigations": []}
    if _matrix_cache is None:
        _matrix_cache = json.loads(path.read_text(encoding="utf-8"))
    return _matrix_cache


@app.get("/api/investigations/{inv_id}")
def api_investigation_detail(inv_id: str) -> dict:
    card = investigations.detail(inv_id)
    if card is None:
        known = ", ".join(sorted(
            set(investigations.DISPLAY_NAME)
            | set(investigations.CHILD_TO_PARENT))) or "<none>"
        raise HTTPException(
            status_code=404,
            detail=f"unknown investigationId {inv_id!r} (known: {known})")
    return card


@app.get("/api/insights")
def api_insights() -> dict:
    """Corpus-level interpreted findings — the 'interpret' deliverable.
    Every claim cites its run counts and source investigations."""
    return investigations.insights()


# ---------- SI layer: summarize feed + run diff ----------

@app.get("/api/risk/rank")
def api_risk_rank(o2Pct: float = Query(21.0, ge=0.0, le=100.0,
                                       allow_inf_nan=False),
                  flowCms: float = Query(0.0, ge=0.0, le=300.0,
                                         allow_inf_nan=False),
                  gravity: str = "microgravity",
                  top: int = Query(10, ge=1, le=20)) -> dict:
    """Rank — every calibrated material sorted by risk index at the
    requested operating point, worst first."""
    ranked = sorted(
        (risk.risk_index(m["id"], o2Pct, flowCms, gravity)
         for m in risk.materials()),
        key=lambda r: (-r["riskIndex"], r["materialId"]))
    return {"o2Pct": o2Pct, "flowCms": flowCms, "gravity": gravity,
            "engine": eb.ENGINE, "ranked": ranked[:top]}


# ---------- investigation diff: what changed vs what held ----------

@app.get("/api/diffs")
def api_curated_diffs() -> dict:
    """Curated diff cards — pairs of real runs isolating one variable."""
    return {"cards": diff.curated()}


@app.get("/api/runs")
def api_runs(investigation: str | None = None,
             accession: str | None = None,
             limit: int = Query(100, ge=1, le=200)) -> dict:
    """Run picker — normalized PSI runs, filterable by the umbrella
    investigation id or the real PSI accession (PSI-22, PSI-26…)."""
    return {"runs": diff.runs(investigation, accession, limit)}


@app.get("/api/diff")
def api_diff(a: str, b: str):
    """Field-level diff between two run ids — changed vs held."""
    d = diff.diff_runs(a, b)
    if d is None:
        known = ", ".join(sorted(diff._load())[:40])
        return JSONResponse(
            status_code=404,
            content={"detail": f"unknown run id in pair ({a!r}, {b!r}) — "
                               f"run ids look like: {known}…"})
    return d


# ---------- SI layer: KNN lookup + deterministic tactical synthesis ----------

@app.get("/api/neighbors")
def api_neighbors(materialId: str = "pmma",
                  o2Pct: float = Query(21.0, ge=0.0, le=100.0,
                                       allow_inf_nan=False),
                  flowCms: float = Query(0.0, ge=0.0, le=300.0,
                                         allow_inf_nan=False),
                  k: int = Query(3, ge=1, le=10)) -> dict:
    """k nearest real PSI test runs to the requested operating point."""
    return {
        "materialId": materialId, "o2Pct": o2Pct, "flowCms": flowCms,
        "neighbors": neighbors.nearest(materialId, o2Pct, flowCms, k),
    }


@app.get("/api/decision-cards")
def api_decision_cards(materialId: str = "pmma",
                       o2Pct: float = Query(21.0, ge=0.0, le=100.0,
                                            allow_inf_nan=False),
                       flowCms: float = Query(0.0, ge=0.0, le=300.0,
                                              allow_inf_nan=False),
                       gravity: str = "microgravity") -> dict:
    """Live decision cards: countermeasure scores from the fitted risk
    model + KNN evidence + C++ ignition pressure for provenance."""
    payload = tactics.decision_cards(materialId, o2Pct, flowCms, gravity)
    # unresolved ids (butane, …) fall back inside risk_index — chamber
    # fields must quote the material the cards were actually built on
    resolved = payload["material"]["materialId"]
    return {
        "engine": eb.ENGINE,
        "chamber": {
            "materialId": resolved,
            "requestedMaterialId": materialId,
            "o2Pct": o2Pct,
            "flowCms": flowCms,
            "ignitionPressure": round(eb.ignition_pressure(resolved, o2Pct), 4),
        },
        **payload,
    }


@app.get("/api/mission-reports/templates")
def api_mission_reports_templates() -> dict:
    """Pre-seeded canonical mission reports for Golden Path demo."""
    return {
        "templates": [
            {
                "id": "artemis-lunar-airlock",
                "title": "Artemis Lunar Airlock: 34% O₂ Flashover & Depressurization Assessment",
                "missionTag": "Artemis Base Camp · Lunar Surface (0.16g)",
                "investigationId": "saffire-4",
                "materialId": "pmma",
                "o2Pct": 34.0,
                "flowCms": 1.5,
                "gravity": "lunar",
                "risk": risk.risk_index("pmma", 34.0, 1.5, "lunar"),
            },
            {
                "id": "iss-flex2-cool-flame",
                "title": "ISS MSG FLEX-2: Silent Cool Flame Re-ignition Investigation",
                "missionTag": "ISS MSG Glovebox · Microgravity (0g)",
                "investigationId": "flex-2",
                "materialId": "heptane",
                "o2Pct": 21.0,
                "flowCms": 0.0,
                "gravity": "microgravity",
                "risk": risk.risk_index("heptane", 21.0, 0.0, "microgravity"),
            },
            {
                "id": "cygnus-saffire4-burn",
                "title": "Cygnus SAFFIRE-IV: Large-Scale Spacecraft Fabric Burnout",
                "missionTag": "Cygnus PCM · Uncrewed Post-Departure (0g)",
                "investigationId": "saffire-4",
                "materialId": "cotton",
                "o2Pct": 21.0,
                "flowCms": 20.0,
                "gravity": "microgravity",
                "risk": risk.risk_index("cotton", 21.0, 20.0, "microgravity"),
            },
        ]
    }


# ---------- SI layer: conversational + voice copilot ----------

class SiChatReq(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    current_chamber_state: si_copilot.ChamberState = Field(
        default_factory=si_copilot.ChamberState)


@app.post("/api/si/chat")
async def si_chat(req: SiChatReq) -> dict:
    """Structured copilot answer grounded on the engine + PSI packet."""
    return await si_copilot.answer(req.message, req.current_chamber_state)


# ~25 MB cap — enough for minutes of webm/opus PTT audio
_SI_MAX_AUDIO = 25 * 1024 * 1024


@app.post("/api/si/voice")
async def si_voice(audio: UploadFile = File(...),
                   state: str = Form("{}")):
    """whisper.cpp STT → same copilot pipeline. Deterministic offline
    fallback when either local service is down."""
    try:
        chamber = si_copilot.ChamberState.model_validate(json.loads(state))
    except (json.JSONDecodeError, ValidationError, TypeError):
        return JSONResponse(status_code=422,
                            content={"detail": "invalid state payload"})
    payload = await audio.read(_SI_MAX_AUDIO + 1)
    if len(payload) > _SI_MAX_AUDIO:
        return JSONResponse(status_code=413,
                            content={"detail": "audio too large"})
    transcript = await si_copilot.transcribe_audio(
        payload, audio.filename, audio.content_type)
    if transcript is None:
        # STT offline — still answer from the state so the console has a
        # deterministic degradation path instead of a dead endpoint
        resp = await si_copilot.answer("(voice uplink offline)", chamber)
        return {"transcript": None, "stt": "offline", "response": resp}
    resp = await si_copilot.answer(transcript, chamber)
    return {"transcript": transcript, "stt": "whisper.cpp", "response": resp}


@app.post("/api/si/voice-command")
async def si_voice_command(audio: UploadFile = File(...),
                           state: str = Form("{}")):
    """Voice-first mission control: WAV PCM16 16kHz in -> flat command
    envelope out ({transcript, briefing, navigation,
    simulation_commands, …}). Same factual packet + 9Router pipeline as
    /api/si/voice, deterministic offline degradation on every hop."""
    try:
        chamber = si_copilot.ChamberState.model_validate(json.loads(state))
    except (json.JSONDecodeError, ValidationError, TypeError):
        return JSONResponse(status_code=422,
                            content={"detail": "invalid state payload"})
    payload = await audio.read(_SI_MAX_AUDIO + 1)
    if len(payload) > _SI_MAX_AUDIO:
        return JSONResponse(status_code=413,
                            content={"detail": "audio too large"})
    transcript = await si_copilot.transcribe_audio(
        payload, audio.filename, audio.content_type)
    if transcript is None:
        resp = await si_copilot.answer("(voice uplink offline)", chamber)
        return {"transcript": None, "stt": "offline", **resp}
    resp = await si_copilot.answer(transcript, chamber)
    return {"transcript": transcript, "stt": "whisper.cpp", **resp}


@app.websocket("/ws/chamber")
async def chamber_ws(ws: WebSocket) -> None:
    """Stream a live chamber run at ~30 Hz until the run finishes or 60 s cap."""
    await ws.accept()
    try:
        raw = await ws.receive_text()
        try:
            req = ChamberReq(**json.loads(raw))
        except ValidationError as exc:
            # same sanitized shape as the HTTP 422 handler — never the
            # raw str(exc), which echoes the offending payload back
            try:
                detail = jsonable_encoder(
                    {"detail": _json_safe(exc.errors()),
                     "body": _json_safe(raw)})
            except Exception:
                detail = {"detail": "Invalid request body",
                          "type": "request_validation"}
            await ws.send_text(json.dumps({"error": detail}))
            await ws.close(code=1008)  # policy violation — clean reject
            return
        except (json.JSONDecodeError, TypeError):
            await ws.send_text(
                json.dumps({"error": "expected a JSON object request"}))
            await ws.close(code=1008)
            return
        ch = eb.make_chamber(req.investigationId, req.o2Pct, req.flowCms,
                             req.seed, req.pressureKpa, req.volumeLiters,
                             req.ambientO2Pct, req.ventPerSec, req.co2Pct,
                             req.hePct)
        dt = 1.0 / 30.0
        deadline = time.monotonic() + 60
        while not ch.finished() and time.monotonic() < deadline:
            # the pure-Python fallback is CPU-bound — keep the event loop free
            await asyncio.to_thread(ch.step, dt)
            events = ch.drain_events()
            state = ch.state_json()
            if events:
                # rare path — only parse+reserialize when events must
                # merge into the frame payload
                payload = json.loads(state)
                payload["events"] = events
                await ws.send_text(json.dumps(payload))
            else:
                # state_json() is already serialized — send verbatim
                await ws.send_text(state)
            await asyncio.sleep(dt)
        await ws.send_text(json.dumps({"done": True, "state": json.loads(ch.state_json())}))
    except WebSocketDisconnect:
        return
    except Exception as exc:  # surface config errors to the client
        try:
            await ws.send_text(json.dumps({"error": str(exc)}))
        finally:
            await ws.close()
