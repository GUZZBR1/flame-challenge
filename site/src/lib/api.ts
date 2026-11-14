/**
 * Live API client with deterministic local fallback.
 * Online:  /api/risk, /api/risk/curve hit the C++-calibrated FastAPI.
 * Offline: the bundled mirror in lib/risk.ts (same formula, same JSON).
 */
import { riskCurveLocal, riskIndexLocal, type RiskResult, type RiskUncertainty } from './risk'
import snapshot from '../data/psi_snapshot.json'

const TIMEOUT_MS = 1200
const SI_TIMEOUT_MS = 20000 // llm gateway can be slow; fallback fires anyway

async function probe<T>(url: string): Promise<T | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

export type EngineStatus = 'checking' | 'cpp' | 'local'

export async function engineStatus(): Promise<EngineStatus> {
  const health = await probe<{ engine?: string }>('/health')
  return health?.engine === 'c++' ? 'cpp' : 'local'
}

export async function riskIndex(
  materialId: string,
  o2Pct: number,
  flowCms: number,
  gravity: string,
): Promise<RiskResult> {
  const live = await probe<RiskResult>(
    `/api/risk?materialId=${materialId}&o2Pct=${o2Pct}&flowCms=${flowCms}&gravity=${gravity}`,
  )
  return live ?? riskIndexLocal(materialId, o2Pct, flowCms, gravity)
}

export interface CurvePoint {
  o2Pct: number
  riskIndex: number
  level: string
}

export async function riskCurve(
  materialId: string,
  flowCms: number,
  gravity: string,
): Promise<CurvePoint[]> {
  const live = await probe<{ points: CurvePoint[] }>(
    `/api/risk/curve?materialId=${materialId}&flowCms=${flowCms}&gravity=${gravity}&o2Min=8&o2Max=40&step=0.5`,
  )
  return live?.points ?? riskCurveLocal(materialId, flowCms, gravity)
}

/* ---------- SI copilot (conversational + voice) ---------- */

export interface SiChamberState {
  investigationId?: string | null
  materialId?: string | null
  o2Pct: number
  flowCms: number
  gravity: string
  module?: string | null
}

export interface SiUiCommand {
  set_o2_percent?: number | null
  set_airflow_cm_s?: number | null
  load_preset?: string | null
  focus_module?: string | null
}

export interface SiEvidence {
  runId: string
  accession: string
  investigationId: string
  fuel: string
  outcome: string
  similarity: number
  verified: boolean
  sourceUrl: string
}

export interface SiResponse {
  briefing: string
  recommended_action: string
  ui_command: SiUiCommand | null
  mode: 'llm' | 'offline-fallback' | 'local-fallback'
  model: string
  engine?: string
  chamber?: Record<string, unknown>
  evidence: SiEvidence[]
}

async function post<T>(url: string, body: BodyInit, timeout = SI_TIMEOUT_MS): Promise<T | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeout)
    const res = await fetch(url, { method: 'POST', body, signal: ctrl.signal })
    clearTimeout(t)
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** Local mirror of the backend offline policy — same physics, computed
 *  from risk_model.json, for when the API itself is unreachable. */
