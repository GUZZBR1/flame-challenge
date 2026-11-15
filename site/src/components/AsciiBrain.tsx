import { useEffect, useMemo, useRef, useState } from 'react'
import { getBrainRecords, type BrainRecord } from '../lib/brain'
import { INV_BY_ID } from '../lib/dashboard'
import { navigate } from '../lib/scroll'
import { IconArrowLeft } from './Icons'
import Button from './ui/Button'

/** 3D Professional ASCII Cortex — anatomical human brain rendering.
 *  Generates an anatomical 3D cerebral point-cloud with:
 *  - Left and right cerebral hemispheres divided by the longitudinal fissure
 *  - Multi-octave cortical gyri and sulci (convoluted folds)
 *  - Anatomical lobes: Frontal, Parietal, Temporal (with Sylvian fissure undercut), Occipital, Cerebellum, Brainstem
 *  - 3D Lambertian diffuse + Blinn-Phong specular + Fresnel rim lighting for true depth perception
 *  - Interactive 3D drag-to-orbit, hover/click neuron inspection
 *  - Zero background box: completely transparent canvas that blends into the page
 */

export type SiState = 'idle' | 'listening' | 'thinking' | 'speaking'

const TAU = Math.PI * 2
// Gradient from subtle shadow to intense specular glare
const RAMP = ' .·:;=+*x#%@'
const GLYPHS_THINK = ' .·:;/\\*+x%&#@'

interface Point3D {
  x: number
  y: number
  z: number
  nx: number
  ny: number
  nz: number
  region: string
  isSurface: boolean
  isFissure: boolean
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
  flammability: { name: 'flammability', label: 'Frontal Lobe (Flammability)', cx: 0, cy: 0.2, cz: 0.54, r: 0.45, color: '#ff8a50' },
  spread: { name: 'spread', label: 'Parietal Lobe (Fire Spread)', cx: 0, cy: 0.38, cz: -0.1, r: 0.44, color: '#49b8d6' },
  detection: { name: 'detection', label: 'Temporal Lobe (Acoustics & Sensors)', cx: 0.6, cy: -0.18, cz: 0.08, r: 0.38, color: '#68e2fa' },
  suppression: { name: 'suppression', label: 'Occipital Lobe (Extinction)', cx: 0, cy: 0.04, cz: -0.65, r: 0.38, color: '#a580ff' },
  'duct-flow': { name: 'duct-flow', label: 'Cerebellum (Duct Flow)', cx: 0, cy: -0.48, cz: -0.48, r: 0.35, color: '#52d9a6' },
  'partial-gravity': { name: 'partial-gravity', label: 'Brainstem (Partial Gravity)', cx: 0, cy: -0.84, cz: -0.26, r: 0.24, color: '#e6c86e' },
  default: { name: 'default', label: 'Cerebral Cortex', cx: 0, cy: 0.1, cz: 0, r: 0.55, color: '#49b8d6' },
}

