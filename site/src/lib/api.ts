/**
 * Live API client with deterministic local fallback.
 * Online:  /api/risk, /api/risk/curve hit the C++-calibrated FastAPI.
 * Offline: the bundled mirror in lib/risk.ts (same formula, same JSON).
 */
import { riskCurveLocal, riskIndexLocal, type RiskResult } from './risk'
import snapshot from '../data/psi_snapshot.json'

const TIMEOUT_MS = 1200

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
