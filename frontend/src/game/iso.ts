import { TILE_W, TILE_H } from './config'
import type { Vec } from './types'

/** tile coords → screen px (diamond center of tile x,y) */
export function isoToScreen(x: number, y: number): Vec {
  return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 }
}

/** screen px → tile coords (float; floor for tile index) */
export function screenToIso(sx: number, sy: number): Vec {
  const x = sx / (TILE_W / 2)
  const y = sy / (TILE_H / 2)
  return { x: (x + y) / 2, y: (y - x) / 2 }
}
