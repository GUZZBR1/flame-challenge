/**
 * Dashboard data layer — the summarize/rank/interpret pillars.
 *
 * Static anchors: the frozen bundle JSONs (same artifacts /api serves).
 * Live anchors: /api/risk/rank, /api/decision-cards, /api/diffs when the
 * FastAPI backend is up — otherwise the identical local model from
 * lib/risk.ts (same formula, same calibrated-data JSONs).
 */
import bundle from '../../../data/bundle/investigations.json'
import diffsJson from '../../../data/bundle/investigation_diffs.json'
import { MATERIALS, riskIndexLocal, type RiskResult } from './risk'

/* ---------------- summarize: the investigation matrix ---------------- */

export interface Investigation {
  id: string
  name: string
  title: string
  agencies: string[]
  platform: string
  facility: string | null
  years: string
  status: string
  category: string
  gravity: string
  fuels: string[]
  conditions: {
    oxygenPct: [number, number] | null
    flowCms: [number, number] | null
    pressureKpa: number | null
    suppressants?: string[]
    explorationRelevant?: boolean
  }
  metrics: {
    limitingOxygenPct: number | null
    flameSpreadRateCms: { min: number; max: number } | null
    coolFlameObserved: boolean
    smolderObserved: boolean
  }
  objectives: string[]
  apparatus: string
  sensors: string[]
  testVariables: { held: string[]; varied: string[] }
  themes: string[]
  keyFindings: string[]
  safetyImplications: string[]
  data: { availability: string; psiUrl: string | null }
  psiRuns?: number
  psiAccessions?: string[]
  verified: boolean
}

export const INVESTIGATIONS =
  bundle.investigations as unknown as Investigation[]

export const THEME_LABELS: Record<string, string> = {
  detection: 'detection',
  suppression: 'suppression',
  'duct-flow': 'duct flow',
  'partial-gravity': 'partial g',
  'large-scale': 'large scale',
  spread: 'spread',
  flammability: 'flammability',
}

export const ALL_THEMES = [
  ...new Set(INVESTIGATIONS.flatMap((i) => i.themes)),
].sort()

export const DATASET_STATS = {
  investigations: INVESTIGATIONS.length,
  // unique normalized runs — umbrella/child records share accessions,
  // so summing per-record counts would double-count evidence
  psiRuns: (bundle as { meta?: { uniquePsiRuns?: number } }).meta
    ?.uniquePsiRuns ?? INVESTIGATIONS.reduce((n, i) => n + (i.psiRuns ?? 0), 0),
  verified: INVESTIGATIONS.filter((i) => i.verified).length,
  themes: ALL_THEMES.length,
}

/* ---------------- rank: scenario presets + local ranking ---------------- */

export interface Scenario {
  id: string
  label: string
  o2Pct: number
  flowCms: number
  gravity: string
  blurb: string
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'iss',
    label: 'iss cabin',
    o2Pct: 21,
    flowCms: 10,
    gravity: 'microgravity',
    blurb: '21% O₂ · ~101 kPa · nominal ventilation',
  },
  {
    id: 'lunar',
    label: 'lunar outpost',
    o2Pct: 34,
    flowCms: 5,
    gravity: 'lunar',
    blurb: '34% O₂ exploration atmosphere · 0.17 g',
  },
  {
    id: 'mars',
    label: 'mars transit',
    o2Pct: 34,
    flowCms: 10,
    gravity: 'martian',
    blurb: 'elevated-O₂ cabin · 0.38 g partial gravity',
  },
  {
    id: 'earth',
    label: 'earth control',
    o2Pct: 21,
    flowCms: 5,
    gravity: 'earth',
    blurb: 'sea-level control · 1 g baseline',
  },
]

export interface RankEntry extends RiskResult {
  rank: number
}

