# syntax=docker/dockerfile:1
# Freefall Foundry — lean production image (<350 MB, <150 MB RSS).
# C++20 physics engine (pybind11) + FastAPI on $PORT (default 8000 —
# Render/Koyeb inject their own PORT). STT/LLM are external
# OpenAI-compatible endpoints (see backend/.env.example) — no in-container
# whisper sidecar, so the image fits the 512 MB free tier.
# See docs/DEPLOY.md.

# ---------- stage 1: compile the C++ physics core -----------------------
FROM python:3.12-bookworm AS core-build
RUN apt-get update && apt-get install -y --no-install-recommends \
        cmake g++ make \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir pybind11
WORKDIR /src
COPY core/ core/
RUN cmake -S core -B core/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build core/build -j \
    && ./core/build/test_physics

# ---------- stage 2: runtime ---------------------------------------------
FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000
# curl: platform health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY shared/ shared/
COPY data/bundle/ data/bundle/
COPY data/processed/ data/processed/
COPY scripts/start_prod.sh scripts/start_prod.sh
COPY --from=core-build /src/core/build/freefall_engine.*.so core/build/
# normalize line endings — build contexts produced on Windows can carry
# CRLF into the shell entrypoint
RUN sed -i 's/\r$//' scripts/start_prod.sh && chmod +x scripts/start_prod.sh

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["bash", "scripts/start_prod.sh"]
