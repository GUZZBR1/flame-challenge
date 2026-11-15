/**
 * Hero backdrop — isometric thermal mesh + starfield, canvas 2D.
 *
 * Mesh: CELLS_W×CELLS_H quads spanning min(vw*0.85,1300) × vh*0.55.
 * Vertex heights come from the harmonic wave field plus a gaussian
 * "ignition" bump that lerps toward the cursor — the ridge under the
 * mouse literally heats to red. Vertex z is evaluated once per frame
 * into a grid (corners shared by 4 cells) and cells paint back→front.
 *
 * Color: continuous thermal ramp teal-green (cold) → yellow → orange →
 * red (ignition), hue lerping 168°→4° by normalized elevation.
 *
 * Resize fix kept: redraws at the current wave time (was drawWave(0)).
 * Projection scales are derived from the mesh rect, not raw viewport,
 * so ultrawide/mobile resizes never anamorphically distort the iso.
 */
import { useEffect, useRef } from 'react'

const CELLS_W = 64
const CELLS_H = 38
const EXTENT = 3
const VW = CELLS_W + 1
const VH = CELLS_H + 1
const N_VERT = VW * VH

// painter order is static — sort once (back→front by iso depth i+j)
const CELL_ORDER = Array.from({ length: CELLS_W * CELLS_H }, (_, i) => {
  const cx = i % CELLS_W
  const cy = (i / CELLS_W) | 0
  return [cx + cy, i] as const
})
  .sort((a, b) => a[0] - b[0])
  .map(([, i]) => i)

const STEP_X = (EXTENT * 2) / CELLS_W
const STEP_Y = (EXTENT * 2) / CELLS_H

// fillStyle LUT — 257 quantized thermal-ramp strings, so the cell loop
// assigns a cached string instead of formatting one per quad per frame
const FILL_LUT = (() => {
  const out: string[] = []
  for (let i = 0; i <= 256; i++) {
    const level = i / 256
    const hue = 168 - 164 * level
    const sat = 76 + level * 10
    const lit = 30 + level * 14
    out[i] = `hsla(${hue.toFixed(2)}, ${sat.toFixed(1)}%, ${lit.toFixed(1)}%, .92)`
  }
  return out
})()

