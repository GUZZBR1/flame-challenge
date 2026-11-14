import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Application, Container, Graphics, Sprite, Assets } from 'pixi.js'
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Radio,
  Play,
  Pause,
  Flame,
  Database,
  DoorClosed,
  Eye,
  FileSpreadsheet,
  Activity,
  Sparkles,
  ArrowRight,
  FlaskConical,
  Sliders,
} from 'lucide-react'
import { investigations } from '../game/engine'
import { flowRange, limitingO2, o2Range, specFor } from '../game/experiments'
import type { Investigation } from '../types'

export type LabTake = 'overview' | 'engine' | 'analysis' | 'datacenter' | 'airlock' | 'window'

interface TakeConfig {
  id: LabTake
  label: string
  sublabel: string
  relX: number // relative -0.5 to 0.5 from center
  relY: number
  zoomMultiplier: number
}

const TAKES: TakeConfig[] = [
  {
    id: 'overview',
    label: 'Overview',
    sublabel: 'Full Experiment Lab Panorama',
    relX: 0,
    relY: 0,
    zoomMultiplier: 1.0,
  },
  {
    id: 'engine',
    label: 'Combustion Chamber',
    sublabel: 'Test Cell & Vacuum Exhaust',
    relX: -0.22,
    relY: -0.12,
    zoomMultiplier: 1.85,
  },
  {
    id: 'analysis',
    label: 'Analysis Bench',
    sublabel: 'NASA PSI Setup & Data Notebook',
    relX: 0.0,
    relY: 0.14,
    zoomMultiplier: 1.9,
  },
  {
    id: 'datacenter',
    label: 'Server Room',
    sublabel: 'Hermetic Vault & Telemetry Racks',
    relX: 0.22,
    relY: -0.12,
    zoomMultiplier: 1.85,
  },
  {
    id: 'airlock',
    label: 'Tech Airlock',
    sublabel: 'Pressurized Shipyard Access',
    relX: 0.03,
    relY: 0.36,
    zoomMultiplier: 1.75,
  },
  {
    id: 'window',
    label: 'Space Window',
    sublabel: 'Panoramic Low-Orbit View',
    relX: 0.21,
    relY: -0.42,
    zoomMultiplier: 1.7,
  },
]

interface HotspotData {
  id: string
  takeId: LabTake
  title: string
  subtitle: string
  x: number // Relative 0..1 on background map
  y: number
  status: 'nominal' | 'active' | 'warning'
  metrics: { label: string; value: string }[]
  icon: typeof Flame
}

export interface ResearchLabSceneProps {
  onOpenData?: () => void
  onOpenInsights?: () => void
  onReturnToShipyard?: () => void
}

type TestPhase = 'idle' | 'pre-ignition' | 'injection' | 'stable-burn' | 'exhaust-purge' | 'cooling'

