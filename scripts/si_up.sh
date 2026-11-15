#!/usr/bin/env bash
# Bring up the local SI stack for the IGNIS voice copilot.
# whisper.cpp STT :8081 + Ollama LLM :11434 + FastAPI :8000 — all local,
# zero-cost. See docs/SI_SETUP.md.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHISPER_DIR="${WHISPER_CPP_DIR:-$HOME/whisper.cpp}"
WHISPER_MODEL="${WHISPER_MODEL:-$WHISPER_DIR/models/ggml-small.en.bin}"

ok()   { echo "[si] $*"; }
warn() { echo "[si] WARNING: $*"; }

# --- whisper.cpp STT -----------------------------------------------------
if curl -sf --max-time 2 http://127.0.0.1:8081/health >/dev/null; then
  ok "whisper.cpp already on :8081"
elif [ -x "$WHISPER_DIR/build/bin/whisper-server" ]; then
  nohup "$WHISPER_DIR/build/bin/whisper-server" \
      -m "$WHISPER_MODEL" --host 127.0.0.1 --port 8081 -t 8 \
      >/tmp/whisper-server.log 2>&1 &
  ok "whisper.cpp starting (pid $!) — log /tmp/whisper-server.log"
else
  warn "whisper-server not built — see docs/SI_SETUP.md §1"
fi

# --- ollama LLM ----------------------------------------------------------
if curl -sf --max-time 2 http://127.0.0.1:11434/api/version >/dev/null; then
  ok "ollama up on :11434"
else
  warn "ollama not reachable — 'systemctl start ollama' or 'ollama serve &'"
fi

# --- FastAPI -------------------------------------------------------------
if curl -sf --max-time 2 http://127.0.0.1:8000/health >/dev/null; then
  ok "api already on :8000"
else
  cd "$ROOT" || exit 1
  nohup ./.venv/bin/uvicorn backend.api.main:app --port 8000 \
      >/tmp/uvicorn.log 2>&1 &
  ok "api starting (pid $!) — log /tmp/uvicorn.log"
fi

sleep 2
echo
curl -s --max-time 3 http://127.0.0.1:8000/health && echo
