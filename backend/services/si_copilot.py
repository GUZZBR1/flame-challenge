"""SI copilot — conversational + voice tactical layer.

Every request builds a FACTUAL PACKET first — the live risk model, the
ignition pressure from the compiled engine, the deterministic decision
cards, and the 3 real PSI runs closest to the chamber operating point
(services.neighbors over the consolidated master sheet). That packet is
the only evidence the LLM is allowed to cite — zero-hallucination by
construction.

Then either:

  * the 9Router gateway (OpenAI-compatible, NINE_ROUTER_BASE_URL) is
    asked for a STRICT JSON answer — json_schema mode first, plain
    json_object as a compatibility retry — validated by pydantic; or
  * when the gateway is down, slow, or returns malformed output, the
    deterministic offline synthesis answers instead (same physics, minus
    the prose) so a demo never hangs on a laptop without the router.

Voice path: transcribe_audio() forwards the clip to the whisper.cpp
server (WHISPER_CPP_URL); the transcript re-enters this same pipeline.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.services import engine_bridge as eb
from backend.services import neighbors, risk, tactics

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]

try:  # python-dotenv is a hard dep, but degrade gracefully if absent
    from dotenv import load_dotenv
    load_dotenv(ROOT / "backend" / ".env")
except Exception:  # noqa: BLE001
    pass

try:
    from openai import AsyncOpenAI, BadRequestError
except ImportError:  # gateway client optional — offline fallback still works
    AsyncOpenAI = None  # type: ignore[assignment,misc]

    class BadRequestError(Exception):  # type: ignore[no-redef]
        pass

try:
    import httpx
except ImportError:  # pragma: no cover - httpx is a hard dep via httpx2
    httpx = None  # type: ignore[assignment]


# ---------------- config ----------------

def _env(name: str, default: str) -> str:
    return os.environ.get(name) or default


def _llm_timeout() -> float:
    try:
        return max(1.0, float(_env("SI_LLM_TIMEOUT_S", "12")))
    except ValueError:
        return 12.0


def _stt_timeout() -> float:
    try:
        return max(1.0, float(_env("SI_STT_TIMEOUT_S", "45")))
    except ValueError:
        return 45.0


# ---------------- contract ----------------

ACTION_CODES = (
    "CUT_VENTILATION",
    "REDUCE_O2",
    "COOL_AND_ISOLATE",
    "SUPPRESS_LOCAL",
)

_O2 = {"ge": 0.0, "le": 100.0, "allow_inf_nan": False}
_FLOW = {"ge": 0.0, "le": 300.0, "allow_inf_nan": False}


class ChamberState(BaseModel):
    """Current simulator state the operator is asking about."""

    model_config = ConfigDict(extra="ignore")

    investigationId: str | None = None
    materialId: str | None = None
    o2Pct: float = Field(default=21.0, **_O2)
    flowCms: float = Field(default=0.0, **_FLOW)
    gravity: str = "microgravity"
    module: str | None = None

    def resolved_material(self) -> str:
        """materialId wins; else derive it from the investigation spec."""
        if self.materialId:
            return self.materialId
        if self.investigationId:
            spec = eb.investigation_map().get(self.investigationId)
            if spec:
                return spec.get("materialId", "pmma")
        return "pmma"


class UiCommand(BaseModel):
    """Optional live-tuning instruction for the simulator UI."""

    set_o2_percent: float | None = Field(default=None, **_O2)
    set_airflow_cm_s: float | None = Field(default=None, **_FLOW)
    load_preset: str | None = None
    focus_module: str | None = None


class CopilotResponse(BaseModel):
    """The strict shape the LLM must return — nothing else."""

    briefing: str = Field(min_length=1, max_length=2000)
    recommended_action: str
    ui_command: UiCommand | None = None

    @field_validator("recommended_action")
    @classmethod
    def _action_known(cls, v: str) -> str:
        code = v.strip().upper()
        if code not in ACTION_CODES:
            raise ValueError(f"unknown action code {v!r}")
        return code


# OpenAI structured-outputs schema (strict). Gateways that reject it get a
# plain {"type": "json_object"} retry instead.
_RESPONSE_SCHEMA = {
    "name": "ignis_copilot_response",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "briefing": {"type": "string"},
            "recommended_action": {"type": "string",
                                   "enum": list(ACTION_CODES)},
            "ui_command": {
                "anyOf": [
                    {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "set_o2_percent": {"type": "number"},
                            "set_airflow_cm_s": {"type": "number"},
                            "load_preset": {"type": "string"},
                            "focus_module": {"type": "string"},
                        },
                        "required": ["set_o2_percent", "set_airflow_cm_s",
                                     "load_preset", "focus_module"],
                    },
                    {"type": "null"},
                ],
            },
        },
        "required": ["briefing", "recommended_action", "ui_command"],
    },
}

_SYSTEM = """You are IGNIS, the synthetic-intelligence copilot of an orbital
shipyard. A FACTUAL PACKET is attached — it is computed by the compiled
C++20 combustion engine and the consolidated NASA PSI master sheet
(FLEX, SAFFIRE, ACME, BASS-II, SAME, SoFIE). It is your only source of
truth.

