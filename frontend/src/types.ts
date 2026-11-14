export type Category =
  | 'solid-flame-spread'
  | 'droplet'
  | 'gaseous-diffusion'
  | 'large-scale-fire'
  | 'smoke-aerosol'
  | 'confined'
  | 'partial-gravity'

export type HazardTag =
  | 'low-oxygen-persistence'
  | 'cool-flames'
  | 'smolder-risk'
  | 'toxic-aerosol'
  | 'large-scale-spread'
  | 'detection-gap'
  | 'exploration-atmosphere'
  | 'partial-gravity'

export type DataAvailability = 'full' | 'partial' | 'metadata-only'

export interface Investigation {
  id: string
  name: string
  title: string
  agencies: string[]
  platform: string
  facility: string | null
  years: string
  status: 'completed' | 'ongoing'
  category: Category
  gravity: 'microgravity' | 'partial-gravity' | 'mixed'
  fuels: string[]
  conditions: {
    oxygenPct: [number, number] | null
    flowCms: [number, number] | null
    pressureKpa: number | null
    explorationRelevant: boolean
  }
  metrics: {
    limitingOxygenPct: number | null
    flameSpreadRateCms: { min: number; max: number } | null
    coolFlameObserved: boolean
    smolderObserved: boolean
  }
  keyFindings: string[]
  safetyImplications: string[]
  hazards: HazardTag[]
  data: { availability: DataAvailability; psiUrl: string | null }
  publications: number
  /** false = curated starter value pending verification against PSI files */
  verified: boolean
}

export interface Dataset {
  schemaVersion: number
  generated: string
  note: string
  investigations: Investigation[]
}

export interface ScoreBreakdown {
  flammability: number
  hiddenHazard: number
  relevance: number
  dataRichness: number
  total: number
}

export interface RankedInvestigation {
  inv: Investigation
  rank: number
  score: ScoreBreakdown
  summary: string
}

export type InsightKind = 'detection' | 'materials' | 'atmosphere' | 'operations'
export type Severity = 'critical' | 'high' | 'medium'

export interface Insight {
  id: string
  kind: InsightKind
  severity: Severity
  title: string
  body: string
  sources: string[]
}
