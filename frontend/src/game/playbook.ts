import { TECH } from './tech'
import type { GameState } from './types'

/**
 * Pillar 3 — tactical interpretation. When fire breaks out, explain the
 * physics regime in three short lines and point at the NASA spin-off tech
 * that mitigates it (Interpret / SI Insights).
 */

export interface PlaybookCard {
  severity: 'danger' | 'warn'
  title: string
  lines: [string, string, string]
  mitigations: { id: string; name: string; owned: boolean; source: string }[]
  ref: string
}

function mitigationList(state: GameState, ids: string[]) {
  return TECH.filter((t) => ids.includes(t.id)).map((t) => ({
    id: t.id,
    name: t.name,
    owned: state.tech.includes(t.id),
    source: t.source,
  }))
}

/** pick the dominant physics regime among live fires (worst first) */
export function playbookFor(state: GameState): PlaybookCard | null {
  const fires = [...state.fires.values()]
  if (!fires.length) return null

  const selfOx = fires.some((f) => f.selfOxidizing)
  const flash = fires.filter((f) => !f.hidden && f.dormant <= 0 && f.intensity >= 0.6).length >= 6
  const hidden = fires.some((f) => f.hidden && f.dormant <= 0)
  const dormant = fires.some((f) => f.dormant > 0)
  const fast = fires.some((f) => !f.hidden && f.spreadRate >= 0.6)
  const src = fires.reduce((a, b) => (b.intensity >= a.intensity ? b : a)).sourceInv

  if (selfOx)
    return {
      severity: 'danger',
      title: 'SELF-OXIDIZING FIRE — Mir-1997 class',
      lines: [
        'The chemical O₂ generator carries its own oxidizer — cutting ventilation will NOT starve it.',
        'Mir-23/24 protocol: isolate the sector, masks on crew, water-cool until the candle is spent.',
        'Every knock-down leaves a re-igniting pocket — treat dormant tiles as live ordnance.',
      ],
      mitigations: mitigationList(state, ['firemans-air-tanks', 'fire-attire']),
      ref: 'Mir-23/24 incident reports · Burrough, Dragonfly',
    }

  if (flash)
    return {
      severity: 'danger',
      title: 'FLASHOVER — enriched-atmosphere regime (Apollo 1 class)',
      lines: [
        `Multiple tiles at flash intensity — at enriched O₂, ${src} turns a spark into a cabin-wide event.`,
        'Apollo 204 Review Board: in pressurized O₂, materials marginal at sea level ignite and spread in seconds.',
        'Priority is crew survival and sector isolation — a fire line cannot hold a flashover.',
      ],
      mitigations: mitigationList(state, ['fire-attire', 'firemans-air-tanks']),
      ref: 'Apollo 204 Review Board · NASA 1967',
    }

  if (hidden)
    return {
      severity: 'warn',
      title: 'INVISIBLE COOL-FLAME COMBUSTION — FLEX regime',
      lines: [
        'Second-stage cool flames (~600 K) emit almost no visible light — crew and cameras miss them.',
        'FLEX/PSI-39 recorded cool-flame burning persisting for tens of seconds after hot-flame extinction.',
        `Source: ${src} — re-ignition risk while any O₂ diffusion path remains open.`,
      ],
      mitigations: mitigationList(state, ['fire-detector', 'firemans-air-tanks']),
      ref: 'FLEX / FLEX-2 · NASA PSI-39',
    }

  if (dormant)
    return {
      severity: 'warn',
      title: 'DORMANT SMOLDER — re-ignition window open',
      lines: [
        'Smoldering material sits below the visible-flame threshold but keeps an ember kernel alive.',
        'BASS-II/SoFIE solid fuels re-flash when convective cooling drops or O₂ creeps back up.',
        'Keep the sector watched — the tile will announce itself only when it flashes back.',
      ],
      mitigations: mitigationList(state, ['fire-detector', 'firemans-air-tanks']),
      ref: 'BASS-II / SoFIE · NASA PSI',
    }

  if (fast)
    return {
      severity: 'danger',
      title: 'FORCED-FLOW SPREAD — SAFFIRE regime',
      lines: [
        `Flame propagation is riding the ventilation vector — ${src} spreads at forced-flow speed.`,
        'SAFFIRE I–VI measured 5–25 cm/s over SIBAL/panel samples; cutting flow is the fastest lever.',
        'Crew on the fire line are exposed — flame outruns an engineer in open duct tiles.',
      ],
      mitigations: mitigationList(state, ['firemans-air-tanks', 'fire-attire']),
      ref: 'Saffire I–VI · NASA PSI',
    }

  return {
    severity: 'danger',
    title: 'OPEN FLAME — standard knock-down',
    lines: [
      `Visible flame from ${src} — engineers will converge on the nearest tiles automatically.`,
      'SoFIE showed µg flames persist on less oxygen than Earth norms expect — do not assume self-extinction.',
      'Watch adjacent modules: the outline pulse marks contagion range.',
    ],
    mitigations: mitigationList(state, ['firemans-air-tanks', 'fire-attire', 'fire-detector']),
    ref: 'NASA PSI consolidated sheet',
  }
}