export function rankMaterials(s: Scenario, top = 8): RankEntry[] {
  return MATERIALS.map((m) =>
    riskIndexLocal(m.id, s.o2Pct, s.flowCms, s.gravity),
  )
    .sort((a, b) => b.riskIndex - a.riskIndex || a.materialId.localeCompare(b.materialId))
    .slice(0, top)
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

/* ---------------- interpret: counterfactual decision cards ---------------- */

export interface TacticOption {
  id: string
  label: string
  score: number
  why: string
}

export interface TacticCard {
  context: string
  question: string
  options: TacticOption[]
  evidence: string
}

/**
 * Offline mirror of backend/services/tactics.py — countermeasures are
 * scored by re-evaluating the same fitted risk model at the
 * counterfactual operating point, so the numbers stay auditable.
 */
export function localTactics(materialId: string, s: Scenario): TacticCard[] {
  const r = riskIndexLocal(materialId, s.o2Pct, s.flowCms, s.gravity)
  const mat = MATERIALS.find((m) => m.id === r.materialId) ?? MATERIALS[0]
  const hidden = r.breakdown.hiddenFactor
  const pct = (x: number) => Math.max(0, Math.min(100, Math.round(x)))
  const eff = (o2: number, flow: number) =>
    pct((1 - riskIndexLocal(r.materialId, o2, flow, s.gravity).riskIndex) * 100)

  const cool = r.flags.coolFlameCapable
  const smolder = r.flags.smoldering
  const belowTarget = Math.max(0, Math.min(r.locPct - 0.5, s.o2Pct - 2))

  const inert = pct(((0.8 - 0.25 * Number(smolder) - 0.1 * Number(cool)) / hidden) * 100)
  const mist = pct(((0.85 - 0.05 * Number(smolder)) / hidden) * 100)
  const monitor = pct(
    Math.max(0, 1 - 0.5 * hidden - 0.3 * Number(cool) - 0.25 * Number(smolder)) *
      (1 - 0.5 * r.riskIndex) * 100,
  )

  const evidence = cool
    ? 'FLEX/FLEX-2 documented the hazard: cool flames keep burning after visible flameout.'
    : smolder
      ? 'BASS/BASS-II documented smolder transitions — burn-out is not the end state.'
      : 'Anchored to the fitted LOC margin from ACME/BASS-II flammability data.'

  return [
    {
      context: 'containment · cabin airflow',
      question: 'how should the ventilation loop be operated right now?',
      evidence,
      options: [
        {
          id: 'cut-vent',
          label: 'cut ventilation to 0 cm/s',
          score: eff(s.o2Pct, 0),
          why: 'starves oxidizer diffusion — the SAFFIRE forced-flow regime collapses',
        },
        {
          id: 'halve-flow',
          label: `halve the flow (${Math.round(s.flowCms / 2)} cm/s)`,
          score: eff(s.o2Pct, s.flowCms / 2),
          why: 'slow-propagation regime — smoke clearing retained',
        },
        {
          id: 'keep-flow',
          label: `keep forced flow (${Math.round(s.flowCms)} cm/s)`,
          score: eff(s.o2Pct, s.flowCms),
          why: 'current operating point — highest spread exposure',
        },
      ],
    },
    {
      context: 'atmosphere · O₂ margin',
      question: `where should cabin O₂ sit against the ${r.locPct}% LOC?`,
      evidence: `LOC anchored at ${r.locPct}% (${mat.name}) — margin ${r.margin} pt`,
      options: [
        {
          id: 'hold-o2',
          label: `hold ${s.o2Pct}% O₂`,
          score: eff(s.o2Pct, s.flowCms),
          why: 'current margin — no action',
        },
        {
          id: 'reduce-o2',
          label: `reduce toward LOC (${r.locPct + 1}% O₂)`,
          score: eff(Math.min(r.locPct + 1, s.o2Pct - 1), s.flowCms),
          why: 'exploration-atmosphere target — margin shrinks to ~1 pt',
        },
        {
          id: 'below-loc',
          label: `drop below LOC (${Math.round(belowTarget * 10) / 10}% O₂)`,
          score: eff(belowTarget, s.flowCms),
          why: 'ignition pressure collapses — the Apollo-1 lesson in reverse',
        },
      ],
    },
    {
      context: 'suppression & detection',
      question: 'which response ends the event — and which only hides it?',
      evidence,
      options: [
        {
          id: 'inert-gas',
          label: 'inert-gas flood (N₂/CO₂)',
          score: inert,
          why: smolder
            ? 'smolder-capable material — knock-down risks re-ignition'
            : 'displaces oxidizer at the seat — the FLEX suppressant result',
        },
        {
          id: 'water-mist',
          label: 'water-mist cool',
          score: mist,
          why: smolder
            ? 'penetrates the polymer — best against smolder pockets'
            : 'cools below re-ignition temperature',
        },
        {
          id: 'monitor',
          label: 'monitor-only protocol',
          score: monitor,
          why: cool
            ? 'cool-flame fuels defeat optical clear — documented FLEX hazard'
            : 'accept the burn and watch it',
        },
      ],
    },
  ]
}

/* ---------------- investigation diff ---------------- */

export interface DiffPair {
  field: string
  label: string
  a?: string
  b?: string
  value?: string
}

export interface DiffCard {
  id: string
  title: string
  hook: string
  insight: string
  investigationId: string
  sameInvestigation: boolean
  accessions: string[]
  verified: boolean[]
  runA: Record<string, string> & { runId: string; accession: string }
  runB: Record<string, string> & { runId: string; accession: string }
  changed: { field: string; label: string; a: string; b: string }[]
  held: { field: string; label: string; value: string }[]
}

export const DIFF_CARDS = diffsJson.cards as unknown as DiffCard[]

export const INV_BY_ID = new Map(INVESTIGATIONS.map((i) => [i.id, i]))