Answer with ONE JSON object — no markdown, no extra keys:
{
  "briefing": "1-3 technical sentences for the crew",
  "recommended_action": "CUT_VENTILATION | REDUCE_O2 | COOL_AND_ISOLATE | SUPPRESS_LOCAL",
  "ui_command": null | { "set_o2_percent": number, "set_airflow_cm_s": number,
                         "load_preset": string, "focus_module": string }
}

Rules:
- Cite PSI evidence ONLY by accession/run ids present in the packet's
  `neighbors` list. Never invent test numbers, missions or citations.
- recommended_action must be exactly one of the four codes.
- ui_command: emit only when it physically helps the situation
  (e.g. CUT_VENTILATION -> set_airflow_cm_s 0; REDUCE_O2 ->
  set_o2_percent at/below the target). Otherwise null.
- If the operator just asks a question, still pick the best standing
  action for the current chamber state."""


# ---------------- factual packet ----------------

def factual_packet(state: ChamberState) -> dict:
    """Deterministic evidence bundle built before any LLM call."""
    mat = state.resolved_material()
    o2, flow, grav = state.o2Pct, state.flowCms, state.gravity
    r = risk.risk_index(mat, o2, flow, grav)
    nb = neighbors.nearest(r["materialId"], o2, flow, 3)
    cards = tactics.decision_cards(mat, o2, flow, grav)
    ign = eb.ignition_pressure(r["materialId"], o2)
    # compact option summary — full card payloads would flood the prompt
    options = [
        {"card": c["id"], "context": c["context"],
         "options": [{"label": o["label"], "score": o["score"],
                      "action": o["action"]} for o in c["options"]]}
        for c in cards["cards"]
    ]
    return {
        "material": r,
        "engine": eb.ENGINE,
        "ignitionPressure": round(ign, 4),
        "neighbors": nb,
        "decisionOptions": options,
        "briefing": cards["briefing"],
    }


# ---------------- offline deterministic answer ----------------

def _offline_response(state: ChamberState, packet: dict) -> CopilotResponse:
    """Policy-table answer — same physics the cards were scored on."""
    r = packet["material"]
    flags = r["flags"]
    mat_id, loc = r["materialId"], r["locPct"]
    idx, margin = r["riskIndex"], r["margin"]

    if flags["belowLoc"] or idx < 0.25:
        action, ui = "SUPPRESS_LOCAL", UiCommand(focus_module=state.module)
    elif state.flowCms >= 8 and idx >= 0.5:
        action = "CUT_VENTILATION"
        ui = UiCommand(set_airflow_cm_s=0.0)
    elif flags["smoldering"] and idx >= 0.5:
        action = "COOL_AND_ISOLATE"
        ui = UiCommand(set_airflow_cm_s=0.0)
    elif margin > 3:
        # shrink toward ~1 pt above LOC, mirroring tactics' reduce-o2 card
        target = max(0.0, min(loc + 1.0, state.o2Pct - 1.0))
        action = "REDUCE_O2"
        ui = UiCommand(set_o2_percent=round(target, 1))
    else:
        action, ui = "SUPPRESS_LOCAL", None

    cites = ", ".join(
        f"{n['accession']} run {n['runId']}".strip() for n in packet["neighbors"]
    )
    briefing = packet["briefing"]
    if cites:
        briefing += f" Evidence: {cites}."
    return CopilotResponse(briefing=briefing, recommended_action=action,
                           ui_command=ui)


# ---------------- 9Router LLM call ----------------

_client: AsyncOpenAI | None = None


def _llm_client() -> AsyncOpenAI | None:
    global _client
    if AsyncOpenAI is None:
        return None
    if _client is None:
        _client = AsyncOpenAI(
            base_url=_env("NINE_ROUTER_BASE_URL", "http://localhost:20128/v1"),
            api_key=_env("NINE_ROUTER_API_KEY", "local-9router-key"),
            timeout=_llm_timeout(),
            max_retries=1,
        )
    return _client


def _messages(message: str, state: ChamberState, packet: dict) -> list[dict]:
    user = {
        "operator_message": message,
        "chamber_state": state.model_dump(exclude_none=True),
        "resolved_material": packet["material"],
        "engine_ignition_pressure": packet["ignitionPressure"],
        "nearest_psi_runs": packet["neighbors"],
        "decision_options": packet["decisionOptions"],
    }
    return [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]


async def _llm_response(message: str, state: ChamberState,
                        packet: dict) -> CopilotResponse | None:
    """Ask 9Router; None means any failure (down, timeout, bad JSON)."""
    client = _llm_client()
    if client is None:
        return None
    model = _env("NINE_ROUTER_MODEL", "auto")
    kwargs = {
        "model": model,
        "messages": _messages(message, state, packet),
        "temperature": 0.2,
        "max_tokens": 700,
    }
    try:
        completion = await client.chat.completions.create(
            response_format={"type": "json_schema",
                             "json_schema": _RESPONSE_SCHEMA},
            **kwargs)
    except BadRequestError:
        try:  # gateway/model without schema support → plain JSON mode
            completion = await client.chat.completions.create(
                response_format={"type": "json_object"}, **kwargs)
        except Exception as exc:  # noqa: BLE001
            logger.info("9Router json_object call failed: %s", exc)
            return None
    except Exception as exc:  # noqa: BLE001 - connection, timeout, 5xx
        logger.info("9Router unreachable, using offline fallback: %s", exc)
        return None

    try:
        content = completion.choices[0].message.content or ""
        data = json.loads(content)
        return CopilotResponse.model_validate(data)
    except Exception as exc:  # noqa: BLE001 - malformed → deterministic
        logger.info("9Router returned unusable payload: %s", exc)
        return None


# ---------------- public API ----------------

async def answer(message: str, state: ChamberState) -> dict:
    """Structured copilot reply grounded on the factual packet."""
    packet = factual_packet(state)
    resp = await _llm_response(message, state, packet)
    mode = "llm"
    if resp is None:
        resp = _offline_response(state, packet)
        mode = "offline-fallback"
    return {
        **resp.model_dump(),
        "mode": mode,
        "model": _env("NINE_ROUTER_MODEL", "auto") if mode == "llm"
                 else "deterministic",
        "engine": packet["engine"],
        "chamber": {
            "investigationId": state.investigationId,
            "materialId": packet["material"]["materialId"],
            "o2Pct": state.o2Pct,
            "flowCms": state.flowCms,
            "gravity": state.gravity,
            "riskIndex": packet["material"]["riskIndex"],
            "level": packet["material"]["level"],
        },
        "evidence": [
            {
                "runId": n["runId"],
                "accession": n["accession"],
                "investigationId": n["investigationId"],
                "fuel": n["fuel"],
                "outcome": n["outcome"],
                "similarity": n["similarity"],
                "verified": n["verified"],
                "sourceUrl": n["sourceUrl"],
            }
            for n in packet["neighbors"]
        ],
    }


async def transcribe_audio(payload: bytes, filename: str | None = None,
                           content_type: str | None = None) -> str | None:
    """Forward the clip to whisper.cpp; None means STT unavailable."""
    if httpx is None or not payload:
        return None
    url = _env("WHISPER_CPP_URL",
               "http://localhost:8081/v1/audio/transcriptions")
    try:
        async with httpx.AsyncClient(timeout=_stt_timeout()) as c:
            r = await c.post(
                url,
                files={"file": (filename or "audio.webm", payload,
                                content_type or "application/octet-stream")},
                data={"response_format": "json"},
            )
        r.raise_for_status()
        text = (r.json().get("text") or "").strip()
        return text or None
    except Exception as exc:  # noqa: BLE001
        logger.info("whisper.cpp unreachable: %s", exc)
        return None
