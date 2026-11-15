import { describe, expect, it } from 'vitest'
import { buildSeedReports, compileMissionReportSpec, reportLocPct } from './generatedDashboards'
import { buildMissionBrief } from './missionBrief'
import { queueMissionBrief, takeMissionBrief } from './simBus'
import { riskIndexLocal } from './risk'
import type { SiChamberState, SiResponse } from './api'

const seed = (id: string) => buildSeedReports().find((r) => r.id === id)!

describe('buildMissionBrief', () => {
  it('carries oxygen, airflow, investigation and gravity of a lunar report', () => {
    const b = buildMissionBrief(seed('artemis-01'))
    expect(b.commands).toMatchObject({ load_preset: 'flare', set_o2_percent: 34, set_airflow_cm_s: 1.5, set_gravity_g: 0.17 })
    expect(b.prompt).toContain('34% O₂')
    expect(b.label).toBe('Explore report — ARTEMIS-01')
  })

  it('maps a microgravity report to 0 g', () => {
    expect(buildMissionBrief(seed('iss-flex-02')).commands.set_gravity_g).toBe(0)
  })
})

describe('mission brief queue', () => {
  it('hands a queued brief over exactly once, however late the console mounts', () => {
    const brief = buildMissionBrief(seed('cygnus-saf-04'))
    queueMissionBrief(brief)
    expect(takeMissionBrief()).toBe(brief)
    expect(takeMissionBrief()).toBeNull()
  })
})

describe('material LOC on reports', () => {
  const response: SiResponse = {
    mode: 'local-fallback',
    model: 'test',
    briefing: '',
    recommended_action: '',
    ui_command: null,
    evidence: [],
  }
  const scenario: SiChamberState = { investigationId: 'flare', materialId: 'pmma', o2Pct: 14, flowCms: 1, gravity: 'microgravity' }

  it('stores PMMA\'s calibrated 15% LOC, so 14% O₂ reads as a 1-point margin below it', () => {
    const spec = compileMissionReportSpec('PMMA at 14% O₂ safety assessment', response, undefined, scenario)
    expect(spec.safetyEnvelope.locPct).toBe(15)
    expect(spec.safetyEnvelope.zone).toBe('safe')
    expect(spec.safetyEnvelope.currentO2 - (spec.safetyEnvelope.locPct ?? 0)).toBe(-1)
  })

  it('backfills seeds and legacy reports from the analyzed material', () => {
    const r = seed('iss-flex-02')
    expect(r.spec.safetyEnvelope.locPct).toBe(riskIndexLocal('heptane', r.spec.safetyEnvelope.currentO2).locPct)
    const legacy = { ...r, spec: { ...r.spec, safetyEnvelope: { ...r.spec.safetyEnvelope, locPct: undefined } } }
    expect(reportLocPct(legacy)).toBe(r.spec.safetyEnvelope.locPct)
  })

  it('returns undefined when a report names no material', () => {
    const r = seed('artemis-01')
    const bare = { ...r, scenario: undefined, analysisScenario: undefined, spec: { ...r.spec, safetyEnvelope: { ...r.spec.safetyEnvelope, locPct: undefined } } }
    expect(reportLocPct(bare)).toBeUndefined()
  })
})
