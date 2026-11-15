import { useEffect, useMemo, useRef, useState } from 'react'
import { getBrainRecords, type BrainRecord } from '../lib/brain'
import { INV_BY_ID } from '../lib/dashboard'
import { navigate } from '../lib/scroll'
import { IconArrowLeft } from './Icons'
import Button from './ui/Button'

/** 3D ASCII Cortex — the copilot's living brain.
 *  A rotating 3D ASCII point cloud and neural lattice with distinct cortical lobes:
 *  - Frontal Lobe (Flammability reasoning)
 *  - Parietal Lobe (Fire spread mapping)
 *  - Temporal Lobe (Auditory & flame detection)
 *  - Occipital Lobe (Suppression & extinction)
 *  - Cerebellum & Brainstem (Duct-flow & partial-gravity dynamics)
 *
 *  Dynamically illuminates and pulses in real time according to SI states:
 *  - IDLE: Calm isometric rotation, slow synaptic respiration, emerald/cyan phosphor.
 *  - LISTENING: Front-facing focus, temporal/auditory lobe acoustic wave harmonics.
 *  - THINKING: High-frequency synaptic discharges, accelerated stochastic rotation, technical glyph flares.
 *  - SPEAKING: Rhythmic expansion, Broca/speech center ember shockwaves radiating through the tissue.
 */

export type SiState = 'idle' | 'listening' | 'thinking' | 'speaking'

const TAU = Math.PI * 2
const RAMP = ' .·:;=+*x%#@'
const GLYPHS_THINK = ' .·:;/\\*+x%&#@'

interface Point3D {
  x: number
  y: number
  z: number
  region: string
  isSurface: boolean
  lobeWeight: number
}

interface LobeDef {
  name: string
  label: string
  cx: number
  cy: number
  cz: number
  r: number
  color: string
}

const LOBES: Record<string, LobeDef> = {
  flammability: { name: 'flammability', label: 'Frontal (Flammability)', cx: 0, cy: 0.22, cz: 0.52, r: 0.44, color: '#ff8a50' },
  spread: { name: 'spread', label: 'Parietal (Spread Dynamics)', cx: 0, cy: 0.38, cz: -0.12, r: 0.42, color: '#49b8d6' },
  detection: { name: 'detection', label: 'Temporal (Acoustics & Detection)', cx: 0.58, cy: -0.16, cz: 0.08, r: 0.38, color: '#7fe3ff' },
  suppression: { name: 'suppression', label: 'Occipital (Suppression)', cx: 0, cy: 0.05, cz: -0.62, r: 0.38, color: '#a580ff' },
  'duct-flow': { name: 'duct-flow', label: 'Cerebellum (Duct Flow)', cx: 0, cy: -0.48, cz: -0.46, r: 0.34, color: '#52d9a6' },
  'partial-gravity': { name: 'partial-gravity', label: 'Brainstem (Partial Gravity)', cx: 0, cy: -0.82, cz: -0.28, r: 0.25, color: '#e6c86e' },
  default: { name: 'default', label: 'Cerebral Cortex', cx: 0, cy: 0.1, cz: 0, r: 0.55, color: '#49b8d6' },
}

