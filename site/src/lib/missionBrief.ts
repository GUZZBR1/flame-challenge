import type { SiSimulationCommands } from './api'
import type { GeneratedDashboard } from './generatedDashboards'
import { GRAVITY_G } from './simConsole'

/** A report's conditions, handed from the dashboard to the console that
 *  mounts after the screen swap. */
export interface MissionBrief {
  commands: SiSimulationCommands
  prompt: string
  label: string
}

function gravityKey(report: GeneratedDashboard): string {
  const explicit = (report.analysisScenario?.gravity ?? report.scenario?.gravity ?? '').toLowerCase()
  if (explicit in GRAVITY_G) return explicit
  const g = report.spec.rubric.summarize.gravityRegime.toLowerCase()
  if (g.includes('lunar') || g.includes('0.16')) return 'lunar'
  if (g.includes('mars')) return 'mars'
  if (g.includes('earth') || g.includes('1g')) return 'earth'
  return 'microgravity'
}

export function buildMissionBrief(report: GeneratedDashboard): MissionBrief {
  const { summarize } = report.spec.rubric
  const name = report.spec.title.split('//')[0]?.trim() || report.spec.title
  return {
    commands: {
      load_preset: summarize.investigationId,
      set_o2_percent: summarize.o2Pct,
      set_airflow_cm_s: summarize.flowCms,
      set_gravity_g: GRAVITY_G[gravityKey(report)] ?? 0,
    },
    prompt: `Analyze the mission brief "${report.spec.title}" at ${summarize.o2Pct}% O₂, ${summarize.flowCms} cm/s airflow, ${summarize.gravityRegime}.`,
    label: `Explore report — ${name}`,
  }
}
