import data from '../data/historical_scenarios.json'
import { BALANCE, GRID_H, GRID_W } from './config'
import { isWalkable } from './fire'
import { rectContains, tileKey } from './types'
import type { GameState, Room } from './types'

export interface ScenarioEffects {
  seedFraction?: number
  intensity0?: number
  spreadMult?: number
  hidden?: boolean
  selfOxidizing?: boolean
  smolderGuaranteed?: boolean
  rupture?: boolean
  damageFull?: boolean
  spillFires?: number
  safetyHit?: number
  crewBurnMult?: number
}

export interface ScenarioDef {
  id: string
  name: string
  year: number
  moduleHint: string
  description: string
  initialConditions: Record<string, unknown>
  effects: ScenarioEffects
  lesson: string
  citation: string
}

export const SCENARIOS: ScenarioDef[] = (data as { scenarios: ScenarioDef[] }).scenarios

/** pick the most dramatic target: an active non-deck module, biggest first */
function pickTarget(state: GameState): Room | null {
  const cands = state.rooms.filter((r) => r.state === 'active' && r.type !== 'deck')
  return cands.sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)[0] ?? null
}

function seed(state: GameState, x: number, y: number, s: ScenarioDef, base: number) {
  const k = tileKey(x, y)
  if (state.fires.has(k)) return
  const e = s.effects
  const room = state.rooms.find((r) => rectContains(r.rect, x, y))
  const fuel = room && room.type !== 'deck' ? BALANCE.fireFuelModule : BALANCE.fireFuelDeck
  state.fires.set(k, {
    x,
    y,
    intensity: e.intensity0 ?? 0.3,
    fuel,
    hidden: e.hidden ?? false,
    spreadRate: Math.min(1, base * (e.spreadMult ?? 1)),
    smolder: e.smolderGuaranteed ?? false,
    selfOxidizing: e.selfOxidizing ?? false,
    burnMult: e.crewBurnMult ?? 1,
    dormant: 0,
    sourceInv: `${s.name} (${s.year})`,
  })
}

/**
 * Replay a documented NASA fire incident inside the yard.
 * Base spread is anchored to a SoFIE-class solid (~1.5 cm/s -> 0.4 tile rate).
 */
export function applyScenario(
  state: GameState,
  id: string,
  rng: () => number,
  log: (kind: 'warn' | 'danger' | 'info', text: string, ref?: string) => void,
): boolean {
  const s = SCENARIOS.find((x) => x.id === id)
  const room = s && pickTarget(state)
  if (!s || !room) return false
  const e = s.effects

  if (e.rupture) {
    // Apollo 13: the tank room itself is destroyed outright, fire spills
    // into neighboring walkable tiles (adjacent-module cascade)
    room.state = 'damaged'
    room.damage = 1
    room.experiment = null
    room.fabJob = null
    log('danger', `${room.label} suffered a cryo-tank rupture — cascade into adjacent modules!`, s.citation)
    let spilled = 0
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
    const edge: [number, number][] = []
    for (let y = room.rect.y; y < room.rect.y + room.rect.h; y++)
      for (let x = room.rect.x; x < room.rect.x + room.rect.w; x++)
        for (const [dx, dy] of dirs) {
          const nx = x + dx
          const ny = y + dy
          if (!rectContains(room.rect, nx, ny) && nx >= 0 && ny >= 0 && nx < GRID_W && ny < GRID_H && isWalkable(state, nx, ny))
            edge.push([nx, ny])
        }
    while (spilled < (e.spillFires ?? 2) && edge.length) {
      const [x, y] = edge.splice((rng() * edge.length) | 0, 1)[0]
      seed(state, x, y, s, 0.4)
      spilled++
    }
    seed(state, room.rect.x + Math.floor(room.rect.w / 2), room.rect.y + Math.floor(room.rect.h / 2), s, 0.4)
  } else {
    // flashover / self-fed fire: seed a fraction of the room's tiles
    const tiles: [number, number][] = []
    for (let y = room.rect.y; y < room.rect.y + room.rect.h; y++)
      for (let x = room.rect.x; x < room.rect.x + room.rect.w; x++) tiles.push([x, y])
    const n = Math.max(1, Math.round(tiles.length * (e.seedFraction ?? 0.3)))
    for (let i = 0; i < n && tiles.length; i++) {
      const [x, y] = tiles.splice((rng() * tiles.length) | 0, 1)[0]
      seed(state, x, y, s, 0.4)
    }
    log('danger', `${s.name}: ${room.label} — ${s.description}`, s.citation)
  }
  log('info', `Lesson: ${s.lesson}`, s.citation)
  state.safety = Math.max(0, state.safety - (e.safetyHit ?? 15))
  return true
}
