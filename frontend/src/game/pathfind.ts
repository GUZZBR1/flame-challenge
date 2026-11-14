import type { Vec } from './types'

const key = (x: number, y: number) => `${x},${y}`

/**
 * A* on a uniform 4-connected grid.
 * `walkable(x,y)` decides passability. Returns tile centers as waypoints,
 * or null when unreachable.
 */
export function findPath(
  from: Vec,
  to: Vec,
  walkable: (x: number, y: number) => boolean,
  maxX: number,
  maxY: number,
): Vec[] | null {
  const sx = Math.floor(from.x)
  const sy = Math.floor(from.y)
  const tx = Math.floor(to.x)
  const ty = Math.floor(to.y)
  if (sx === tx && sy === ty) return []
  if (!walkable(tx, ty)) return null

  const open = new Map<string, number>()
  const g = new Map<string, number>()
  const parent = new Map<string, string>()
  const h = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty)
  const start = key(sx, sy)
  g.set(start, 0)
  open.set(start, h(sx, sy))
  const closed = new Set<string>()

  while (open.size) {
    let bestK = ''
    let bestF = Infinity
    for (const [k, f] of open) {
      if (f < bestF) {
        bestF = f
        bestK = k
      }
    }
    open.delete(bestK)
    if (closed.has(bestK)) continue
    closed.add(bestK)
    const [cx, cy] = bestK.split(',').map(Number)
    if (cx === tx && cy === ty) {
      const path: Vec[] = []
      let k = bestK
      while (k !== start) {
        const [px, py] = k.split(',').map(Number)
        path.push({ x: px + 0.5, y: py + 0.5 })
        k = parent.get(k)!
      }
      return path.reverse()
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= maxX || ny >= maxY) continue
      if (!walkable(nx, ny)) continue
      const nk = key(nx, ny)
      if (closed.has(nk)) continue
      const ng = g.get(bestK)! + 1
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng)
        parent.set(nk, bestK)
        open.set(nk, ng + h(nx, ny))
      }
    }
  }
  return null
}