function siLocalFallback(state: SiChamberState): SiResponse {
  const mat = state.materialId ?? 'pmma'
  const r = riskIndexLocal(mat, state.o2Pct, state.flowCms, state.gravity)
  let action: SiResponse['recommended_action'] = 'SUPPRESS_LOCAL'
  let ui: SiUiCommand | null = null
  if (r.flags.belowLoc || r.riskIndex < 0.25) {
    ui = state.module ? { focus_module: state.module } : null
  } else if (state.flowCms >= 8 && r.riskIndex >= 0.5) {
    action = 'CUT_VENTILATION'
    ui = { set_airflow_cm_s: 0 }
  } else if (r.flags.smoldering && r.riskIndex >= 0.5) {
    action = 'COOL_AND_ISOLATE'
    ui = { set_airflow_cm_s: 0 }
  } else if (r.margin > 3) {
    action = 'REDUCE_O2'
    ui = { set_o2_percent: Math.round(Math.max(0, Math.min(r.locPct + 1, state.o2Pct - 1)) * 10) / 10 }
  }
  const regime = r.flags.coolFlameCapable
    ? 'cool-flame capable — an optical "out" is a monitoring window, not safety.'
    : state.flowCms >= 8
      ? 'forced flow is in the saffire propagation regime — ventilation is the lever.'
      : 'ignition-pressure limited regime — the o₂ margin is the lever.'
  const u = r.uncertainty
  const band = u
    ? ` Empirical band ${Math.round(u.lower * 100)}–${Math.round(u.upper * 100)}% (90% conformal, n=${u.calibrationN} psi runs).` +
      (u.regime === 'extrapolation'
        ? ' Operating point is outside the calibrated psi envelope — extrapolation regime.'
        : '')
    : ''
  return {
    briefing: `${r.materialName} at ${r.o2Pct}% o₂ / ${r.flowCms} cm/s (${r.gravity}): risk index ${Math.round(r.riskIndex * 100)}% (${r.level}) — margin ${r.margin} pt vs loc ${r.locPct}%. ${regime}${band} [local model — api offline, psi evidence unavailable]`,
    recommended_action: action,
    ui_command: ui,
    mode: 'local-fallback',
    model: 'deterministic',
    chamber: { materialId: r.materialId, riskIndex: r.riskIndex, level: r.level },
    evidence: [],
  }
}

export async function siChat(
  message: string,
  state: SiChamberState,
): Promise<SiResponse> {
  const live = await postJson<SiResponse>('/api/si/chat', {
    message,
    current_chamber_state: state,
  })
  return live ?? siLocalFallback(state)
}

async function postJson<T>(url: string, payload: unknown): Promise<T | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), SI_TIMEOUT_MS)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

export interface SiVoiceResult {
  transcript: string | null
  stt: 'whisper.cpp' | 'offline'
  response: SiResponse
}

export async function siVoice(
  audio: Blob,
  state: SiChamberState,
): Promise<SiVoiceResult | null> {
  const fd = new FormData()
  fd.append('audio', audio, 'clip.webm')
  fd.append('state', JSON.stringify(state))
  return post<SiVoiceResult>('/api/si/voice', fd, SI_TIMEOUT_MS + 25000)
}

/* ---------- materials index ---------- */

export interface InvestigationSpec {
  model: string
  materialId: string
  o2Range: [number, number]
  flowRangeCms: [number, number]
  pressureKpa?: number
  loc?: number
}

export async function materialsIndex(): Promise<Record<string, InvestigationSpec>> {
  const live = await probe<{ investigations: Record<string, InvestigationSpec> }>('/api/materials')
  return live?.investigations ?? FALLBACK_INVESTIGATIONS
}

/** Embedded copy of shared/calibrated-data/calibration.json investigation
 *  shells — used only when the API is unreachable so presets still load. */
const FALLBACK_INVESTIGATIONS: Record<string, InvestigationSpec> = {
  'sofie-gel': { model: 'spread', materialId: 'pmma', o2Range: [15, 24], flowRangeCms: [0, 25], loc: 15 },
  'bass-ii': { model: 'spread', materialId: 'pmma-sphere', o2Range: [17, 40], flowRangeCms: [0, 20], loc: 17 },
  'flex-2': { model: 'droplet', materialId: 'heptane', o2Range: [12, 34], flowRangeCms: [0, 2.55] },
  acme: { model: 'spread', materialId: 'ethylene', o2Range: [12, 85], flowRangeCms: [0, 70] },
  saffire: { model: 'spread', materialId: 'cotton', o2Range: [21.5, 22.1], flowRangeCms: [20, 30] },
  same: { model: 'spread', materialId: 'teflon', o2Range: [21, 21], flowRangeCms: [0, 10] },
  'confined-combustion': { model: 'spread', materialId: 'thin-sheet', o2Range: [19, 40], flowRangeCms: [0, 15] },
  flare: { model: 'spread', materialId: 'pmma', o2Range: [15, 40], flowRangeCms: [0, 30] },
}

/** Rank pillar — /api/risk/rank when the backend is up (same model the
 *  local rankMaterials mirrors). `rank` is assigned client-side. */
