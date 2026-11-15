# DEPLOY — free tier, zero local setup

Frontend on **Vercel** (free), backend on **Hugging Face Spaces** Docker
free tier (16 GB RAM — fits the C++ engine + whisper.cpp sidecar).
**Render** works as a drop-in alternative for the backend.

| Piece | Where | What runs |
|---|---|---|
| `site/` | Vercel | IGNIS dashboard — static SPA, falls back to the bundled physics mirror while the API wakes up |
| root `Dockerfile` | HF Space (or Render) | C++20 engine `.so` + FastAPI + `whisper-server` (`ggml-base.bin`) on `$PORT` |
| LLM | provider free tier | any OpenAI-compatible URL — no gateway to host |

## Step 1 — push the repo

The Space builds the root `Dockerfile` straight from a git remote:

```bash
git push origin main   # or keep your challenge branch — either works
```

## Step 2 — backend on Hugging Face Spaces

1. https://huggingface.co/new-space → name it → **SDK: Docker** →
   **Blank template** → free **CPU basic** hardware.
2. Push this repo to the Space's git remote
   (`git remote add hf https://huggingface.co/spaces/<you>/<space>` then
   `git push hf <branch>:main`), or use **Files → Dockerfile** and point
   the build at your GitHub repo.
3. **Settings → Variables and secrets**, add:

| Variable | Value |
|---|---|
| `NINE_ROUTER_BASE_URL` | `https://api.groq.com/openai/v1` — or `https://generativelanguage.googleapis.com/v1beta/openai` |
| `NINE_ROUTER_API_KEY` | **secret** — Groq console key or AI Studio key |
| `NINE_ROUTER_MODEL` | `llama-3.3-70b-versatile` / `gemini-2.5-flash` (any current chat id) |
| `CORS_ORIGINS` | `https://<your-app>.vercel.app` (fill in after step 3) |

`PORT` needs nothing — `scripts/start_prod.sh` defaults to `7860`, the
port HF exposes. STT is in-container (`whisper-server` sidecar), so voice
works with no extra service. Skip `NINE_ROUTER_*` and every answer still
arrives via the deterministic offline fallback.

## Step 3 — frontend on Vercel

1. https://vercel.com/new → import the repo → **Root Directory: `site`**
   (framework detects as Vite via `site/vercel.json`; SPA rewrites are
   already configured).
2. **Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<you>-<space>.hf.space` |

3. Deploy.

## Step 4 — close the CORS loop

Back on the Space: set `CORS_ORIGINS=https://<your-app>.vercel.app` and
restart. The WebSocket (`wss://…/ws/chamber`) needs no extra config —
`VITE_API_URL` is mapped `https→wss` by `site/src/lib/apiBase.ts`.

## Step 5 — verify

```bash
curl https://<you>-<space>.hf.space/health
# {"ok":true,"engine":"c++","module":"freefall_engine"}
```

Open the Vercel URL → engine badge shows `c++` once the Space is warm.
Cold start: free tiers sleep — the dashboard keeps working on the baked
physics snapshot (`engine: local`) and upgrades to live automatically.

## Alternative backend — Render

**New → Web Service → Docker**, same repo, same env vars minus nothing:
Render injects `PORT` and `start_prod.sh` binds it. Free instances spin
down on idle — same cold-start story, same client fallback.

## What's in the image

- `core/build/freefall_engine.*.so` compiled in-stage and health-checked
  (`test_physics` runs during build)
- `whisper-server` pinned at `v1.9.5` + `ggml-base.bin` (≈148 MB),
  internal on `127.0.0.1:8081`
- `data/bundle` + `data/processed` (incl. the committed
  `search_index.json` retrieval corpus) + `shared/calibrated-data`
- secrets stay out — `.dockerignore` drops every `.env`
