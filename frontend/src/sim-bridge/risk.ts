import model from '../data/risk_model.json'

/**
 * Cabin fire-risk client — prefers the FastAPI `/api/risk` simulator
 * (fit from PSI data by data/pipelines/fit_risk_model.py), degrades to a
 * local mirror of the same formula using the bundled risk_model.json so
 * the demo always runs standalone.
 *
 *     risk = clamp01( P_ign(o2 - loc) * F_flow(flow) * H * G )
 */

export type RiskLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'critical'

export interface RiskBreakdown {
  ignitionPressure: number
  flowFactor: number
  hiddenFactor: number
  gravityFactor: number
}

export interface RiskResult {
  materialId: string
  materialName: string
  o2Pct: number
  flowCms: number
  gravity: string
  locPct: number
  locSource: string
  margin: number
  riskIndex: number
  level: RiskLevel
  breakdown: RiskBreakdown
  flags: { coolFlameCapable: boolean; smoldering: boolean; belowLoc: boolean }
  engine: 'api' | 'local'
}

interface ModelMaterial {
  id: string
  name: string
  locPct: number
  locSource: string
  sootIndex: number
  coolFlameCapable: boolean
  smoldering: boolean
  hiddenFactor: number
}

const MATERIALS = (model as { materials?: Record<string, ModelMaterial> })
  .materials ?? {}
const FLOW_ANCHORS: number[][] =
  (model as { flowAnchors?: number[][] }).flowAnchors ?? [
    [0, 0.8], [2, 0.9], [8, 1.05], [18, 1.15], [40, 1.0], [80, 0.7], [150, 0.45],
  ]
const FORMULA = (model as {
  formula?: { ignitionBase: number; ignitionK: number; ignitionExp: number; residualBand: number }
}).formula ?? { ignitionBase: 0.04, ignitionK: 0.055, ignitionExp: 1.35, residualBand: 3 }

const GRAVITY_FACTOR: Record<string, number> = {
  microgravity: 1.0, lunar: 0.92, martian: 0.95,
  'partial-gravity': 0.94, earth: 0.85,
}

const FALLBACK_MATERIAL: ModelMaterial = {
  id: 'pmma', name: 'PMMA (acrylic)', locPct: 15.0, locSource: 'calibration',
  sootIndex: 0.35, coolFlameCapable: false, smoldering: true, hiddenFactor: 1.185,
}

export function riskMaterials(): ModelMaterial[] {
  const list = Object.values(MATERIALS)
  return list.length ? list : [FALLBACK_MATERIAL]
}

function flowFactor(flowCms: number): number {
  const f = Math.max(0, flowCms)
  const a = FLOW_ANCHORS
  if (f <= a[0][0]) return a[0][1]
  for (let i = 0; i < a.length - 1; i++) {
    const [x0, y0] = a[i]
    const [x1, y1] = a[i + 1]
    if (f <= x1) return y0 + ((y1 - y0) * (f - x0)) / (x1 - x0)
  }
  return a[a.length - 1][1]
}

function ignitionPressure(margin: number): number {
  const p = FORMULA
  if (margin <= 0) return margin > -p.residualBand ? p.ignitionBase : 0
  return Math.min(1, p.ignitionBase + p.ignitionK * Math.pow(margin, p.ignitionExp))
}

function level(risk: number): RiskLevel {
  if (risk < 0.05) return 'minimal'
  if (risk < 0.25) return 'low'
  if (risk < 0.5) return 'moderate'
  if (risk < 0.75) return 'high'
  return 'critical'
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000
}

/** PSI fuels without a fitted entry map to the closest gaseous analog */
const MATERIAL_ALIAS: Record<string, string> = { ethane: 'propane', butane: 'propane' }

export function riskIndexLocal(
  materialId: string,
  o2Pct: number,
  flowCms = 0,
  gravity = 'microgravity',
): RiskResult {
  const m =
    MATERIALS[materialId] ??
    MATERIALS[MATERIAL_ALIAS[materialId] ?? ''] ??
    MATERIALS.pmma ??
    FALLBACK_MATERIAL
  const margin = o2Pct - m.locPct
  const p = ignitionPressure(margin)
  const f = flowFactor(flowCms)
  const h = m.hiddenFactor ?? 1
  const g = GRAVITY_FACTOR[gravity.toLowerCase()] ?? 1.0
  const risk = Math.max(0, Math.min(1, p * f * h * g))
  return {
    materialId: m.id,
    materialName: m.name,
    o2Pct,
    flowCms,
    gravity,
    locPct: m.locPct,
    locSource: m.locSource ?? 'calibration',
    margin: Math.round(margin * 100) / 100,
    riskIndex: round4(risk),
    level: level(risk),
    breakdown: {
      ignitionPressure: round4(p),
      flowFactor: round4(f),
      hiddenFactor: round4(h),
      gravityFactor: g,
    },
    flags: {
      coolFlameCapable: !!m.coolFlameCapable,
      smoldering: !!m.smoldering,
      belowLoc: margin <= 0,
    },
    engine: 'local',
  }
}

const cache = new Map<string, RiskResult>()

export async function riskIndex(
  materialId: string,
  o2Pct: number,
  flowCms = 0,
  gravity = 'microgravity',
): Promise<RiskResult> {
  const key = `${materialId}:${o2Pct}:${flowCms}:${gravity}`
  const hit = cache.get(key)
  if (hit) return hit
  try {
    const params = new URLSearchParams({
      materialId, o2Pct: String(o2Pct),
      flowCms: String(flowCms), gravity,
    })
    const r = await fetch(`/api/risk?${params}`, {
      signal: AbortSignal.timeout(1500),
    })
    if (r.ok) {
      const j = (await r.json()) as Omit<RiskResult, 'engine'>
      const out: RiskResult = { ...j, engine: 'api' }
      cache.set(key, out)
      return out
    }
  } catch {
    /* backend offline — local mirror */
  }
  const out = riskIndexLocal(materialId, o2Pct, flowCms, gravity)
  cache.set(key, out)
  return out
}

/** O2 sweep at fixed ventilation — for charts (local, synchronous). */
export function riskCurveLocal(
  materialId: string,
  flowCms = 0,
  gravity = 'microgravity',
  o2Min = 8,
  o2Max = 40,
  step = 0.5,
): { o2Pct: number; riskIndex: number; level: RiskLevel }[] {
  const pts = []
  for (let o2 = o2Min; o2 <= o2Max + 1e-9; o2 += step) {
    const r = riskIndexLocal(materialId, o2, flowCms, gravity)
    pts.push({ o2Pct: Math.round(o2 * 100) / 100, riskIndex: r.riskIndex, level: r.level })
  }
  return pts
}
