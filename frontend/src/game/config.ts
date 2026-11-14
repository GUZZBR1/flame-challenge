import type { RoomType } from './types'

export const GRID_W = 30
export const GRID_H = 30

/** isometric tile pixel size */
export const TILE_W = 64
export const TILE_H = 32

export interface RoomSpec {
  label: string
  costPerTile: number
  minW: number
  minH: number
  buildSecPerTile: number
  color: number
  desc: string
}

export const ROOM_SPECS: Record<RoomType, RoomSpec> = {
  deck: {
    label: 'Deck Plating',
    costPerTile: 3,
    minW: 1,
    minH: 1,
    buildSecPerTile: 0.6,
    color: 0x2a3448,
    desc: 'Open deck structure. Walkway and expansion space.',
  },
  quarters: {
    label: 'Crew Quarters',
    costPerTile: 12,
    minW: 2,
    minH: 2,
    buildSecPerTile: 1.2,
    color: 0x3b4d63,
    desc: 'Bunks and life support. Crew rest and recover here.',
  },
  lab: {
    label: 'Analysis Lab',
    costPerTile: 16,
    minW: 3,
    minH: 2,
    buildSecPerTile: 1.6,
    color: 0x1d4e5f,
    desc: 'Scientists on duty generate a trickle of Science.',
  },
  combustion: {
    label: 'Combustion Chamber',
    costPerTile: 22,
    minW: 3,
    minH: 3,
    buildSecPerTile: 2.0,
    color: 0x5f3a1d,
    desc: 'Sealed rack for microgravity combustion experiments. Risk lives here.',
  },
  fab: {
    label: 'Fabrication Bay',
    costPerTile: 18,
    minW: 3,
    minH: 2,
    buildSecPerTile: 1.8,
    color: 0x4a3a63,
    desc: 'Turns Science + credits into ship sections.',
  },
  dock: {
    label: 'Docking Arm',
    costPerTile: 0,
    minW: 2,
    minH: 2,
    buildSecPerTile: 0,
    color: 0x35524a,
    desc: 'Crew and supply ships arrive here.',
  },
}

export const BALANCE = {
  startCredits: 900,
  startScience: 0,
  startSafety: 100,
  startCrew: { engineers: 2, scientists: 2 },
  hireCost: { engineer: 120, scientist: 150 },
  crewCap: 12,

  // experiments
  experimentDurationSec: 26,
  baseRiskPct: 6,
  riskPerO2AboveLOC: 2.1, // multiplied by (o2 - LOC)^1.35
  coolFlameHiddenChance: 0.65,
  smolderReigniteChance: 0.5,
  grantMilestone: 90, // science per grant
  grantAmount: 140,

  // fabrication
  fabCostScience: 40,
  fabCostCredits: 110,
  fabProgressPct: 11,
  fabDurationSec: 18,

  // fire
  fireGrowthSec: 5,
  fireFuelDeck: 0.5,
  fireFuelModule: 1.4,
  extinguishPerSec: 0.34,
  burnDmgPerSec: 22,

  // crew
  crewSpeedTps: 2.4,
  staminaDrainPerSec: 0.5,
  staminaRestPerSec: 6,
  healPerSec: 4,
  restThreshold: 28,

  // economy/events
  supplyEverySec: 80,
  supplyCredits: 85,
  safetyLossIncident: 9,
  safetyLossDeath: 18,
}

/** seeded RNG — mulberry32 */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
