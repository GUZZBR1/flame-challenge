import data from '../data/tech_spinoffs.json'
import type { GameState } from './types'

export interface TechDef {
  id: string
  name: string
  source: string
  cost: number
  effects: {
    hiddenRevealMult?: number
    extinguishRateMult?: number
    crewBurnMult?: number
  }
  blurb: string
}

export const TECH: TechDef[] = (data as { tech: TechDef[] }).tech

/** multiplier for a tech effect, 1 when the upgrade isn't owned */
export function techMult(state: GameState, key: keyof TechDef['effects']): number {
  let m = 1
  for (const id of state.tech) {
    const t = TECH.find((x) => x.id === id)
    const v = t?.effects[key]
    if (v !== undefined) m *= v
  }
  return m
}

export function buyTech(state: GameState, id: string): boolean {
  const t = TECH.find((x) => x.id === id)
  if (!t || state.tech.includes(id) || state.science < t.cost) return false
  state.science -= t.cost
  state.tech.push(id)
  return true
}
