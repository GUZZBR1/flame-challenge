import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'
import type { Engine } from '../game/engine'
import { crewAt } from '../game/engine'
import { GRID_H, GRID_W } from '../game/config'
import { screenToIso } from '../game/iso'
import { createWorld, type WorldUI } from './world'
import { roomAt } from '../game/fire'
import type { Rect, RoomType } from '../game/types'

export interface Selection {
  kind: 'room' | 'crew'
  id: number
}

interface Props {
  engine: Engine
  mode: 'inspect' | RoomType
  selection: Selection | null
  onSelect: (s: Selection | null) => void
  onExitBuild: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export default function WorldView({ engine, mode, selection, onSelect, onExitBuild }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const ctl = useRef({ mode, selection, onSelect, onExitBuild })
  ctl.current = { mode, selection, onSelect, onExitBuild }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let cleanup: (() => void) | null = null

    const ui: WorldUI = { ghost: null, hover: null, selection: null }
    const cam = { x: 0, y: 0, scale: 0.85 }

    async function boot() {
      const app = new Application()
      await app.init({ resizeTo: host!, background: 0x04060c, antialias: true })
      if (cancelled) {
        app.destroy(true)
        return
      }
      host!.appendChild(app.canvas)

      const world = createWorld(app, engine, ui)
      app.stage.addChild(world.root)

      const applyCam = () => {
        world.root.position.set(cam.x, cam.y)
        world.root.scale.set(cam.scale)
      }
      const fitCam = () => {
        cam.scale = clamp(Math.min(host!.clientWidth / 2100, host!.clientHeight / 1250), 0.4, 0.95)
        cam.x = host!.clientWidth / 2
        cam.y = host!.clientHeight * 0.16 - 96 * cam.scale
        applyCam()
      }
      fitCam()

      const toLocal = (e: PointerEvent | WheelEvent) => {
        const r = app.canvas.getBoundingClientRect()
        return { x: e.clientX - r.left, y: e.clientY - r.top }
      }
      const toTile = (e: PointerEvent | WheelEvent) => {
        const l = toLocal(e)
        const wx = (l.x - cam.x) / cam.scale
        const wy = (l.y - cam.y) / cam.scale
        const t = screenToIso(wx, wy)
        return { x: Math.floor(t.x), y: Math.floor(t.y) }
      }

      // ---------- input ----------
      let panning = false
      let panLast = { x: 0, y: 0 }
      let dragStart: { x: number; y: number } | null = null
      let downPos = { x: 0, y: 0 }
      let moved = false

      const normRect = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
        x: Math.max(0, Math.min(a.x, b.x)),
        y: Math.max(0, Math.min(a.y, b.y)),
        w: Math.min(GRID_W, Math.max(a.x, b.x) + 1) - Math.max(0, Math.min(a.x, b.x)),
        h: Math.min(GRID_H, Math.max(a.y, b.y) + 1) - Math.max(0, Math.min(a.y, b.y)),
      })

      const onDown = (e: PointerEvent) => {
        if (e.button === 1 || e.button === 2) {
          if (e.button === 2 && ctl.current.mode !== 'inspect') {
            ctl.current.onExitBuild()
            return
          }
          panning = true
          panLast = toLocal(e)
          app.canvas.setPointerCapture(e.pointerId)
          return
        }
        if (e.button !== 0) return
        downPos = toLocal(e)
        moved = false
        if (ctl.current.mode !== 'inspect') {
          dragStart = toTile(e)
        } else {
          panning = true
          panLast = downPos
          app.canvas.setPointerCapture(e.pointerId)
        }
      }

      const onMove = (e: PointerEvent) => {
        const l = toLocal(e)
        if (Math.hypot(l.x - downPos.x, l.y - downPos.y) > 7) moved = true
        const t = toTile(e)
        ui.hover = t.x >= 0 && t.y >= 0 && t.x < GRID_W && t.y < GRID_H ? t : null
        if (dragStart) {
          const rect = normRect(dragStart, t)
          ui.ghost = { rect, ok: engine.canPlace(ctl.current.mode as RoomType, rect).ok }
        }
        if (panning) {
          cam.x += l.x - panLast.x
          cam.y += l.y - panLast.y
          panLast = l
          applyCam()
        }
      }

      const onUp = (e: PointerEvent) => {
        if (panning) {
          panning = false
          try {
            app.canvas.releasePointerCapture(e.pointerId)
          } catch {
            /* noop */
          }
          if (moved) return
        }
        if (e.button !== 0) return
        if (dragStart) {
          const rect = normRect(dragStart, toTile(e))
          dragStart = null
          ui.ghost = null
          if (engine.placeRoom(ctl.current.mode as RoomType, rect)) {
            ctl.current.onExitBuild()
          }
          return
        }
        if (moved) return
        // click-select: crew first, then room
        const t = toTile(e)
        const c = crewAt(engine.state, t.x + 0.5, t.y + 0.5)
        if (c) {
          ctl.current.onSelect({ kind: 'crew', id: c.id })
          return
        }
        const room = roomAt(engine.state, t.x, t.y)
        ctl.current.onSelect(room ? { kind: 'room', id: room.id } : null)
      }

      const onLeave = () => {
        ui.hover = null
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const l = toLocal(e)
        const f = e.deltaY < 0 ? 1.12 : 1 / 1.12
        const ns = clamp(cam.scale * f, 0.35, 2.2)
        const wx = (l.x - cam.x) / cam.scale
        const wy = (l.y - cam.y) / cam.scale
        cam.scale = ns
        cam.x = l.x - wx * ns
        cam.y = l.y - wy * ns
        applyCam()
      }
      const onCtx = (e: Event) => e.preventDefault()

      app.canvas.addEventListener('pointerdown', onDown)
      app.canvas.addEventListener('pointermove', onMove)
      app.canvas.addEventListener('pointerup', onUp)
      app.canvas.addEventListener('pointerleave', onLeave)
      app.canvas.addEventListener('wheel', onWheel, { passive: false })
      app.canvas.addEventListener('contextmenu', onCtx)
      const onResize = () => fitCam()
      const ro = new ResizeObserver(onResize)
      ro.observe(host!)

      const tickFn = (tk: { deltaMS: number }) => {
        const dt = tk.deltaMS / 1000
        engine.step(Math.min(dt, 0.1))
        ui.selection = ctl.current.selection
        world.tick(dt)
      }
      app.ticker.add(tickFn)

      cleanup = () => {
        ro.disconnect()
        app.canvas.removeEventListener('pointerdown', onDown)
        app.canvas.removeEventListener('pointermove', onMove)
        app.canvas.removeEventListener('pointerup', onUp)
        app.canvas.removeEventListener('pointerleave', onLeave)
        app.canvas.removeEventListener('wheel', onWheel)
        app.canvas.removeEventListener('contextmenu', onCtx)
        app.destroy(true, { children: true })
      }
    }

    void boot()
    return () => {
      cancelled = true
      cleanup?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  return <div ref={hostRef} className="absolute inset-0 overflow-hidden" />
}
