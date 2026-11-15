#!/usr/bin/env bash
# Production entrypoint — FastAPI on $PORT. Render, Koyeb and other PaaS
# inject their own $PORT; default 8000. STT/LLM are external
# OpenAI-compatible endpoints configured via env (see backend/.env.example)
# — the image carries no whisper sidecar. See docs/DEPLOY.md.
set -u

PORT="${PORT:-8000}"
echo "[prod] uvicorn backend.api.main:app on 0.0.0.0:${PORT}"
exec uvicorn backend.api.main:app --host 0.0.0.0 --port "$PORT"
