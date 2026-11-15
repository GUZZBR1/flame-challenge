/**
 * Live-only surfaces of the Freefall Foundry backend:
 *   /api/ask        — SQL-RAG answers with PSI citations
 *   /ws/chamber     — 30 Hz chamber stream from the compiled engine
 * No offline mirror: when the backend is down these degrade to an
 * explicit "engine offline" state instead of fabricated data.
 */

export interface AskCitation {
  id: string
  type: string
  title: string
  url?: string
  ref?: string
}

export interface AskResponse {
  query: string
  mode: string
  answer: string
  rows?: Record<string, unknown>[]
  citations: AskCitation[]
  grounding?: { investigationId?: string; fuel?: string }
}

export async function askQuestion(q: string, k = 6): Promise<AskResponse | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, k }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    return res.ok ? ((await res.json()) as AskResponse) : null
  } catch {
    return null
  }
}

export interface ChamberState {
  model: 'droplet' | 'spread'
  tSec: number
  regime: number
  dropletDMm?: number
  flameRMm?: number
  flameTempK?: number
  heatReleaseW?: number
  burnFraction?: number
  frontPosCm?: number
  spreadRateCms?: number
  burnLengthCm?: number
  intensity?: number
  o2Pct: number
  o2EffPct: number
  volumeLiters: number
  ignited: boolean
  coolFlame: boolean
  finished: boolean
  events?: string[]
  observations?: { coolFlameObserved: boolean; events: string[] }
  done?: boolean
}

export interface ChamberRequest {
  investigationId: string
  o2Pct: number
  flowCms?: number
  pressureKpa?: number
  seed?: number
  volumeLiters?: number
  ambientO2Pct?: number
  ventPerSec?: number
  co2Pct?: number
  hePct?: number
}

/**
 * Stream a live chamber run. Calls back with every 30 Hz frame; the last
 * frame carries done:true. Returns the socket so the caller can abort.
 */
export function streamChamber(
  req: ChamberRequest,
  onFrame: (s: ChamberState) => void,
  onError: (msg: string) => void,
): WebSocket | null {
  try {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws/chamber`)
    ws.onopen = () => ws.send(JSON.stringify(req))
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data as string)
        if (m.error) {
          onError(typeof m.error === 'string' ? m.error : 'run rejected')
        } else if (m.done) {
          onFrame({ ...(m.state as ChamberState), done: true })
        } else {
          onFrame(m as ChamberState)
        }
      } catch {
        // ignore malformed frame
      }
    }
    ws.onerror = () => onError('chamber stream unreachable')
    return ws
  } catch {
    onError('websocket unsupported')
    return null
  }
}
