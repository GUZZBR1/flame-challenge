import type { ChamberState } from './live'
import type { SiChamberState, SiResponse } from './api'

export interface GeneratedDashboard {
  id: string
  createdAt: number
  prompt: string
  response: SiResponse
  scenario?: SiChamberState
  analysisScenario?: SiChamberState
  engineGravityMode?: string
  run?: ChamberState
}

const STORE_KEY = 'ignis-generated-dashboards-v1'
const EVENT = 'ignis:dashboard-generated'
const MAX_ITEMS = 30

function read(): GeneratedDashboard[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as GeneratedDashboard[]
    return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : []
  } catch {
    return []
  }
}

export function getGeneratedDashboards(): GeneratedDashboard[] {
  return read()
}

export function generateDashboard(
  prompt: string,
  response: SiResponse,
  run?: ChamberState,
  scenario?: SiChamberState,
  analysisScenario?: SiChamberState,
  engineGravityMode?: string,
): GeneratedDashboard {
  const item: GeneratedDashboard = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    prompt,
    response,
    ...(scenario ? { scenario } : {}),
    ...(analysisScenario ? { analysisScenario } : {}),
    ...(engineGravityMode ? { engineGravityMode } : {}),
    ...(run ? { run } : {}),
  }
  const items = [item, ...read()].slice(0, MAX_ITEMS)
  try { localStorage.setItem(STORE_KEY, JSON.stringify(items)) } catch { /* keep the current session usable */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: item }))
  return item
}

export function dashboardGeneratedEvent(): string { return EVENT }
