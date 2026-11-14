import { BALANCE } from './config'
import { rectContains, tileKey } from './types'
import type { CrewRole, FireTile, GameState, Rect, Room, RoomType } from './types'

/**
 * One-click "NASA official replay" presets — a judge should never have to
 * build a station for 10 min to see a documented incident. Each preset
 * rebuilds a compact shipyard layout and seeds the incident deterministically.
 */

export interface PresetHooks {
  addRoom: (type: RoomType, rect: Rect, label: string) => Room
  spawnCrew: (role: CrewRole) => void
  log: (kind: 'info' | 'warn' | 'danger' | 'science', text: string, ref?: string) => void
}

export interface PresetDef {
  id: string
  name: string
  tagline: string
  citation: string
  /** xorshift offset — replays stay deterministic */
  seed: number
}

export const PRESETS: PresetDef[] = [
  {
    id: 'flex',
    name: 'FLEX — Invisible Cool Flame',
    tagline: 'n-heptane droplet: post-extinction cool-flame stage (PSI-39)',
    citation: 'FLEX / FLEX-2 · NASA PSI-39',
    seed: 0xf1e2,
  },
  {
    id: 'saffire',
    name: 'SAFFIRE — Duct Propagation',
    tagline: 'SIBAL cloth burn riding the ventilation truss at forced-flow speed',
    citation: 'Saffire I–VI · NASA PSI',
    seed: 0x5aff,
  },
  {
    id: 'mir',
    name: "MIR '97 — Chemical Fire",
    tagline: 'LiClO₄ Vika generator — self-oxidizing, cannot be vented out',
    citation: 'Mir-23/24 reports · Burrough, Dragonfly',
    seed: 0x1997,
  },
  {
    id: 'apollo-1',
    name: 'APOLLO 1 — O₂ Flashover',
    tagline: '16.7 psia pure-O₂ cabin: spark → flashover in seconds',
    citation: 'Apollo 204 Review Board, NASA 1967',
    seed: 0xa901,
  },
]

/**
 * Compact single-spine shipyard: dock + apron + combustion rack on top,
 * a full-width truss corridor, then lab / quarters / fab underneath.
 * Every module stays edge-connected (walkable) for crew pathing.
 */
const YARD: [RoomType, Rect, string][] = [
  ['dock', { x: 3, y: 2, w: 3, h: 3 }, 'Docking Arm A'],
  ['deck', { x: 6, y: 2, w: 2, h: 3 }, 'Dock apron'],
  ['combustion', { x: 8, y: 2, w: 4, h: 3 }, 'Combustion Rack C-1'],
  ['deck', { x: 12, y: 2, w: 3, h: 3 }, 'Service bay'],
  ['deck', { x: 3, y: 5, w: 14, h: 1 }, 'Main truss'],
  ['lab', { x: 3, y: 6, w: 4, h: 3 }, 'Analysis Lab'],
  ['quarters', { x: 7, y: 6, w: 4, h: 3 }, 'Crew Quarters'],
  ['fab', { x: 12, y: 6, w: 4, h: 3 }, 'Fabrication Bay'],
]

function seedFire(state: GameState, x: number, y: number, over: Partial<FireTile>) {
  const k = tileKey(x, y)
  if (state.fires.has(k)) return
  const room = state.rooms.find((r) => rectContains(r.rect, x, y))
  const fuel = room && room.type !== 'deck' ? BALANCE.fireFuelModule : BALANCE.fireFuelDeck
  state.fires.set(k, {
    x,
    y,
    intensity: 0.3,
    fuel,
    hidden: false,
    spreadRate: 0.4,
    smolder: false,
    selfOxidizing: false,
    burnMult: 1,
    dormant: 0,
    sourceInv: '',
    ...over,
  })
}

function roomTiles(state: GameState, type: RoomType): [number, number][] {
  const room = state.rooms.find((r) => r.type === type)
  if (!room) return []
  const out: [number, number][] = []
  for (let y = room.rect.y; y < room.rect.y + room.rect.h; y++)
    for (let x = room.rect.x; x < room.rect.x + room.rect.w; x++) out.push([x, y])
  return out
}

export function applyPreset(state: GameState, id: string, hooks: PresetHooks): boolean {
  const def = PRESETS.find((p) => p.id === id)
  if (!def) return false

  for (const [t, rect, label] of YARD) {
    const room = hooks.addRoom(t, rect, label)
    // replays skip construction — modules come online immediately
    room.state = 'active'
    room.buildProgress = 1
  }
  for (let i = 0; i < 3; i++) {
    hooks.spawnCrew('engineer')
    hooks.spawnCrew('scientist')
  }
  // replay sandbox starts with enough science to field spin-off tech
  state.science = 140

  switch (id) {
    case 'flex': {
      for (const [x, y] of [[9, 3], [10, 3]] as [number, number][])
        seedFire(state, x, y, {
          intensity: 0.35,
          hidden: true,
          spreadRate: 0.25,
          sourceInv: 'FLEX-2 · PSI-39',
        })
      hooks.log(
        'warn',
        'Undetected combustion in Combustion Rack C-1 — cool flames produce no visible signature.',
        def.citation,
      )
      hooks.log(
        'info',
        'FLEX showed n-heptane droplets keep burning invisibly at ~600 K after the hot flame goes out.',
        def.citation,
      )
      break
    }
    case 'saffire': {
      for (const [x, y] of [[5, 5], [6, 5], [10, 5], [11, 5]] as [number, number][])
        seedFire(state, x, y, {
          intensity: 0.45,
          spreadRate: 0.95,
          smolder: true,
          sourceInv: 'Saffire-IV · SIBAL cloth',
        })
      hooks.log(
        'danger',
        'SIBAL cloth ignited in the ventilation truss — propagation rides the forced-flow vector.',
        def.citation,
      )
      hooks.log(
        'info',
        'SAFFIRE measured 5–25 cm/s forced-flow spread over large-scale samples in the Cygnus duct.',
        def.citation,
      )
      break
    }
    case 'mir': {
      for (const [x, y] of [[8, 7], [9, 7], [4, 5]] as [number, number][])
        seedFire(state, x, y, {
          intensity: 0.5,
          spreadRate: 0.55,
          smolder: true,
          selfOxidizing: true,
          burnMult: 1.5,
          sourceInv: 'Mir Vika O₂ generator (1997)',
        })
      state.safety = Math.max(0, state.safety - 20)
      hooks.log(
        'danger',
        'Crew Quarters: LiClO₄ oxygen generator ruptured — the fire feeds itself, venting will NOT starve it.',
        def.citation,
      )
      hooks.log(
        'info',
        'Mir-23/24: masks on, isolate the sector, cool until the chemical candle is spent (~14 min).',
        def.citation,
      )
      break
    }
    case 'apollo-1': {
      for (const [x, y] of roomTiles(state, 'combustion'))
        seedFire(state, x, y, {
          intensity: 0.7,
          spreadRate: 1.0,
          sourceInv: 'Apollo 1 pad fire (1967)',
        })
      state.safety = Math.max(0, state.safety - 25)
      hooks.log(
        'danger',
        'Flashover in Combustion Rack C-1 — at 16.7 psia / 100% O₂ every surface burns at once.',
        def.citation,
      )
      hooks.log(
        'info',
        'Apollo 204: atmosphere control IS the fire policy — materials marginal at 21% O₂ flash over in pure O₂.',
        def.citation,
      )
      break
    }
    default:
      return false
  }
  return true
}
