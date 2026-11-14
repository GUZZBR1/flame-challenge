import type {
  Category,
  HazardTag,
  Insight,
  Investigation,
  RankedInvestigation,
  ScoreBreakdown,
} from '../types'

export const CATEGORY_LABELS: Record<Category, string> = {
  'solid-flame-spread': 'Solid flame spread',
  droplet: 'Droplet combustion',
  'gaseous-diffusion': 'Gaseous diffusion',
  'large-scale-fire': 'Large-scale fire',
  'smoke-aerosol': 'Smoke aerosol',
  confined: 'Confined geometry',
  'partial-gravity': 'Partial gravity',
}

export const HAZARD_LABELS: Record<HazardTag, string> = {
  'low-oxygen-persistence': 'Low-O₂ persistence',
  'cool-flames': 'Cool flames',
  'smolder-risk': 'Smoldering risk',
  'toxic-aerosol': 'Toxic aerosol',
  'large-scale-spread': 'Large-scale spread',
  'detection-gap': 'Detection gap',
  'exploration-atmosphere': 'Exploration atmosphere',
  'partial-gravity': 'Partial gravity',
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n))

/** Cabin air reference: ~21% O2 at ~101 kPa. Materials burning below this in u-g are a red flag. */
const CABIN_O2_PCT = 21

function flammabilityScore(inv: Investigation): number {
  let score = 10
  const loc = inv.metrics.limitingOxygenPct
  if (loc !== null) {
    score += clamp((CABIN_O2_PCT - loc) / CABIN_O2_PCT, 0, 1) * 20
  }
  const spread = inv.metrics.flameSpreadRateCms
  if (spread) {
    score += clamp(spread.max / 10, 0, 1) * 10
  }
  return clamp(score, 0, 40)
}

function hiddenHazardScore(inv: Investigation): number {
  let score = 0
  if (inv.metrics.coolFlameObserved) score += 10
  if (inv.metrics.smolderObserved) score += 8
  if (inv.hazards.includes('detection-gap')) score += 7
  if (inv.hazards.includes('toxic-aerosol')) score += 5
  return clamp(score, 0, 25)
}

function relevanceScore(inv: Investigation): number {
  let score = 0
  if (inv.gravity === 'partial-gravity') score += 12
  else if (inv.gravity === 'mixed') score += 6
  else score += 2
  if (inv.conditions.explorationRelevant) score += 6
  if (inv.category === 'large-scale-fire') score += 4
  if (inv.hazards.includes('low-oxygen-persistence')) score += 4
  if (inv.hazards.includes('exploration-atmosphere')) score += 4
  return clamp(score, 0, 20)
}

function dataRichnessScore(inv: Investigation): number {
  const avail = { full: 8, partial: 5, 'metadata-only': 2 }[inv.data.availability]
  return avail + clamp(inv.publications / 40, 0, 1) * 7
}

export function scoreInvestigation(inv: Investigation): ScoreBreakdown {
  const breakdown = {
    flammability: flammabilityScore(inv),
    hiddenHazard: hiddenHazardScore(inv),
    relevance: relevanceScore(inv),
    dataRichness: dataRichnessScore(inv),
  }
  return {
    ...breakdown,
    total: Math.round(
      breakdown.flammability +
        breakdown.hiddenHazard +
        breakdown.relevance +
        breakdown.dataRichness,
    ),
  }
}

export function summarize(inv: Investigation): string {
  const findings = inv.keyFindings[0]
  const implications = inv.safetyImplications[0]
  return `${inv.name} (${inv.years}) — ${inv.title.toLowerCase()} — ran aboard ${inv.platform}. ${findings} ${implications}`
}

export function rankInvestigations(list: Investigation[]): RankedInvestigation[] {
  return [...list]
    .sort((a, b) => scoreInvestigation(b).total - scoreInvestigation(a).total)
    .map((inv, i) => ({
      inv,
      rank: i + 1,
      score: scoreInvestigation(inv),
      summary: summarize(inv),
    }))
}