function classifyLobe(x: number, y: number, z: number): string {
  if (y < -0.42) {
    if (Math.abs(x) < 0.22 && y < -0.6) return 'partial-gravity'
    return 'duct-flow'
  }
  if (z > 0.22 && y > -0.22) return 'flammability'
  if (z <= 0.22 && z > -0.36 && y > 0.08) return 'spread'
  if (z <= -0.36 && y > -0.28) return 'suppression'
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

/** Multi-octave cortical fold displacement simulating true anatomical gyri & sulci */
function corticalDisplacement(x: number, y: number, z: number): { disp: number; nx: number; ny: number; nz: number } {
  // Gyral frequency harmonics
  const f1 = Math.sin(7.5 * x + 1.2 * Math.sin(8.0 * z)) * Math.cos(7.5 * y + 1.2 * Math.cos(8.0 * x))
  const f2 = Math.sin(14.0 * y + 3.0 * Math.sin(12.0 * x)) * Math.sin(14.0 * z)
  const folds = Math.abs(f1) * 0.075 + f2 * 0.035

  // Finite-difference surface normal perturbation
  const eps = 0.015
  const df1 = Math.sin(7.5 * (x + eps)) - Math.sin(7.5 * (x - eps))
  const df2 = Math.cos(7.5 * (y + eps)) - Math.cos(7.5 * (y - eps))
  const df3 = Math.sin(14.0 * (z + eps)) - Math.sin(14.0 * (z - eps))

  const len = Math.hypot(x + df1, y + df2, z + df3) || 1
  return {
    disp: folds,
    nx: (x + df1) / len,
    ny: (y + df2) / len,
    nz: (z + df3) / len,
  }
}

/** Generate a realistic, high-fidelity 3D anatomical brain point cloud */
function generateRealisticBrainModel(): Point3D[] {
  const points: Point3D[] = []

  // 1. Dual Cerebral Hemispheres (Left & Right)
  const latSteps = 34
  const lonSteps = 44

  for (const hemi of [-1, 1]) {
    for (let i = 0; i <= latSteps; i++) {
      const v = (i / latSteps) * Math.PI - Math.PI / 2
      for (let j = 0; j < lonSteps; j++) {
        const u = (j / lonSteps) * Math.PI
        const su = Math.sin(u)
        const cv = Math.cos(v)
        const sv = Math.sin(v)

        let rx = 0.62
        let ry = 0.54
        let rz = 0.82

        // Occipital pole taper & frontal lift
        if (cv * su < -0.28) {
          rx *= 0.86
          ry *= 0.92
        }

        // Parametric ellipsoid coordinates
        let bx = hemi * (0.095 + Math.abs(su * cv) * rx)
        let by = sv * ry + 0.12 * Math.cos(u) * cv
        let bz = cv * su * rz

        // Longitudinal fissure depression between hemispheres
        const fissureWeight = Math.exp(-Math.pow(bx / 0.14, 2))
        by -= fissureWeight * 0.11

        // Sylvian fissure undercut (temporal lobe separation)
        if (by < 0.06 && by > -0.32 && bz > -0.22 && bz < 0.42) {
          bx *= 1.1
          by -= 0.075
        }

        // Cortical folds / sulci displacement
        const fold = corticalDisplacement(bx, by, bz)
        bx += bx * fold.disp
        by += by * fold.disp
        bz += bz * fold.disp

        const region = classifyLobe(bx, by, bz)
        points.push({
          x: bx,
          y: by,
          z: bz,
          nx: fold.nx * hemi,
          ny: fold.ny,
          nz: fold.nz,
          region,
          isSurface: true,
          isFissure: fissureWeight > 0.4,
          lobeWeight: 1,
        })
      }
    }
  }

  // 2. Cerebellar Hemispheres (Dual posterior masses with fine horizontal folia)
  for (const chemi of [-1, 1]) {
    const cSteps = 20
    for (let ci = 0; ci <= cSteps; ci++) {
      const v = (ci / cSteps) * Math.PI - Math.PI / 2
      for (let cj = 0; cj < cSteps * 2; cj++) {
        const u = (cj / (cSteps * 2)) * TAU
        const folia = 0.038 * Math.sin(24 * v) // Fine cerebellar striations
        const bx = chemi * (0.12 + Math.abs(Math.cos(u) * Math.cos(v)) * 0.32)
        const by = -0.52 + 0.19 * Math.sin(v) + folia
        const bz = -0.48 + 0.29 * Math.sin(u) * Math.cos(v)
        const len = Math.hypot(bx, by + 0.52, bz + 0.48) || 1
        points.push({
          x: bx,
          y: by,
          z: bz,
          nx: bx / len,
          ny: (by + 0.52) / len,
          nz: (bz + 0.48) / len,
          region: 'duct-flow',
          isSurface: true,
          isFissure: false,
          lobeWeight: 0.9,
        })
      }
    }
  }

  // 3. Brainstem column (Central descending trunk)
  for (let bi = 0; bi < 16; bi++) {
    const yVal = -0.54 - (bi / 16) * 0.42
    const rad = 0.13 - (bi / 16) * 0.04
    for (let bj = 0; bj < 12; bj++) {
      const ang = (bj / 12) * TAU
      const bx = rad * Math.cos(ang)
      const bz = -0.27 + rad * Math.sin(ang)
      points.push({
        x: bx,
        y: yVal,
        z: bz,
        nx: Math.cos(ang),
        ny: 0,
        nz: Math.sin(ang),
        region: 'partial-gravity',
        isSurface: true,
        isFissure: false,
        lobeWeight: 0.85,
      })
    }
  }

  // 4. Corpus Callosum & Deep Synaptic Lattice
  for (let k = 0; k < 220; k++) {
    const r = Math.pow(Math.random(), 0.65) * 0.44
    const theta = Math.random() * TAU
    const phi = (Math.random() - 0.5) * Math.PI
    const x = r * Math.cos(phi) * Math.sin(theta) + (Math.random() > 0.5 ? 0.16 : -0.16)
    const y = r * Math.sin(phi) * 0.72 + 0.08
    const z = r * Math.cos(phi) * Math.cos(theta) * 1.08 - 0.04
    points.push({
      x,
      y,
      z,
      nx: 0,
      ny: 1,
      nz: 0,
      region: classifyLobe(x, y, z),
      isSurface: false,
      isFissure: false,
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

  const x = lobe.cx + hemi * (Math.abs(Math.cos(angle)) * radius + 0.08)
  const y = lobe.cy + elev * radius
  const z = lobe.cz + Math.sin(angle) * radius * 0.9

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

  // 3D Camera & Orbit Physics
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

  const brainModel = useMemo(() => generateRealisticBrainModel(), [])

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

    // Trigger learning shockwave from newly updated records
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

  // 3D ASCII Render Loop with Lambertian + Specular + Fresnel Rim Shading
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    // High resolution ASCII terminal grid
    const COLS = 96
    const ROWS = 42
    const zBuffer = new Float32Array(COLS * ROWS)
    const energyBuf = new Float32Array(COLS * ROWS)
    const hotBuf = new Uint8Array(COLS * ROWS)
    const rimBuf = new Uint8Array(COLS * ROWS)

    // Key light vector for anatomical shading
    const lx = 0.36
    const ly = 0.62
    const lz = 0.7
    const lLen = Math.hypot(lx, ly, lz)
    const lightDir = { x: lx / lLen, y: ly / lLen, z: lz / lLen }

    const draw = (timeMs: number) => {
      const avail = cv.parentElement?.clientWidth ?? 720
      const stageH = cv.parentElement?.clientHeight ?? 640
      const fs = Math.max(9.5, Math.min(avail / (COLS * 0.6), stageH / (ROWS * 1.15), 23))
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

      // Dynamic rotation kinematics
      if (!dragRef.current.isDown && !reduced) {
        if (state === 'thinking') {
          targetRotRef.current.yaw += 0.022
          targetRotRef.current.pitch = 0.2 + 0.12 * Math.sin(t * 3.5)
        } else if (state === 'listening') {
          const delta = ((0 - targetRotRef.current.yaw) % TAU + TAU) % TAU
          targetRotRef.current.yaw += (delta > Math.PI ? delta - TAU : delta) * 0.05
          targetRotRef.current.pitch = 0.12 + 0.05 * Math.sin(t * 2.0)
        } else if (state === 'speaking') {
          targetRotRef.current.yaw += 0.012
          targetRotRef.current.pitch = 0.22 + 0.08 * Math.cos(t * 2.8)
        } else {
          targetRotRef.current.yaw += 0.0075
          targetRotRef.current.pitch = 0.22 + 0.06 * Math.sin(t * 1.1)
        }
      }

      // Smooth camera interpolation
      const rot = rotRef.current
      const targetRot = targetRotRef.current
      rot.yaw += (targetRot.yaw - rot.yaw) * 0.1
      rot.pitch += (targetRot.pitch - rot.pitch) * 0.1
      rot.zoom += (targetRot.zoom - rot.zoom) * 0.1

      zBuffer.fill(9999)
      energyBuf.fill(0)
      hotBuf.fill(0)
      rimBuf.fill(0)

      const cosY = Math.cos(rot.yaw)
      const sinY = Math.sin(rot.yaw)
      const cosP = Math.cos(rot.pitch)
      const sinP = Math.sin(rot.pitch)

      const camDist = 3.3 / rot.zoom
      const scaleX = COLS * 0.44 * rot.zoom
      const scaleY = ROWS * 0.48 * rot.zoom

      // Speech audio pulsation
      let stateAudioAmp = 0
      if (state === 'speaking') {
        stateAudioAmp = 0.35 + 0.25 * Math.sin(t * 18) * Math.sin(t * 7.5)
      } else if (state === 'listening') {
        stateAudioAmp = 0.2 + 0.15 * Math.sin(t * 12)
      }

      // Shockwave pulses
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

      // 1. Ray-project 3D Anatomical Brain Points
      for (let i = 0; i < brainModel.length; i++) {
        const pt = brainModel[i]

        let px = pt.x
        let py = pt.y
        let pz = pt.z

        if (state === 'speaking' && pt.isSurface) {
          const expansion = 1 + stateAudioAmp * 0.08
          px *= expansion
          py *= expansion
          pz *= expansion
        } else if (state === 'thinking' && Math.random() < 0.02) {
          px += (Math.random() - 0.5) * 0.025
          py += (Math.random() - 0.5) * 0.025
          pz += (Math.random() - 0.5) * 0.025
        }

        // 3D Yaw rotation
        const x1 = px * cosY + pz * sinY
        const z1 = -px * sinY + pz * cosY

        // 3D Pitch rotation
        const y2 = py * cosP - z1 * sinP
        const z2 = py * sinP + z1 * cosP

        // Rotate normal vector
        const nx1 = pt.nx * cosY + pt.nz * sinY
        const nz1 = -pt.nx * sinY + pt.nz * cosY
        const ny2 = pt.ny * cosP - nz1 * sinP
        const nz2 = pt.ny * sinP + nz1 * cosP

        const factor = camDist / (camDist + z2)
        const col = Math.round(COLS / 2 + x1 * scaleX * factor)
        const row = Math.round(ROWS / 2 - y2 * scaleY * factor)

        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue
        const bufIdx = row * COLS + col

        if (z2 < zBuffer[bufIdx]) {
          zBuffer[bufIdx] = z2

          // Shading: Lambertian diffuse + Blinn specular + Fresnel rim
          const dotLight = Math.max(0, nx1 * lightDir.x + ny2 * lightDir.y + nz2 * lightDir.z)
          const dotView = Math.max(0, nz2)
          const fresnel = Math.pow(1 - dotView, 2.5) // Glowing silhouette edge

          let intensity = 0.22 + dotLight * 0.52 + fresnel * 0.42

          // Longitudinal fissure groove depth
          if (pt.isFissure) intensity *= 0.55

          // Lobe specific highlight
          if (focusedRegion && pt.region !== focusedRegion) {
            intensity *= 0.18
          } else if (focusedRegion && pt.region === focusedRegion) {
            intensity *= 1.45
            hotBuf[bufIdx] = 1
          }

          // SI state activations
          if (state === 'listening' && pt.region === 'detection') {
            intensity += 0.45 + 0.3 * Math.sin(t * 8 + py * 10)
            hotBuf[bufIdx] = 1
          } else if (state === 'thinking' && (pt.region === 'flammability' || pt.region === 'spread')) {
            intensity += 0.5 + 0.4 * Math.sin(t * 14 + px * 12 + pz * 12)
            hotBuf[bufIdx] = 1
          } else if (state === 'speaking' && (pt.region === 'detection' || pt.region === 'flammability')) {
            intensity += 0.4 + stateAudioAmp * 0.8
            hotBuf[bufIdx] = 1
          }

          // Shockwave collisions
          for (let pi = 0; pi < pulses.length; pi++) {
            const p = pulses[pi]
            const age = (timeMs - p.t0) / 1000
            const curRad = age * p.speed
            const dist = Math.hypot(pt.x - p.ox, pt.y - p.oy, pt.z - p.oz)
            if (Math.abs(dist - curRad) < 0.14) {
              intensity += (1 - Math.abs(dist - curRad) / 0.14) * 0.85
              hotBuf[bufIdx] = 1
            }
          }

          if (fresnel > 0.65) rimBuf[bufIdx] = 1
          energyBuf[bufIdx] = intensity
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

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const c = col + dx
            const r = row + dy
            if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue
            const idx = r * COLS + c
            const nIntensity = isHovered ? 1.8 : 0.95 + 0.25 * Math.sin(t * 3.5 + n.phase)
            energyBuf[idx] += nIntensity * (dx === 0 && dy === 0 ? 1 : 0.5)
            hotBuf[idx] = 1
            zBuffer[idx] = Math.min(zBuffer[idx], nz2)
          }
        }
      }

      // 3. Render Characters (100% transparent background)
      const inkColor = '#edf4fa'
      const accentColor = state === 'speaking' ? '#ff7e40' : state === 'listening' ? '#52e3c2' : '#49b8d6'

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = r * COLS + c
          if (zBuffer[idx] >= 9000) continue

          const e = energyBuf[idx]
          const isHot = hotBuf[idx] === 1
          const isRim = rimBuf[idx] === 1

          const glyphSet = state === 'thinking' ? GLYPHS_THINK : RAMP
          let rampIdx = Math.max(1, Math.min(glyphSet.length - 1, Math.floor(e * glyphSet.length)))
          if (isRim && rampIdx < 3) rampIdx = 3
          const char = glyphSet[rampIdx]

          ctx.fillStyle = isHot ? accentColor : inkColor
          ctx.globalAlpha = Math.max(0.2, Math.min(1, 0.32 + e * 0.68))
          ctx.fillText(char, (c + 0.5) * cellW, (r + 0.5) * cellH)
        }
      }
      ctx.globalAlpha = 1
    }

    let raf = 0
    let last = 0
    const loop = (timeMs: number) => {
      if (timeMs - last > 30) {
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

  // Orbit drag interaction
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

    // Neuron pick
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    let closest: Neuron3D | null = null
    let minDist = 18

    for (const n of neuronsRef.current) {
      if (n.depth > 0.9) continue
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

      {/* 3D ASCII Canvas Stage — 100% transparent, no background box */}
      <div className="brain-stage relative mt-4 overflow-hidden">
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
        <div className="pointer-events-none absolute bottom-2 left-3 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink)] opacity-35">
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
