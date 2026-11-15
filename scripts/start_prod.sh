#!/usr/bin/env bash
# Production entrypoint — whisper.cpp STT sidecar + FastAPI on $PORT.
# Hugging Face Spaces (Docker SDK) expects the app on 7860; Render and
# other PaaS inject their own $PORT. See docs/DEPLOY.md.
set -u

PORT="${PORT:-7860}"
WHISPER_PORT="${WHISPER_PORT:-8081}"
WHISPER_BIN="${WHISPER_BIN:-/opt/whisper/whisper-server}"
WHISPER_MODEL="${WHISPER_MODEL:-/opt/whisper/models/ggml-base.bin}"

if [ -x "$WHISPER_BIN" ] && [ -f "$WHISPER_MODEL" ]; then
  "$WHISPER_BIN" -m "$WHISPER_MODEL" \
      --host 127.0.0.1 --port "$WHISPER_PORT" -t "${WHISPER_THREADS:-4}" &
  echo "[prod] whisper-server pid $! on 127.0.0.1:${WHISPER_PORT}"
  # backend hits the sidecar unless WHISPER_CPP_URL points elsewhere
  export WHISPER_CPP_URL="${WHISPER_CPP_URL:-http://127.0.0.1:${WHISPER_PORT}/inference}"
else
  echo "[prod] whisper-server/model not found — STT reports 'offline'"
fi

echo "[prod] uvicorn backend.api.main:app on 0.0.0.0:${PORT}"
exec uvicorn backend.api.main:app --host 0.0.0.0 --port "$PORT"