/** Rule-based "AI" layer: deterministic insights generated from the ranked corpus. */
export function buildInsights(ranked: RankedInvestigation[]): Insight[] {
  const all = ranked.map((r) => r.inv)
  const insights: Insight[] = []

  if (all.some((i) => i.metrics.coolFlameObserved)) {
    const src = all.filter((i) => i.metrics.coolFlameObserved).map((i) => i.name)
    insights.push({
      id: 'cool-flames',
      kind: 'detection',
      severity: 'critical',
      title: 'Invisible combustion outlives visible fire',
      body:
        'FLEX demonstrated that droplet fuels keep burning as cool flames (~600 K) long after visible flameout. On a crewed vehicle, post-extinguishment monitoring is mandatory: undetected combustion can persist, generate CO, and re-ignite fuel vapors. Detection must rely on gas species and thermal sensors, not flame signatures.',
      sources: src,
    })
  }

  const lowLoc = all.filter(
    (i) => i.metrics.limitingOxygenPct !== null && i.metrics.limitingOxygenPct <= CABIN_O2_PCT,
  )
  if (lowLoc.length > 0) {
    insights.push({
      id: 'low-oxygen',
      kind: 'materials',
      severity: 'high',
      title: 'Earth-safe materials can burn in microgravity',
      body:
        'SoFIE-GEL and BASS-II show solid fuels spreading flames at oxygen levels below normal-gravity extinction limits. Flammability qualification limits derived on Earth underpredict the risk — cabin material selection and O2-level fire scenarios need microgravity-specific bounds.',
      sources: lowLoc.map((i) => i.name),
    })
  }

  if (all.some((i) => i.metrics.smolderObserved)) {
    const src = all.filter((i) => i.metrics.smolderObserved).map((i) => i.name)
    insights.push({
      id: 'smolder',
      kind: 'detection',
      severity: 'high',
      title: 'Smoldering hides inside confined spacecraft volumes',
      body:
        'Without buoyancy, pyrolysis gases accumulate near the hot surface, enabling long-duration smoldering with weak smoke signatures. Incipient-fire detection should prioritize CO and low-temperature thermal sensing over particulate alarms alone.',
      sources: src,
    })
  }

  const pg = all.filter((i) => i.gravity === 'partial-gravity')
  if (pg.length > 0) {
    insights.push({
      id: 'partial-gravity',
      kind: 'atmosphere',
      severity: 'high',
      title: 'Lunar and Martian gravity need dedicated fire data',
      body:
        'FLARE maps flammability limits at 0.17 g and 0.38 g via on-orbit centrifuge. Partial gravity restores partial buoyancy — limits are NOT linear interpolations between ISS and Earth results. Artemis/Gateway and Mars transit fire plans require these partial-g datasets directly.',
      sources: pg.map((i) => i.name),
    })
  }

  if (all.some((i) => i.conditions.explorationRelevant)) {
    const src = all.filter((i) => i.conditions.explorationRelevant).map((i) => i.name)
    insights.push({
      id: 'exploration-atmosphere',
      kind: 'atmosphere',
      severity: 'medium',
      title: 'Exploration atmospheres widen the flammability envelope',
      body:
        'Proposed habitats/EVA support mix reduced pressure (~57–70 kPa) with elevated O2 mole fraction (~34%). Several experiments show elevated O2 accelerates flame spread and delays extinction. Materials and procedures must be qualified against these atmospheres, not cabin air.',
      sources: src.slice(0, 5),
    })
  }

  const large = all.filter((i) => i.category === 'large-scale-fire')
  if (large.length > 0) {
    insights.push({
      id: 'large-scale',
      kind: 'operations',
      severity: 'high',
      title: 'Real-scale fires behave differently than lab samples',
      body:
        'Saffire burned meter-scale material in an actual Cygnus vehicle: concurrent flame spread is dramatically faster than small-sample tests suggest. Vehicle-level flow geometry and fuel area dominate — small-scale CIR data must be extrapolated carefully.',
      sources: large.map((i) => i.name),
    })
  }

  if (all.some((i) => i.hazards.includes('detection-gap'))) {
    const src = all.filter((i) => i.hazards.includes('detection-gap')).map((i) => i.name)
    insights.push({
      id: 'smoke-detectors',
      kind: 'detection',
      severity: 'medium',
      title: 'Smoke detectors calibrated for Earth may under-detect in space',
      body:
        'SAME measured that microgravity smoke particles are larger and more agglomerated — without sedimentation they remain airborne. ISS-class detectors tuned for Earth aerosol distributions risk missed alarms; aerosol signatures could also enable fire-vs-nuisance discrimination.',
      sources: src,
    })
  }

  return insights
}