export async function riskRank(
  o2Pct: number,
  flowCms: number,
  gravity: string,
  top = 8,
): Promise<{ ranked: RiskResult[]; engine: string } | null> {
  const live = await probe<{ ranked?: RiskResult[]; engine?: string }>(
    `/api/risk/rank?o2Pct=${o2Pct}&flowCms=${flowCms}&gravity=${gravity}&top=${top}`,
  )
  return live?.ranked
    ? { ranked: live.ranked, engine: live.engine ?? 'api' }
    : null
}

export interface DecisionOption {
  label: string
  why: string
  score: number
  action: string
  /** conformal band on the counterfactual point (MAPIE-fitted) */
  uncertainty?: RiskUncertainty | null
  /** counterfactual chamber point the score was evaluated at */
  model?: { materialId: string; o2Pct: number; flowCms: number; gravity: string }
}

export interface DecisionCard {
  id: string
  context: string
  question: string
  metric: string
  options: DecisionOption[]
  sources: string[]
}

export interface DecisionPayload {
  engine: string
  briefing: string
  cards: DecisionCard[]
  neighbors: { runId: string; accession: string; fuel: string; similarity: number; outcome: string }[]
  material: { materialId: string }
  chamber?: {
    materialId: string
    requestedMaterialId?: string
    o2Pct: number
    flowCms: number
    ignitionPressure: number
  }
}

/** Interpret pillar — live tactical synthesis from the backend; the
 *  caller falls back to lib/dashboard's localTactics when null. */
export async function decisionCards(
  materialId: string,
  o2Pct: number,
  flowCms: number,
  gravity: string,
): Promise<DecisionPayload | null> {
  return probe<DecisionPayload>(
    `/api/decision-cards?materialId=${materialId}&o2Pct=${o2Pct}&flowCms=${flowCms}&gravity=${gravity}`,
  )
}

// ---------- investigation intelligence (live API → baked snapshot) ----------

export interface InvestigationStats {
  nRuns: number
  nLabeled: number
  burnFrac: number | null
  extinctFrac: number | null
  coolFlameRuns: number
  hiddenExtinctRuns: number
  o2Measured: [number, number] | null
  burnRateMedianMm2s: number | null
}

export interface InvestigationCard {
  id: string
  name: string
  rank: number
  score: number
  breakdown: Record<'flammability' | 'hiddenHazard' | 'explorationRelevance' | 'dataRichness', number>
  model: string | null
  materialId: string | null
  hazards: string[]
  o2Range: [number, number] | null
  flowRangeCms: [number, number] | null
  pressureKpa: number | null
  partialGravity: boolean
  effectiveLoc: number | null
  stats: InvestigationStats
  summary: string
  psiUrl: string
  engineFidelity?: { scoredRuns: number; accuracy: number }
}

export interface InvestigationDetail extends InvestigationCard {
  material?: {
    id: string
    name: string
    locPct: number
    locSource: string
    ignitionFitScope: string | null
    psiRuns: number
  }
  sampleRuns: {
    runId: string
    accession: string
    fuel: string
    o2Pct: number | null
    outcome: string
    extinctionType: string
    sourceUrl: string
    verified: string
  }[]
}

export interface Insight {
  id: string
  severity: 'high' | 'medium' | 'info'
  title: string
  body: string
  evidence: Record<string, unknown>
  sources: string[]
}

const snap = snapshot as unknown as {
  leaderboard: { weights: Record<string, number>; items: InvestigationCard[] }
  details: Record<string, InvestigationDetail>
  insights: { labeledRuns: number; items: Insight[] }
}

export async function investigations(): Promise<{
  weights: Record<string, number>
  items: InvestigationCard[]
  live: boolean
}> {
  const live = await probe<{ weights: Record<string, number>; items: InvestigationCard[] }>(
    '/api/investigations',
  )
  return live ? { ...live, live: true } : { ...snap.leaderboard, live: false }
}

export async function investigationDetail(
  id: string,
): Promise<InvestigationDetail | null> {
  const live = await probe<InvestigationDetail>(`/api/investigations/${id}`)
  return live ?? snap.details[id] ?? null
}

export async function insights(): Promise<{
  labeledRuns: number
  items: Insight[]
  live: boolean
}> {
  const live = await probe<{ labeledRuns: number; items: Insight[] }>('/api/insights')
  return live ? { ...live, live: true } : { ...snap.insights, live: false }
}