export default function HeroCanvas() {
  const starsRef = useRef<HTMLCanvasElement>(null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const starsCanvas = starsRef.current
    const waveCanvas = waveRef.current
    if (!host || !starsCanvas || !waveCanvas) return
    const stars = starsCanvas.getContext('2d')!
    const wave = waveCanvas.getContext('2d')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')

    let width = 0
    let height = 0
    let pixelRatio = 1
    let frame = 0
    let waveTime = 0

    // mesh rect in canvas pixels (CSS px after DPR transform)
    let meshW = 0
    let meshH = 0
    let meshCX = 0
    let meshCY = 0
    let kx = 1
    let ky = 1
    let kz = 1
    let cyBase = 0

    const zGrid = new Float32Array(N_VERT)
    // the wave field is separable — z = A(t)·sin(fx·x)cos(gy·y) terms —
    // so each frame evaluates trig once per row/column (~200 calls)
    // instead of four times per vertex (~10,400)
    const s1x = new Float32Array(VW)
    const s2x = new Float32Array(VW)
    const c1y = new Float32Array(VH)
    const c2y = new Float32Array(VH)
    const pointer = { sx: -9999, sy: -9999 }
    const mouse = { x: 0, y: 0 }
    let hasPointer = false

    const toWorld = (sx: number, sy: number): [number, number] => {
      const a = (sx - meshCX) / kx // = x - y
      const b = (sy - cyBase) / ky // = x + y
      return [(a + b) / 2, (b - a) / 2]
    }

    function onPointerMove(e: PointerEvent) {
      const rect = waveCanvas!.getBoundingClientRect()
      pointer.sx = e.clientX - rect.left
      pointer.sy = e.clientY - rect.top
      hasPointer = true
    }

    function project(x: number, y: number, z: number): [number, number] {
      return [meshCX + (x - y) * kx, cyBase + (x + y) * ky - z * kz]
    }

    function drawStars() {
      stars.clearRect(0, 0, width, height)
      for (let i = 0; i < 145; i++) {
        const x = ((Math.sin(i * 127.1 + 1) * 43758.5453) % 1 + 1) % 1
        const y = ((Math.sin(i * 311.7 + 2) * 96453.132) % 1 + 1) % 1
        stars.fillStyle = `rgba(195,218,236,${0.16 + (i % 5) * 0.1})`
        stars.beginPath()
        stars.arc(x * width, y * height, i % 11 === 0 ? 1.2 : 0.6, 0, Math.PI * 2)
        stars.fill()
      }
    }

    function vertexHeightNoPointer(ix: number, iy: number): number {
      // Stylized mathematical wave for the hero; it is illustrative, not experimental data.
      return 0.78 * s1x[ix] * c1y[iy] + 0.28 * s2x[ix] * c2y[iy]
    }

    function drawWave(time: number) {
      wave.clearRect(0, 0, width, height)

      // 1) separable terms — one trig pass per axis, then vertex heights
      //    are pure multiplies (the cursor bump reuses the same grid)
      for (let ix = 0; ix < VW; ix++) {
        const x = -EXTENT + ix * STEP_X
        s1x[ix] = Math.sin(x * 1.18 + time)
        s2x[ix] = Math.sin(x * 2.05 - time * 0.68)
      }
      for (let iy = 0; iy < VH; iy++) {
        const y = -EXTENT + iy * STEP_Y
        c1y[iy] = Math.cos(y * 1.04 - time * 0.72)
        c2y[iy] = Math.cos(y * 1.55 + time * 0.8)
      }
      let v = 0
      for (let iy = 0; iy < VH; iy++) {
        for (let ix = 0; ix < VW; ix++, v++) {
          zGrid[v] = vertexHeightNoPointer(ix, iy)
        }
      }
      if (hasPointer) {
        // gaussian ignition bump where the cursor is — lerped for smoothness
        v = 0
        for (let iy = 0; iy < VH; iy++) {
          const y = -EXTENT + iy * STEP_Y
          const dy = y - mouse.y
          for (let ix = 0; ix < VW; ix++, v++) {
            const x = -EXTENT + ix * STEP_X
            const dx = x - mouse.x
            zGrid[v] +=
              1.45 * Math.exp(-(dx * dx + dy * dy) / (2 * 0.82 * 0.82))
          }
        }
      }

      // 2) cells back→front, flat-shaded quads with thermal color.
      //    fills need per-cell colors; the hairline grid is one Path2D
      //    stroked once at the end (was: 2,432 stroke() calls/frame)
      const stepX = STEP_X
      const stepY = STEP_Y
      const strokePath = new Path2D()
      for (const ci of CELL_ORDER) {
        const cx = ci % CELLS_W
        const cy = (ci / CELLS_W) | 0
        const i0 = cy * VW + cx
        const z0 = zGrid[i0]
        const z1 = zGrid[i0 + 1]
        const z2 = zGrid[i0 + 1 + VW]
        const z3 = zGrid[i0 + VW]
        const x0 = -EXTENT + cx * stepX
        const y0 = -EXTENT + cy * stepY
        const p0 = project(x0, y0, z0)
        const p1 = project(x0 + stepX, y0, z1)
        const p2 = project(x0 + stepX, y0 + stepY, z2)
        const p3 = project(x0, y0 + stepY, z3)
        const avgZ = (z0 + z1 + z2 + z3) / 4
        // map the wave field to the thermal ramp: crests ignite red,
        // troughs stay deep teal (matches the original hero.js mapping)
        const level = Math.max(0, Math.min(1, (avgZ + 1.05) / 2.1))
        wave.beginPath()
        wave.moveTo(p0[0], p0[1])
        wave.lineTo(p1[0], p1[1])
        wave.lineTo(p2[0], p2[1])
        wave.lineTo(p3[0], p3[1])
        wave.closePath()
        wave.fillStyle = FILL_LUT[(level * 256) | 0]
        wave.fill()
        strokePath.moveTo(p0[0], p0[1])
        strokePath.lineTo(p1[0], p1[1])
        strokePath.lineTo(p2[0], p2[1])
        strokePath.lineTo(p3[0], p3[1])
        strokePath.closePath()
      }
      wave.strokeStyle = 'rgba(235,255,244,.16)'
      wave.lineWidth = 0.6
      wave.stroke(strokePath)
    }

    function resize() {
      const bounds = host!.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      pixelRatio = Math.min(devicePixelRatio || 1, 2)
      for (const canvas of [starsCanvas!, waveCanvas!]) {
        canvas.width = Math.round(width * pixelRatio)
        canvas.height = Math.round(height * pixelRatio)
        canvas.getContext('2d')!.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      }

      // mesh geometry — 85% of viewport width (max 1300px), 55% of height
      meshW = Math.min(width * 0.85, 1300)
      meshH = height * 0.55
      meshCX = width / 2
      meshCY = height * 0.6
      // near-uniform iso scale → no anamorphic distortion on ultrawide
      kx = meshW * 0.075
      ky = meshH * 0.052
      kz = meshH * 0.16
      cyBase = meshCY

      drawStars()
      drawWave(waveTime)
    }

    function animate(now: number) {
      waveTime = now * 0.00009

      // lerp cursor → world coords (smooth follow, ~12%/frame)
      if (hasPointer) {
        const [wx, wy] = toWorld(pointer.sx, pointer.sy)
        mouse.x += (wx - mouse.x) * 0.12
        mouse.y += (wy - mouse.y) * 0.12
      }
      drawWave(waveTime)
      if (!reduced.matches) frame = requestAnimationFrame(animate)
    }

    function start() {
      cancelAnimationFrame(frame)
      if (reduced.matches) drawWave(waveTime)
      else if (onScreen) frame = requestAnimationFrame(animate)
    }

    // the hero only renders while the section is on screen — scrolling
    // past it stops the wave loop entirely instead of drawing off-screen
    let onScreen = true
    const visibility = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        if (onScreen) start()
        else cancelAnimationFrame(frame)
      },
      { threshold: 0 },
    )
    visibility.observe(host)

    resize()
    start()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    reduced.addEventListener('change', start)
    // listen on the hero section — the canvases are pointer-events:none
    const scope = host.closest('section') ?? host
    scope.addEventListener('pointermove', onPointerMove)
    const onPointerLeave = () => {
      hasPointer = false
    }
    scope.addEventListener('pointerleave', onPointerLeave)
    return () => {
      visibility.disconnect()
      observer.disconnect()
      reduced.removeEventListener('change', start)
      scope.removeEventListener('pointermove', onPointerMove)
      scope.removeEventListener('pointerleave', onPointerLeave)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
      <canvas
        ref={starsRef}
        className="absolute inset-0 h-full w-full opacity-0 transition-opacity duration-500 dark:opacity-100"
      />
      <canvas
        ref={waveRef}
        className="heat-surface absolute inset-0 h-full w-full cursor-crosshair [animation:reveal-surfaces_3.4s_.25s_ease-out_both]"
      />
    </div>
  )
}