function classifyLobe(x: number, y: number, z: number): string {
  if (y < -0.42) {
    if (Math.abs(x) < 0.22 && y < -0.62) return 'partial-gravity'
    return 'duct-flow'
  }
  if (z > 0.22 && y > -0.22) return 'flammability'
  if (z <= 0.22 && z > -0.35 && y > 0.08) return 'spread'
  if (z <= -0.35 && y > -0.28) return 'suppression'
  if (Math.abs(x) > 0.35 && y <= 0.12 && z > -0.38) return 'detection'
  return 'default'
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Generate a dense 3D anatomical brain point cloud with cortical folds and hemispheres */
function generateBrainModel(): Point3D[] {
  const points: Point3D[] = []

  // 1. Cerebral hemispheres (left & right)
  const stepsLat = 28
  const stepsLon = 38

  for (let hemi of [-1, 1]) {
    for (let i = 0; i <= stepsLat; i++) {
      const v = (i / stepsLat) * Math.PI - Math.PI / 2
      for (let j = 0; j < stepsLon; j++) {
        const u = (j / stepsLon) * Math.PI
        const su = Math.sin(u)
        const cv = Math.cos(v)
        const sv = Math.sin(v)

        // Base ellipsoid dimensions
        let rx = 0.58
        let ry = 0.52
        let rz = 0.78

        // Taper frontal and occipital poles
        if (cv * su < -0.3) {
          rx *= 0.88
          ry *= 0.92
        }

        let bx = hemi * (0.09 + Math.abs(su * cv) * rx)
        let by = sv * ry + 0.12 * Math.cos(u) * cv
        let bz = cv * su * rz

        // Longitudinal fissure depression
        const fissure = Math.exp(-Math.pow(bx / 0.15, 2)) * 0.08
        by -= fissure

        // Sylvian / temporal fissure indentation
        if (by < 0.05 && by > -0.35 && bz > -0.2 && bz < 0.4) {
          bx *= 1.08
          by -= 0.06
        }

        // Cortical folds / sulci ripple
        const folds =
          0.055 * Math.sin(8 * bx) * Math.cos(8 * by + 4 * bz) +
          0.035 * Math.sin(14 * by) * Math.sin(14 * bz)

        bx += bx * folds
        by += by * folds
        bz += bz * folds

        const region = classifyLobe(bx, by, bz)
        points.push({ x: bx, y: by, z: bz, region, isSurface: true, lobeWeight: 1 })
      }
    }
  }

  // 2. Cerebellum (posterior-inferior double mass)
  const cSteps = 16
  for (let ci = 0; ci < cSteps; ci++) {
    const v = (ci / cSteps) * Math.PI - Math.PI / 2
    for (let cj = 0; cj < cSteps * 2; cj++) {
      const u = (cj / (cSteps * 2)) * TAU
      const bx = 0.36 * Math.cos(u) * Math.cos(v)
      const by = -0.52 + 0.18 * Math.sin(v) + 0.03 * Math.sin(20 * v) // horizontal folia bands
      const bz = -0.48 + 0.28 * Math.sin(u) * Math.cos(v)
      points.push({ x: bx, y: by, z: bz, region: 'duct-flow', isSurface: true, lobeWeight: 0.9 })
    }
  }

  // 3. Brainstem column
  for (let bi = 0; bi < 12; bi++) {
    const yVal = -0.55 - (bi / 12) * 0.38
    const rad = 0.12 - (bi / 12) * 0.04
    for (let bj = 0; bj < 10; bj++) {
      const ang = (bj / 10) * TAU
      points.push({
        x: rad * Math.cos(ang),
        y: yVal,
        z: -0.26 + rad * Math.sin(ang),
        region: 'partial-gravity',
        isSurface: true,
        lobeWeight: 0.85,
      })
    }
  }

  // 4. Deep white matter / internal nuclei lattice
  for (let k = 0; k < 180; k++) {
    const r = Math.pow(Math.random(), 0.6) * 0.42
    const theta = Math.random() * TAU
    const phi = (Math.random() - 0.5) * Math.PI
    const x = r * Math.cos(phi) * Math.sin(theta) + (Math.random() > 0.5 ? 0.18 : -0.18)
    const y = r * Math.sin(phi) * 0.75 + 0.08
    const z = r * Math.cos(phi) * Math.cos(theta) * 1.1 - 0.05
    points.push({
      x,
      y,
      z,
      region: classifyLobe(x, y, z),
      isSurface: false,
      lobeWeight: 0.65,
    })
  }

  return points
}

interface Neuron3D {
  rec: BrainRecord
  x: number
  y: number
  z: number
  region: string
  phase: number
  screenX: number
  screenY: number
  depth: number
}

function positionNeuron3D(rec: BrainRecord): { x: number; y: number; z: number; region: string } {
  const region = rec.themes[0] ?? 'default'
  const lobe = LOBES[region] ?? LOBES.default
  const h = hashStr(rec.key)

  const hemi = ((h % 2) === 0 ? 1 : -1)
  const angle = ((h % 628) / 100)
  const elev = (((h >>> 7) % 200) / 100 - 1) * 0.4
  const radius = lobe.r * (0.65 + (((h >>> 12) % 100) / 100) * 0.35)

  let x = lobe.cx + hemi * (Math.abs(Math.cos(angle)) * radius + 0.08)
  let y = lobe.cy + elev * radius
  let z = lobe.cz + Math.sin(angle) * radius * 0.9

  return { x, y, z, region }
}

interface WavePulse {
  ox: number
  oy: number
  oz: number
  t0: number
  speed: number
  accent: boolean
  maxRadius: number
}

export default function AsciiBrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const [records, setRecords] = useState<BrainRecord[]>(() => getBrainRecords())
  const [siState, setSiState] = useState<SiState>('idle')
  const [focus, setFocus] = useState<string | null>(null)
  const [hover, setHover] = useState<Neuron3D | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)

  // 3D camera & rotation physics
  const rotRef = useRef({ yaw: 0.45, pitch: 0.22, zoom: 1 })
  const targetRotRef = useRef({ yaw: 0.45, pitch: 0.22, zoom: 1 })
  const dragRef = useRef<{ isDown: boolean; lastX: number; lastY: number }>({ isDown: false, lastX: 0, lastY: 0 })

  const neuronsRef = useRef<Neuron3D[]>([])
  const pulsesRef = useRef<WavePulse[]>([])
  const focusRef = useRef<string | null>(null)
  const hoverRef = useRef<Neuron3D | null>(null)
  const siStateRef = useRef<SiState>(siState)

  focusRef.current = focus
  hoverRef.current = hover
  siStateRef.current = siState

  const brainModel = useMemo(() => generateBrainModel(), [])

  // Listen to external SI assistant state broadcasts
  useEffect(() => {
    const onSiState = (e: Event) => {
      const detail = (e as CustomEvent<{ state?: SiState }>).detail
      if (detail?.state) {
        setSiState(detail.state)
      }
    }
    const onBrain = () => setRecords(getBrainRecords())

    window.addEventListener('ignis:si-state', onSiState)
    window.addEventListener('ignis:brain', onBrain)

    return () => {
      window.removeEventListener('ignis:si-state', onSiState)
      window.removeEventListener('ignis:brain', onBrain)
    }
  }, [])

  // Position neuron nodes in 3D when records update
  useEffect(() => {
    neuronsRef.current = records.map((rec) => {
      const pos = positionNeuron3D(rec)
      return {
        rec,
        ...pos,
        phase: (hashStr(rec.key) % 628) / 100,
        screenX: 0,
        screenY: 0,
        depth: 0,
      }
    })

    // Trigger learning shockwave from latest records
    const now = performance.now()
    for (const n of neuronsRef.current) {
      if (Date.now() - n.rec.lastTs < 2000) {
        pulsesRef.current.push({
          ox: n.x,
          oy: n.y,
          oz: n.z,
          t0: now,
          speed: 0.8,
          accent: true,
          maxRadius: 1.4,
        })
      }
    }
  }, [records])

  // Periodic autonomous synaptic pulses based on SI state
  useEffect(() => {
    const timer = setInterval(() => {
      const state = siStateRef.current
      const now = performance.now()

      if (state === 'speaking') {
        const broca = LOBES.detection
        pulsesRef.current.push({
          ox: broca.cx,
          oy: broca.cy,
          oz: broca.cz,
          t0: now,
          speed: 1.1,
          accent: true,
          maxRadius: 1.8,
        })
      } else if (state === 'thinking') {
        const lobes = [LOBES.flammability, LOBES.spread, LOBES.suppression]
        const pick = lobes[Math.floor(Math.random() * lobes.length)]
        pulsesRef.current.push({
          ox: pick.cx + (Math.random() - 0.5) * 0.3,
          oy: pick.cy + (Math.random() - 0.5) * 0.3,
          oz: pick.cz + (Math.random() - 0.5) * 0.3,
          t0: now,
          speed: 1.4,
          accent: true,
          maxRadius: 1.2,
        })
      } else if (state === 'listening') {
        const pick = LOBES.detection
        pulsesRef.current.push({
          ox: (Math.random() > 0.5 ? 1 : -1) * pick.cx,
          oy: pick.cy,
          oz: pick.cz,
          t0: now,
          speed: 0.7,
          accent: true,
          maxRadius: 1.5,
        })
      } else if (Math.random() < 0.35 && neuronsRef.current.length) {
        const n = neuronsRef.current[Math.floor(Math.random() * neuronsRef.current.length)]
        pulsesRef.current.push({
          ox: n.x,
          oy: n.y,
          oz: n.z,
          t0: now,
          speed: 0.6,
          accent: false,
          maxRadius: 1.0,
        })
      }
    }, 700)

    return () => clearInterval(timer)
  }, [])

  // 3D ASCII Render Loop
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    // ASCII terminal grid resolution
    const COLS = 86
    const ROWS = 38
    const zBuffer = new Float32Array(COLS * ROWS)
    const energyBuf = new Float32Array(COLS * ROWS)
    const hotBuf = new Uint8Array(COLS * ROWS)
    const regionBuf = Array.from({ length: COLS * ROWS }, () => '')

    const draw = (timeMs: number) => {
      const avail = cv.parentElement?.clientWidth ?? 680
      const stageH = cv.parentElement?.clientHeight ?? 600
      const fs = Math.max(10, Math.min(avail / (COLS * 0.62), stageH / (ROWS * 1.15), 24))
      const cellW = fs * 0.6
      const cellH = fs * 1.14
      const cssW = COLS * cellW
      const cssH = ROWS * cellH
      const dpr = Math.min(devicePixelRatio || 1, 2)

      if (cv.style.width !== `${cssW}px`) cv.style.width = `${cssW}px`
      if (cv.style.height !== `${cssH}px`) cv.style.height = `${cssH}px`
      if (cv.width !== Math.round(cssW * dpr)) cv.width = Math.round(cssW * dpr)
      if (cv.height !== Math.round(cssH * dpr)) cv.height = Math.round(cssH * dpr)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cssW, cssH)
      ctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const state = siStateRef.current
      const focusedRegion = focusRef.current
      const hoveredNeuron = hoverRef.current
      const t = timeMs / 1000

      // Automated rotation velocity based on SI state
      if (!dragRef.current.isDown && !reduced) {
        if (state === 'thinking') {
          targetRotRef.current.yaw += 0.024
          targetRotRef.current.pitch = 0.2 + 0.12 * Math.sin(t * 3.5)
        } else if (state === 'listening') {
          // Orient toward user for audio focus
          const delta = ((0 - targetRotRef.current.yaw) % TAU + TAU) % TAU
          targetRotRef.current.yaw += (delta > Math.PI ? delta - TAU : delta) * 0.05
          targetRotRef.current.pitch = 0.12 + 0.05 * Math.sin(t * 2.0)
        } else if (state === 'speaking') {
          targetRotRef.current.yaw += 0.012
          targetRotRef.current.pitch = 0.22 + 0.08 * Math.cos(t * 2.8)
        } else {
          // Idle ambient drift
          targetRotRef.current.yaw += 0.007
          targetRotRef.current.pitch = 0.22 + 0.06 * Math.sin(t * 1.1)
        }
      }

      // Smooth camera interpolation
      const rot = rotRef.current
      const targetRot = targetRotRef.current
      rot.yaw += (targetRot.yaw - rot.yaw) * 0.1
      rot.pitch += (targetRot.pitch - rot.pitch) * 0.1
      rot.zoom += (targetRot.zoom - rot.zoom) * 0.1

      // Clear 3D buffers
      zBuffer.fill(9999)
      energyBuf.fill(0)
      hotBuf.fill(0)
      regionBuf.fill('')

      const cosY = Math.cos(rot.yaw)
      const sinY = Math.sin(rot.yaw)
      const cosP = Math.cos(rot.pitch)
      const sinP = Math.sin(rot.pitch)

      const camDist = 3.2 / rot.zoom
      const scaleX = COLS * 0.44 * rot.zoom
      const scaleY = ROWS * 0.48 * rot.zoom

      // State dynamic pulse energy
      let stateAudioAmp = 0
      if (state === 'speaking') {
        stateAudioAmp = 0.35 + 0.25 * Math.sin(t * 18) * Math.sin(t * 7.5)
      } else if (state === 'listening') {
        stateAudioAmp = 0.2 + 0.15 * Math.sin(t * 12)
      }

      // Active expanding 3D shockwaves
      const pulses = pulsesRef.current
      for (let pi = pulses.length - 1; pi >= 0; pi--) {
        const p = pulses[pi]
        const age = (timeMs - p.t0) / 1000
        const radius = age * p.speed
        if (radius > p.maxRadius) {
          pulses.splice(pi, 1)
          continue
        }
      }

      // 1. Project 3D Brain Lattice Points
      for (let i = 0; i < brainModel.length; i++) {
        const pt = brainModel[i]

        // Dynamic speaking expansion & thinking jitter
        let px = pt.x
        let py = pt.y
        let pz = pt.z

        if (state === 'speaking' && pt.isSurface) {
          const expansion = 1 + stateAudioAmp * 0.08
          px *= expansion
          py *= expansion
          pz *= expansion
        } else if (state === 'thinking' && Math.random() < 0.03) {
          px += (Math.random() - 0.5) * 0.025
          py += (Math.random() - 0.5) * 0.025
          pz += (Math.random() - 0.5) * 0.025
        }

        // 3D Yaw rotation
        const x1 = px * cosY + pz * sinY
        const z1 = -px * sinY + pz * cosY

        // 3D Pitch tilt
        const y2 = py * cosP - z1 * sinP
        const z2 = py * sinP + z1 * cosP

        const factor = camDist / (camDist + z2)
        const col = Math.round(COLS / 2 + x1 * scaleX * factor)
        const row = Math.round(ROWS / 2 - y2 * scaleY * factor)

        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue
        const bufIdx = row * COLS + col

        if (z2 < zBuffer[bufIdx]) {
          zBuffer[bufIdx] = z2
          regionBuf[bufIdx] = pt.region

          // Depth normal & shading
          let baseEnergy = (1 - (z2 + 0.8) / 2.2) * 0.45
          if (pt.isSurface) baseEnergy += 0.25

          // Lobe specific illumination
          if (focusedRegion && pt.region !== focusedRegion) {
            baseEnergy *= 0.16
          } else if (focusedRegion && pt.region === focusedRegion) {
            baseEnergy *= 1.45
            hotBuf[bufIdx] = 1
          }

          // SI state activations
          if (state === 'listening' && pt.region === 'detection') {
            baseEnergy += 0.45 + 0.3 * Math.sin(t * 8 + py * 10)
            hotBuf[bufIdx] = 1
          } else if (state === 'thinking' && (pt.region === 'flammability' || pt.region === 'spread')) {
            baseEnergy += 0.5 + 0.4 * Math.sin(t * 14 + px * 12 + pz * 12)
            hotBuf[bufIdx] = 1
          } else if (state === 'speaking' && (pt.region === 'detection' || pt.region === 'flammability')) {
            baseEnergy += 0.4 + stateAudioAmp * 0.8
            hotBuf[bufIdx] = 1
          }

          // Check pulses passing this 3D coordinate
          for (let pi = 0; pi < pulses.length; pi++) {
            const p = pulses[pi]
            const age = (timeMs - p.t0) / 1000
            const curRad = age * p.speed
            const dist = Math.hypot(pt.x - p.ox, pt.y - p.oy, pt.z - p.oz)
            if (Math.abs(dist - curRad) < 0.14) {
              baseEnergy += (1 - Math.abs(dist - curRad) / 0.14) * 0.75
              hotBuf[bufIdx] = 1
            }
          }

          energyBuf[bufIdx] = baseEnergy
        }
      }

      // 2. Project 3D Neurons (Learned PSI Records)
      const neurons = neuronsRef.current
      for (let ni = 0; ni < neurons.length; ni++) {
        const n = neurons[ni]
        const nx1 = n.x * cosY + n.z * sinY
        const nz1 = -n.x * sinY + n.z * cosY
        const ny2 = n.y * cosP - nz1 * sinP
        const nz2 = n.y * sinP + nz1 * cosP

        const factor = camDist / (camDist + nz2)
        const col = Math.round(COLS / 2 + nx1 * scaleX * factor)
        const row = Math.round(ROWS / 2 - ny2 * scaleY * factor)

        n.screenX = col * cellW + cellW / 2
        n.screenY = row * cellH + cellH / 2
        n.depth = nz2

        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue

        const isHovered = hoveredNeuron === n

        // Synapse glow radius
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const c = col + dx
            const r = row + dy
            if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue
            const idx = r * COLS + c
            const nIntensity = isHovered ? 1.6 : 0.85 + 0.25 * Math.sin(t * 3.5 + n.phase)
            energyBuf[idx] += nIntensity * (dx === 0 && dy === 0 ? 1 : 0.45)
            hotBuf[idx] = 1
            zBuffer[idx] = Math.min(zBuffer[idx], nz2)
          }
        }
      }

      // 3. Render Characters to Canvas
      const inkColor = '#edf4fa'
      const accentColor = state === 'speaking' ? '#ff7e40' : state === 'listening' ? '#52e3c2' : '#49b8d6'

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = r * COLS + c
          if (zBuffer[idx] >= 9000) continue

          const e = energyBuf[idx]
          const isHot = hotBuf[idx] === 1

          const glyphSet = state === 'thinking' ? GLYPHS_THINK : RAMP
          const rampIdx = Math.max(1, Math.min(glyphSet.length - 1, Math.floor(e * glyphSet.length)))
          const char = glyphSet[rampIdx]

          ctx.fillStyle = isHot ? accentColor : inkColor
          ctx.globalAlpha = Math.max(0.18, Math.min(1, 0.35 + e * 0.65))
          ctx.fillText(char, (c + 0.5) * cellW, (r + 0.5) * cellH)
        }
      }
      ctx.globalAlpha = 1
    }

    let raf = 0
    let last = 0
    const loop = (timeMs: number) => {
      if (timeMs - last > 33) {
        draw(timeMs)
        last = timeMs
      }
      raf = requestAnimationFrame(loop)
    }

    if (reduced) {
      draw(performance.now())
    } else {
      raf = requestAnimationFrame(loop)
    }

    return () => cancelAnimationFrame(raf)
  }, [brainModel])

  // Mouse drag & tilt interaction
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { isDown: true, lastX: e.clientX, lastY: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current.isDown) {
      const dx = e.clientX - dragRef.current.lastX
      const dy = e.clientY - dragRef.current.lastY
      targetRotRef.current.yaw += dx * 0.008
      targetRotRef.current.pitch = Math.max(-0.6, Math.min(0.8, targetRotRef.current.pitch + dy * 0.008))
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY
    }

    // Neuron pick test
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    let closest: Neuron3D | null = null
    let minDist = 18

    for (const n of neuronsRef.current) {
      if (n.depth > 0.9) continue // occluded by back of brain
      const d = Math.hypot(n.screenX - mx, n.screenY - my)
      if (d < minDist) {
        minDist = d
        closest = n
      }
    }

    setHover(closest)
    setTip(closest ? { x: e.clientX, y: e.clientY } : null)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current.isDown = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const regions = useMemo(() => {
    const m = new Map<string, BrainRecord[]>()
    for (const r of records) {
      const k = r.themes[0] ?? 'default'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    return m
  }, [records])

  const focusRecs = focus ? (regions.get(focus) ?? []) : []
  const focusInv = focusRecs[0]?.investigationId
    ? INV_BY_ID.get(focusRecs[0].investigationId!)
    : null

  const stateColors: Record<SiState, string> = {
    idle: 'text-[var(--accent)] border-[var(--accent)]/30',
    listening: 'text-[#52e3c2] border-[#52e3c2]/40 shadow-[0_0_12px_rgba(82,227,194,0.3)]',
    thinking: 'text-[#49b8d6] border-[#49b8d6]/50 shadow-[0_0_12px_rgba(73,184,214,0.3)]',
    speaking: 'text-[#ff7e40] border-[#ff7e40]/40 shadow-[0_0_12px_rgba(255,126,64,0.3)]',
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Top telemetry & state bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] lowercase tracking-[0.16em] text-[var(--ink)]">
        <div className="flex items-center gap-2 opacity-75">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
          <span>
            {records.length
              ? `3D Cortex · ${records.length} records · ${regions.size} lobes active`
              : '3D Cortex · standing by for evidence records'}
          </span>
        </div>

        {/* Interactive SI State Selectors */}
        <div className="flex items-center gap-1.5">
          {(['idle', 'listening', 'thinking', 'speaking'] as SiState[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setSiState(st)
                window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: st } }))
              }}
              className={`rounded-full border px-2.5 py-0.5 text-[9.5px] font-semibold transition-all duration-200 ${
                siState === st
                  ? `${stateColors[st]} bg-white/10 dark:bg-black/20`
                  : 'border-transparent opacity-40 hover:opacity-80'
              }`}
            >
              ● {st}
            </button>
          ))}

          {focus && (
            <Button
              type="button"
              onClick={() => {
                setFocus(null)
                targetRotRef.current.zoom = 1
              }}
              variant="glass"
              size="sm"
              className="ml-2 h-7 px-3 text-[10px] lowercase"
            >
              <IconArrowLeft size={12} />
              reset view
            </Button>
          )}
        </div>
      </div>

      {/* 3D ASCII Canvas Stage */}
      <div className="brain-stage relative mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[var(--panel)]/40 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.2)]">
        <canvas
          ref={canvasRef}
          className="relative z-[1] mx-auto block cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => {
            if (hover) {
              setFocus(hover.region)
              targetRotRef.current.zoom = 1.35
            }
          }}
          role="img"
          aria-label="3D Rotating ASCII brain representing learned combustion evidence. Drag to rotate in 3D; click lobes to inspect."
        />

        {/* Subtle 3D rotation hint */}
        <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink)] opacity-35">
          [ 3D ORBIT · DRAG TO ROTATE · CLICK NEURON TO AUDIT ]
        </div>

        {/* Hover inspection tooltip */}
        {hover && tip && (
          <div
            className="pointer-events-none fixed z-50 rounded-xl border border-white/20 bg-[var(--panel)]/90 px-3 py-2 font-mono text-[10.5px] lowercase leading-relaxed text-[var(--ink)] shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-md"
            style={{
              left: Math.min(tip.x + 14, window.innerWidth - 260),
              top: tip.y - 12,
            }}
          >
            <div className="flex items-center gap-1.5 font-semibold text-[var(--accent)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span>{LOBES[hover.region]?.label ?? hover.region}</span>
            </div>
            <div className="mt-0.5 font-medium">{hover.rec.label}</div>
            {hover.rec.investigationId && (
              <div className="opacity-60 text-[9.5px]">inv: {hover.rec.investigationId}</div>
            )}
            <div className="mt-1 text-[9.5px] opacity-75">
              {hover.rec.fuel && `${hover.rec.fuel} · `}
              {hover.rec.detail} · ×{hover.rec.uses} fires
            </div>
          </div>
        )}
      </div>

      {/* Lobe audit inspector when focused */}
      {focus && (
        <div className="bubble-in mt-4 rounded-xl border border-white/10 bg-[var(--panel)]/50 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between font-mono text-[10.5px] lowercase tracking-[0.16em] text-[var(--ink)] opacity-70">
            <span>
              {LOBES[focus]?.label ?? focus} · {focusRecs.length} records wired
              {focusInv && ` · grounded in ${focusInv.id}`}
            </span>
          </div>
          <ul className="m-0 mt-3 grid list-none gap-x-6 gap-y-1.5 p-0 sm:grid-cols-2">
            {focusRecs.map((r) => (
              <li
                key={r.key}
                className="truncate font-mono text-[11px] lowercase text-[var(--ink)] opacity-85"
              >
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--link)] underline-offset-4 hover:underline"
                  >
                    {r.label}
                  </a>
                ) : (
                  <span>{r.label}</span>
                )}
                <span className="opacity-50">
                  {r.fuel ? ` · ${r.fuel}` : ''} · {r.detail} · ×{r.uses}
                </span>
              </li>
            ))}
          </ul>
          <a
            href="#psi-dataset"
            onClick={(e) => {
              e.preventDefault()
              navigate('#psi-dataset')
            }}
            className="mt-3 inline-block font-mono text-[10.5px] lowercase tracking-[0.14em] text-[var(--link)] underline-offset-4 hover:underline"
          >
            → audit all records in the physical sciences informatics dataset
          </a>
        </div>
      )}
    </div>
  )
}
