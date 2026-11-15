# syntax=docker/dockerfile:1
# Freefall Foundry — all-in-one production image.
# C++20 physics engine (pybind11) + FastAPI + whisper.cpp STT sidecar,
# served on $PORT (default 7860 — Hugging Face Spaces Docker free tier;
# Render injects its own PORT). See docs/DEPLOY.md.

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

# ---------- stage 2: whisper.cpp STT server + base model ----------------
FROM debian:bookworm-slim AS whisper-build
ARG WHISPER_REF=v1.9.5
RUN apt-get update && apt-get install -y --no-install-recommends \
        git cmake g++ make ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${WHISPER_REF} \
        https://github.com/ggml-org/whisper.cpp /opt/whisper.cpp \
    && cmake -S /opt/whisper.cpp -B /opt/whisper.cpp/build \
        -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
    && cmake --build /opt/whisper.cpp/build -j --target whisper-server
# lightweight multilingual base model (~148 MB) — override via build-arg
ARG WHISPER_MODEL_URL=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
RUN curl -fSL -o /opt/whisper.cpp/models/ggml-base.bin "${WHISPER_MODEL_URL}"

# ---------- stage 3: runtime ---------------------------------------------
FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=7860 \
    WHISPER_CPP_URL=http://127.0.0.1:8081/inference
# libgomp1: ggml OpenMP runtime; curl: platform health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 curl \
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
COPY --from=whisper-build /opt/whisper.cpp/build/bin/whisper-server /opt/whisper/whisper-server
COPY --from=whisper-build /opt/whisper.cpp/models/ggml-base.bin /opt/whisper/models/ggml-base.bin
# normalize line endings — build contexts produced on Windows can carry
# CRLF into the shell entrypoint
RUN sed -i 's/\r$//' scripts/start_prod.sh \
    && chmod +x scripts/start_prod.sh /opt/whisper/whisper-server

EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["bash", "scripts/start_prod.sh"]