export default function ResearchLabScene({
  onOpenData,
  onOpenInsights,
  onReturnToShipyard,
}: ResearchLabSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)
  const bgSpriteRef = useRef<Sprite | null>(null)
  const hotspotRefs = useRef(new Map<string, HTMLDivElement>())

  const [activeTake, setActiveTake] = useState<LabTake>('overview')
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null)
  const [showHotspots, setShowHotspots] = useState<boolean>(true)
  const [isAutoTour, setIsAutoTour] = useState<boolean>(false)
  const [zoomLevel, setZoomLevel] = useState<number>(100)

  // NASA Experiment selection and parameters
  const [selectedInvId, setSelectedInvId] = useState<string>(() => {
    const flex = investigations.find((i) => i.id === 'flex-2')
    return flex ? flex.id : (investigations[0]?.id ?? 'flex-2')
  })

  const currentInv = useMemo<Investigation>(() => {
    return investigations.find((i) => i.id === selectedInvId) ?? investigations[0]
  }, [selectedInvId])

  const [o2Pct, setO2Pct] = useState<number>(() => {
    const range = o2Range(currentInv)
    return Math.min(range[1], Math.max(range[0], 21))
  })

  const [flowCms, setFlowCms] = useState<number>(() => {
    const range = flowRange(currentInv)
    return range[0]
  })

  // Recalculate O2 and Flow bounds when experiment changes
  const handleSelectInvestigation = useCallback((id: string) => {
    setSelectedInvId(id)
    const inv = investigations.find((i) => i.id === id)
    if (inv) {
      const o2r = o2Range(inv)
      setO2Pct(Math.min(o2r[1], Math.max(o2r[0], 21)))
      setFlowCms(flowRange(inv)[0])
    }
  }, [])

  const currentLOC = useMemo(() => limitingO2(currentInv), [currentInv])
  const currentSpec = useMemo(() => specFor(currentInv, o2Pct, flowCms), [currentInv, o2Pct, flowCms])

  // Engine Test Cycle state
  const [testPhase, setTestPhase] = useState<TestPhase>('idle')
  const [testFlameIntensity, setTestFlameIntensity] = useState<number>(0)
  const [testTelemetry, setTestTelemetry] = useState({
    tempK: 295,
    o2Flow: 0.0,
    burnRate: 0.0,
    extinctionDistMm: 0.0,
  })

  // Dynamic hotspots reflecting active experiment
  const hotspots: HotspotData[] = useMemo(() => [
    {
      id: 'engine',
      takeId: 'engine',
      title: 'Experiment Combustion Chamber',
      subtitle: `Active Test: ${currentInv.title.slice(0, 42)}...`,
      x: 0.28,
      y: 0.38,
      status: testPhase !== 'idle' ? 'active' : 'nominal',
      icon: Flame,
      metrics: [
        { label: 'NASA Experiment', value: currentInv.id.toUpperCase() },
        { label: 'O₂ Concentration', value: `${o2Pct.toFixed(1)}% (LOC: ${currentLOC.toFixed(1)}%)` },
        { label: 'Ventilation Flow', value: `${flowCms.toFixed(1)} cm/s` },
        { label: 'Flame Geometry', value: currentInv.id.includes('flex') ? 'Spherical in Microgravity' : 'Surface Spread' },
        { label: 'Vacuum Duct', value: 'Cryogenic Exhaust Operational' },
      ],
    },
    {
      id: 'analysis',
      takeId: 'analysis',
      title: 'Analysis & Configuration Bench',
      subtitle: 'NASA Physical Sciences Informatics Science Terminal',
      x: 0.50,
      y: 0.62,
      status: 'nominal',
      icon: Activity,
      metrics: [
        { label: 'Loaded Dataset', value: currentInv.title },
        { label: 'Ignition Risk', value: `${Math.round(currentSpec.riskPct)}% (${currentSpec.factors.ignition > 50 ? 'High' : 'Controlled'})` },
        { label: 'Burn Rate d²/dt', value: `${(0.4 + (o2Pct / 30) * 0.6).toFixed(2)} mm²/s` },
        { label: 'Scientific Record', value: 'NASA PSI Microgravity Archive' },
      ],
    },
    {
      id: 'datacenter',
      takeId: 'datacenter',
      title: 'Database & Server Room',
      subtitle: 'Telemetry & PSI Quantum Processing',
      x: 0.72,
      y: 0.38,
      status: 'nominal',
      icon: Database,
      metrics: [
        { label: 'Bus Throughput', value: '4.2 TB/s Synchronous' },
        { label: 'Archived Experiments', value: `${investigations.filter((i) => i.verified).length} Verified / ${investigations.length} Total` },
        { label: 'Core Cooling', value: 'Cryogenic Helium 4.2 K' },
        { label: 'Data Integrity', value: '99.9999% Verified Parity' },
      ],
    },
    {
      id: 'airlock',
      takeId: 'airlock',
      title: 'Hub Pressurized Airlock',
      subtitle: 'Hermetic Door & Shipyard Return',
      x: 0.53,
      y: 0.86,
      status: 'nominal',
      icon: DoorClosed,
      metrics: [
        { label: 'Internal Pressure', value: '1.00 atm (O2 21% / N2 79%)' },
        { label: 'Connection', value: 'Main Shipyard Walkway' },
        { label: 'Pneumatic Seal', value: 'Active & Locked' },
        { label: 'Air Filter', value: 'HEPA Class 100 Operational' },
      ],
    },
    {
      id: 'window',
      takeId: 'window',
      title: 'Space Observation Window',
      subtitle: 'Direct Low-Orbit Line of Sight',
      x: 0.71,
      y: 0.08,
      status: 'nominal',
      icon: Eye,
      metrics: [
        { label: 'External Vacuum', value: '10⁻¹¹ Torr' },
        { label: 'Solar Radiation', value: '4.1 kW/m² (Shield Active)' },
        { label: 'Orbital Traffic', value: 'Patrol Ships on Trajectory 03' },
      ],
    },
  ], [currentInv, currentLOC, currentSpec, o2Pct, flowCms, testPhase])

  // Inspection card always renders the live hotspot so slider/investigation
  // changes update the open card instead of leaving stale metrics
  const activeHotspot = activeHotspotId ? (hotspots.find((h) => h.id === activeHotspotId) ?? null) : null

  // Latest values for the Pixi ticker — keeps canvas init independent of
  // experiment state so moving sliders never restarts the application
  const hotspotsRef = useRef(hotspots)
  const testFlameRef = useRef(testFlameIntensity)
  useEffect(() => {
    hotspotsRef.current = hotspots
    testFlameRef.current = testFlameIntensity
  }, [hotspots, testFlameIntensity])

  // Camera animation target ref
  const cameraRef = useRef({
    targetX: 0,
    targetY: 0,
    targetScale: 1,
    isTransitioning: false,
    baseScale: 1,
  })

  // Apply a Take
  const applyTake = useCallback((takeId: LabTake) => {
    setActiveTake(takeId)
    const cfg = TAKES.find((t) => t.id === takeId)
    if (!cfg || !appRef.current || !bgSpriteRef.current) return

    const app = appRef.current
    const bg = bgSpriteRef.current
    const baseScale = cameraRef.current.baseScale
    const targetScale = baseScale * cfg.zoomMultiplier

    const targetX = app.screen.width / 2 - cfg.relX * bg.width * targetScale
    const targetY = app.screen.height / 2 - cfg.relY * bg.height * targetScale

    cameraRef.current.targetX = targetX
    cameraRef.current.targetY = targetY
    cameraRef.current.targetScale = targetScale
    cameraRef.current.isTransitioning = true

    setZoomLevel(Math.round(cfg.zoomMultiplier * 100))
  }, [])

  // Trigger simulated experimental engine test cycle
  const runTestCycle = useCallback(() => {
    if (testPhase !== 'idle') return

    setTestPhase('pre-ignition')
    applyTake('engine')

    const peakTemp = Math.round(1100 + (o2Pct / 30) * 600)
    const burnRateVal = Number((0.35 + (o2Pct / 30) * 0.55).toFixed(2))

    const timeline: { phase: TestPhase; delay: number; flame: number; temp: number; flow: number; rate: number }[] = [
      { phase: 'pre-ignition', delay: 400, flame: 0.25, temp: 450, flow: flowCms * 0.4 + 1.0, rate: burnRateVal * 0.2 },
      { phase: 'injection', delay: 1200, flame: 0.65, temp: Math.round(peakTemp * 0.65), flow: flowCms + 2.5, rate: burnRateVal * 0.6 },
      { phase: 'stable-burn', delay: 2400, flame: 1.0, temp: peakTemp, flow: flowCms + 4.2, rate: burnRateVal },
      { phase: 'exhaust-purge', delay: 4400, flame: 0.4, temp: Math.round(peakTemp * 0.45), flow: 1.5, rate: burnRateVal * 0.3 },
      { phase: 'cooling', delay: 5800, flame: 0.0, temp: 320, flow: 0.0, rate: 0.0 },
      { phase: 'idle', delay: 7200, flame: 0.0, temp: 295, flow: 0.0, rate: 0.0 },
    ]

    timeline.forEach(({ phase, delay, flame, temp, flow, rate }) => {
      setTimeout(() => {
        setTestPhase(phase)
        setTestFlameIntensity(flame)
        setTestTelemetry({
          tempK: temp,
          o2Flow: flow,
          burnRate: rate,
          extinctionDistMm: flame > 0 ? Number((1.6 + flame * 0.5).toFixed(2)) : 0,
        })
      }, delay)
    })
  }, [testPhase, applyTake, o2Pct, flowCms])

  // Auto-tour timer
  useEffect(() => {
    if (!isAutoTour) return
    const interval = setInterval(() => {
      setActiveTake((current) => {
        const idx = TAKES.findIndex((t) => t.id === current)
        const nextIdx = (idx + 1) % TAKES.length
        const nextTake = TAKES[nextIdx].id
        applyTake(nextTake)
        return nextTake
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [isAutoTour, applyTake])

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        runTestCycle()
      } else if (e.key === 't' || e.key === 'T') {
        runTestCycle()
      } else if (e.key === '1') applyTake('overview')
      else if (e.key === '2') applyTake('engine')
      else if (e.key === '3') applyTake('analysis')
      else if (e.key === '4') applyTake('datacenter')
      else if (e.key === '5') applyTake('airlock')
      else if (e.key === '6') applyTake('window')
      else if (e.key === '+' || e.key === '=') {
        if (!worldRef.current) return
        const s = Math.min(3.0, worldRef.current.scale.x * 1.2)
        worldRef.current.scale.set(s)
        setZoomLevel(Math.round((s / cameraRef.current.baseScale) * 100))
      } else if (e.key === '-') {
        if (!worldRef.current) return
        const s = Math.max(0.4, worldRef.current.scale.x * 0.8)
        worldRef.current.scale.set(s)
        setZoomLevel(Math.round((s / cameraRef.current.baseScale) * 100))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runTestCycle, applyTake])

  // PixiJS initialization
  useEffect(() => {
    let isMounted = true
    let app: Application
    let removeGlobalListeners: (() => void) | null = null

    async function initPixi() {
      if (!containerRef.current) return

      app = new Application()
      await app.init({
        resizeTo: containerRef.current,
        backgroundColor: 0x0b1220,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      if (!isMounted || !containerRef.current) {
        app.destroy(true, { children: true })
        return
      }

      containerRef.current.appendChild(app.canvas)
      appRef.current = app

      const world = new Container()
      world.eventMode = 'static'
      app.stage.addChild(world)
      worldRef.current = world

      // Load background map of research lab
      const bgTexture = await Assets.load(
        '/assets/space/centro_dados_pesquisa/mapa_centro_dados_pesquisa_v4.png'
      )
      if (!isMounted) return

      const bgSprite = new Sprite(bgTexture)
      bgSprite.anchor.set(0.5)
      world.addChild(bgSprite)
      bgSpriteRef.current = bgSprite

      // Add the standalone lab concepts over the matching stations in the map.
      // Keep their dimensions tied to the map so zoom and pan preserve alignment.
      const equipmentLayer = new Container()
      const equipment = [
        { file: 'experiment-chamber.png', x: 0.28, y: 0.39, width: 0.20, anchor: 0.5 },
        { file: 'analysis-bench.png', x: 0.48, y: 0.68, width: 0.20, anchor: 0.5 },
        { file: 'control-console.png', x: 0.75, y: 0.58, width: 0.13, anchor: 0.5 },
        { file: 'gas-cylinder-rack.png', x: 0.39, y: 0.23, width: 0.09, anchor: 0.5 },
        { file: 'scientist.png', x: 0.37, y: 0.49, width: 0.055, anchor: 1 },
      ] as const
      const equipmentTextures = await Promise.all(
        equipment.map(({ file }) => Assets.load(`/assets/laboratory-experiments/${file}`)),
      )
      if (!isMounted) return

      equipment.forEach(({ x, y, width, anchor }, index) => {
        const sprite = new Sprite(equipmentTextures[index])
        sprite.anchor.set(0.5, anchor)
        sprite.width = bgSprite.width * width
        sprite.height = sprite.width * (equipmentTextures[index].height / equipmentTextures[index].width)
        sprite.position.set((x - 0.5) * bgSprite.width, (y - 0.5) * bgSprite.height)
        equipmentLayer.addChild(sprite)
      })
      world.addChild(equipmentLayer)

      // Calculate initial fit
      const initialScale =
        Math.min(app.screen.width / bgSprite.width, app.screen.height / bgSprite.height) * 1.05

      cameraRef.current.baseScale = initialScale
      cameraRef.current.targetScale = initialScale
      cameraRef.current.targetX = app.screen.width / 2
      cameraRef.current.targetY = app.screen.height / 2
      world.scale.set(initialScale)
      world.x = app.screen.width / 2
      world.y = app.screen.height / 2

      // FX Graphics layer
      const pulseLayer = new Graphics()
      world.addChild(pulseLayer)

      let elapsed = 0
      app.ticker.add((ticker) => {
        elapsed += ticker.deltaTime * 0.04

        // 1. Camera Lerp
        if (cameraRef.current.isTransitioning) {
          world.x += (cameraRef.current.targetX - world.x) * 0.08
          world.y += (cameraRef.current.targetY - world.y) * 0.08
          const curScale = world.scale.x
          const nxtScale = curScale + (cameraRef.current.targetScale - curScale) * 0.08
          world.scale.set(nxtScale)

          if (
            Math.abs(cameraRef.current.targetX - world.x) < 0.5 &&
            Math.abs(cameraRef.current.targetY - world.y) < 0.5 &&
            Math.abs(cameraRef.current.targetScale - nxtScale) < 0.005
          ) {
            world.x = cameraRef.current.targetX
            world.y = cameraRef.current.targetY
            world.scale.set(cameraRef.current.targetScale)
            cameraRef.current.isTransitioning = false
          }
        }

        // Keep HTML hotspots anchored to landmarks
        hotspotsRef.current.forEach((hotspot) => {
          const element = hotspotRefs.current.get(hotspot.id)
          if (!element) return
          const localX = (hotspot.x - 0.5) * bgSprite.width
          const localY = (hotspot.y - 0.5) * bgSprite.height
          element.style.left = `${world.x + localX * world.scale.x}px`
          element.style.top = `${world.y + localY * world.scale.y}px`
        })

        // 2. Dynamic FX Layer
        pulseLayer.clear()

        // Test Bay: Engine cradle caution aura (Amber)
        const engineX = bgSprite.width * (0.28 - 0.5)
        const engineY = bgSprite.height * (0.38 - 0.5)
        const engineWave = Math.sin(elapsed * 2.0)
        pulseLayer.ellipse(engineX, engineY, 70 + engineWave * 4, 38 + engineWave * 2)
        pulseLayer.stroke({
          width: 2,
          color: 0xf3be5a,
          alpha: 0.25 + 0.15 * engineWave,
        })

        // Engine Test Burn visual pulse when active
        const flame = testFlameRef.current
        if (flame > 0) {
          const flameFlicker = Math.sin(elapsed * 8.0) * 0.2 + 0.8
          const r = 26 * flame * flameFlicker
          // Spherical microgravity flame glow (IGNIS blue/cyan core with amber envelope)
          pulseLayer.circle(engineX, engineY - 8, r * 1.5)
          pulseLayer.fill({ color: 0xf3be5a, alpha: 0.35 * flame })
          pulseLayer.circle(engineX, engineY - 8, r * 0.85)
          pulseLayer.fill({ color: 0x49b8d6, alpha: 0.75 * flame })
          pulseLayer.circle(engineX, engineY - 8, r * 0.4)
          pulseLayer.fill({ color: 0xffffff, alpha: 0.95 * flame })
        }

        // Analysis Console: Holographic workbench shimmer (Cyan)
        const consoleX = bgSprite.width * (0.50 - 0.5)
        const consoleY = bgSprite.height * (0.62 - 0.5)
        const consoleWave = Math.sin(elapsed * 1.5)
        pulseLayer.ellipse(consoleX, consoleY, 85 + consoleWave * 3, 45 + consoleWave * 2)
        pulseLayer.stroke({
          width: 1.5,
          color: 0x49b8d6,
          alpha: 0.2 + 0.15 * consoleWave,
        })

        // Datacenter: Discreet server LED tickers
        const serverX = bgSprite.width * (0.72 - 0.5)
        const serverY = bgSprite.height * (0.38 - 0.5)
        for (let i = 0; i < 4; i++) {
          const ledAlpha = 0.4 + 0.5 * Math.sin(elapsed * 3.5 + i * 1.2)
          pulseLayer.circle(serverX - 30 + i * 20, serverY - 15, 2.5)
          pulseLayer.fill({ color: i % 2 === 0 ? 0x49b8d6 : 0xf3be5a, alpha: ledAlpha })
        }

        // Airlock entrance green/cyan safety beacon
        const airlockX = bgSprite.width * (0.53 - 0.5)
        const airlockY = bgSprite.height * (0.86 - 0.5)
        const airlockBlink = Math.sin(elapsed * 2.5) > 0 ? 0.8 : 0.2
        pulseLayer.circle(airlockX - 25, airlockY - 20, 3)
        pulseLayer.fill({ color: 0x49b8d6, alpha: airlockBlink })
        pulseLayer.circle(airlockX + 25, airlockY - 20, 3)
        pulseLayer.fill({ color: 0x49b8d6, alpha: airlockBlink })
      })

      // Drag to Pan
      let isDragging = false
      let startX = 0
      let startY = 0

      const onPointerDown = (e: PointerEvent) => {
        isDragging = true
        cameraRef.current.isTransitioning = false
        startX = e.clientX - world.x
        startY = e.clientY - world.y
      }

      const onPointerMove = (e: PointerEvent) => {
        if (!isDragging) return
        world.x = e.clientX - startX
        world.y = e.clientY - startY
      }

      const onPointerUp = () => {
        isDragging = false
      }

      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        cameraRef.current.isTransitioning = false
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
        const newScale = Math.max(0.4, Math.min(3.0, world.scale.x * zoomFactor))
        world.scale.set(newScale)
        setZoomLevel(Math.round((newScale / cameraRef.current.baseScale) * 100))
      }

      const canvas = app.canvas
      canvas.addEventListener('pointerdown', onPointerDown)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      canvas.addEventListener('wheel', onWheel, { passive: false })
      removeGlobalListeners = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('wheel', onWheel)
      }
    }

    initPixi()

    return () => {
      isMounted = false
      removeGlobalListeners?.()
      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
      }
    }
  }, [])

  return (
    <div className="relative h-[720px] w-full overflow-hidden rounded-xl border border-edge bg-[#0B1220] shadow-2xl">
      {/* Top Bar Controls & Takes */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge bg-panel/90 px-4 py-2.5 text-xs text-mist backdrop-blur-md shadow-lg">
        {/* Left: Module Title & Takes */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-cyan-300 font-semibold">
            <FlaskConical className="h-4 w-4 text-cyan-400" />
            EXPERIMENT LAB:
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {TAKES.map((t) => (
              <button
                key={t.id}
                onClick={() => applyTake(t.id)}
                className={`rounded-md px-2.5 py-1 font-mono transition-all duration-200 ${
                  activeTake === t.id
                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-transparent'
                }`}
                title={t.sublabel}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Actions, Auto-Tour, Zoom & Links */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Test Cycle Trigger */}
          <button
            onClick={runTestCycle}
            disabled={testPhase !== 'idle'}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-mono font-medium transition-colors ${
              testPhase !== 'idle'
                ? 'bg-amber-500/30 text-amber-300 border border-amber-400/60 animate-pulse cursor-not-allowed'
                : 'bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 border border-amber-500/40'
            }`}
            title="Trigger combustion test for the selected experiment [Space/T]"
          >
            <Flame className="h-3.5 w-3.5" />
            {testPhase === 'idle' ? `Test (${currentInv.id.toUpperCase()})` : `Burn: ${testPhase.toUpperCase()}`}
          </button>

          {/* Notebook / MasterSheet Link */}
          {onOpenData && (
            <button
              onClick={onOpenData}
              className="flex items-center gap-1.5 rounded-md bg-cyan-950/80 px-2.5 py-1 font-mono text-cyan-300 border border-cyan-800 hover:bg-cyan-900 transition-colors"
              title="Open Science Notebook & Data Matrix"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              PSI Notebook
            </button>
          )}

          {/* Insights Panel Link */}
          {onOpenInsights && (
            <button
              onClick={onOpenInsights}
              className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 font-mono text-slate-200 hover:bg-slate-700 transition-colors"
              title="Open Insights & Correlations Panel"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              Insights
            </button>
          )}

          <span className="text-slate-600">|</span>

          {/* Auto Tour */}
          <button
            onClick={() => setIsAutoTour(!isAutoTour)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono font-medium transition-colors ${
              isAutoTour
                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 animate-pulse'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Auto-cycles through sectors every 5 seconds"
          >
            {isAutoTour ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {isAutoTour ? 'Auto Tour' : 'Auto Tour'}
          </button>

          {/* Zoom controls */}
          <span className="font-mono text-slate-400">Zoom: {zoomLevel}%</span>
          <button
            onClick={() => {
              if (!worldRef.current) return
              cameraRef.current.isTransitioning = false
              const s = Math.min(3.0, worldRef.current.scale.x * 1.2)
              worldRef.current.scale.set(s)
              setZoomLevel(Math.round((s / cameraRef.current.baseScale) * 100))
            }}
            className="rounded p-1 hover:bg-slate-700 hover:text-white"
            title="Zoom +"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              if (!worldRef.current) return
              cameraRef.current.isTransitioning = false
              const s = Math.max(0.4, worldRef.current.scale.x * 0.8)
              worldRef.current.scale.set(s)
              setZoomLevel(Math.round((s / cameraRef.current.baseScale) * 100))
            }}
            className="rounded p-1 hover:bg-slate-700 hover:text-white"
            title="Zoom -"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => applyTake('overview')}
            className="rounded p-1 hover:bg-slate-700 hover:text-white"
            title="Center Overview"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          {/* Hotspot visibility */}
          <button
            onClick={() => setShowHotspots(!showHotspots)}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono transition-colors ${
              showHotspots
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            {showHotspots ? 'Hotspots' : 'Hidden'}
          </button>
        </div>
      </div>

      {/* Pixi Canvas Mount */}
      <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Interactive Overlay Hotspots */}
      {showHotspots && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {hotspots.map((h) => {
            const Icon = h.icon
            const isSelected = activeHotspot?.id === h.id
            return (
              <div
                key={h.id}
                ref={(element) => {
                  if (element) hotspotRefs.current.set(h.id, element)
                  else hotspotRefs.current.delete(h.id)
                }}
                style={{ left: 0, top: 0 }}
                className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
              >
                <button
                  onClick={() => {
                    setActiveHotspotId(isSelected ? null : h.id)
                    applyTake(h.takeId)
                  }}
                  className={`group relative flex items-center justify-center rounded-full p-2.5 transition-transform duration-200 hover:scale-125 ${
                    isSelected
                      ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/50 ring-4 ring-cyan-400/30'
                      : 'border border-cyan-400/60 bg-panel/90 text-cyan-300 hover:border-cyan-300'
                  }`}
                  aria-label={h.title}
                >
                  <Icon className="h-4 w-4" />
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-2 py-0.5 text-[10px] font-mono text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity">
                    {h.title}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Active Hotspot Inspection & Experiment Control Card */}
      {activeHotspot && (
        <div className="absolute right-4 bottom-4 z-30 w-96 rounded-lg border border-cyan-500/40 bg-panel/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between border-b border-edge pb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <h4 className="text-sm font-semibold text-slate-100">{activeHotspot.title}</h4>
              </div>
              <p className="text-[11px] text-mist">{activeHotspot.subtitle}</p>
            </div>
            <button
              onClick={() => setActiveHotspotId(null)}
              className="text-xs text-mist hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Quick Experiment Switcher (available when inspecting Engine or Analysis) */}
          {(activeHotspot.id === 'engine' || activeHotspot.id === 'analysis') && (
            <div className="mt-3 rounded border border-edge bg-slate-900/60 p-2.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-cyan-300 mb-1.5">
                <span className="flex items-center gap-1">
                  <Sliders className="h-3 w-3" />
                  NASA PSI INVESTIGATION:
                </span>
                <span className="text-mist">LOC: {currentLOC}%</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {investigations.slice(0, 5).map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => handleSelectInvestigation(inv.id)}
                    className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${
                      selectedInvId === inv.id
                        ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/60 font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {inv.id.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Sliders for O2 and Flow */}
              <div className="mt-2.5 space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Oxygen O₂:</span>
                  <span className="font-mono text-cyan-300 font-semibold">{o2Pct.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={o2Range(currentInv)[0]}
                  max={o2Range(currentInv)[1]}
                  step={0.5}
                  value={o2Pct}
                  onChange={(e) => setO2Pct(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-1 bg-slate-700 rounded-lg cursor-pointer"
                />

                <div className="flex justify-between items-center text-slate-300 pt-1">
                  <span>Ventilation Flow:</span>
                  <span className="font-mono text-cyan-300 font-semibold">{flowCms.toFixed(1)} cm/s</span>
                </div>
                <input
                  type="range"
                  min={flowRange(currentInv)[0]}
                  max={flowRange(currentInv)[1]}
                  step={0.5}
                  value={flowCms}
                  onChange={(e) => setFlowCms(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-1 bg-slate-700 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}

          <div className="mt-3 space-y-1.5">
            {activeHotspot.metrics.map((m, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="text-mist">{m.label}:</span>
                <span className="font-mono text-slate-200">{m.value}</span>
              </div>
            ))}
          </div>

          {/* Contextual actions */}
          {activeHotspot.id === 'engine' && (
            <div className="mt-3 pt-3 border-t border-edge">
              <button
                onClick={runTestCycle}
                disabled={testPhase !== 'idle'}
                className="w-full flex items-center justify-center gap-2 rounded bg-amber-500/20 py-1.5 text-xs font-mono font-medium text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
              >
                <Flame className="h-3.5 w-3.5" />
                {testPhase === 'idle' ? `Chamber Test: ${currentInv.id.toUpperCase()}` : `Burning: ${testPhase}`}
              </button>
            </div>
          )}

          {activeHotspot.id === 'analysis' && onOpenData && (
            <div className="mt-3 pt-3 border-t border-edge flex gap-2">
              <button
                onClick={onOpenData}
                className="flex-1 flex items-center justify-center gap-1.5 rounded bg-cyan-950 py-1.5 text-xs font-mono font-medium text-cyan-300 border border-cyan-700 hover:bg-cyan-900 transition-colors"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                PSI Notebook
              </button>
              {onOpenInsights && (
                <button
                  onClick={onOpenInsights}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded bg-slate-800 py-1.5 text-xs font-mono font-medium text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  Insights
                </button>
              )}
            </div>
          )}

          {activeHotspot.id === 'airlock' && onReturnToShipyard && (
            <div className="mt-3 pt-3 border-t border-edge">
              <button
                onClick={onReturnToShipyard}
                className="w-full flex items-center justify-center gap-2 rounded bg-cyan-950 py-1.5 text-xs font-mono font-medium text-cyan-300 border border-cyan-700 hover:bg-cyan-900 transition-colors"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Return to Orbital Shipyard
              </button>
            </div>
          )}

          <div className="mt-3 pt-2 border-t border-edge flex items-center justify-between text-[11px]">
            <span className="text-cyan-400 font-mono">STATUS: {activeHotspot.status.toUpperCase()}</span>
            <span className="text-slate-400 font-mono">SECTOR: {activeTake.toUpperCase()}</span>
          </div>
        </div>
      )}

      {/* Real-time Test Cycle Telemetry HUD (Bottom Left) */}
      {testPhase !== 'idle' && (
        <div className="absolute left-4 bottom-4 z-30 w-84 rounded-lg border border-amber-500/50 bg-panel/95 p-3.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-edge pb-2">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              <span className="font-mono text-xs font-semibold text-amber-300">
                TEST: {currentInv.id.toUpperCase()}
              </span>
            </div>
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-300 uppercase">
              {testPhase}
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded bg-slate-900/60 p-2 border border-edge">
              <div className="text-[10px] text-mist">Flame Temp.</div>
              <div className="font-mono text-sm font-semibold text-amber-300">
                {testTelemetry.tempK} K
              </div>
            </div>
            <div className="rounded bg-slate-900/60 p-2 border border-edge">
              <div className="text-[10px] text-mist">O₂ Concentration</div>
              <div className="font-mono text-sm font-semibold text-cyan-300">
                {o2Pct.toFixed(1)}%
              </div>
            </div>
            <div className="rounded bg-slate-900/60 p-2 border border-edge">
              <div className="text-[10px] text-mist">d²/dt Rate</div>
              <div className="font-mono text-sm font-semibold text-white">
                {testTelemetry.burnRate.toFixed(2)} mm²/s
              </div>
            </div>
            <div className="rounded bg-slate-900/60 p-2 border border-edge">
              <div className="text-[10px] text-mist">Extinction Limit</div>
              <div className="font-mono text-sm font-semibold text-emerald-400">
                {testTelemetry.extinctionDistMm > 0 ? `${testTelemetry.extinctionDistMm} mm` : '---'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
