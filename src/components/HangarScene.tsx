import { useEffect, useRef, useState } from 'react'
import { Application, Container, Graphics, Sprite, Assets } from 'pixi.js'
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Radio,
  ShieldCheck,
  Rocket,
  Building2,
  Camera,
  Play,
  Pause,
} from 'lucide-react'

export type HangarTake = 'overview' | 'ship' | 'hub' | 'portal' | 'tower'

interface TakeConfig {
  id: HangarTake
  label: string
  sublabel: string
  relX: number // -0.5 to 0.5 relative to center
  relY: number // -0.5 to 0.5 relative to center
  zoomMultiplier: number
}

const TAKES: TakeConfig[] = [
  {
    id: 'overview',
    label: 'Visão Geral',
    sublabel: 'Panorama Completo de Ponta a Ponta',
    relX: 0,
    relY: 0,
    zoomMultiplier: 1.0,
  },
  {
    id: 'ship',
    label: 'Nave IGNIS (Pad 03)',
    sublabel: 'Módulo de Ensaios e Técnicos em Solo',
    relX: 0.58 - 0.5,
    relY: 0.58 - 0.5,
    zoomMultiplier: 1.9,
  },
  {
    id: 'hub',
    label: 'Hub Envidraçado',
    sublabel: 'Saguão de Chegada e Eclusas da Estação',
    relX: 0.20 - 0.5,
    relY: 0.82 - 0.5,
    zoomMultiplier: 2.0,
  },
  {
    id: 'portal',
    label: 'Portal do Vácuo',
    sublabel: 'Saída para o Espaço e Balizadores',
    relX: 0.86 - 0.5,
    relY: 0.34 - 0.5,
    zoomMultiplier: 1.8,
  },
  {
    id: 'tower',
    label: 'Torre de Controle',
    sublabel: 'Comando de Voo e Laboratórios Superiores',
    relX: 0.26 - 0.5,
    relY: 0.24 - 0.5,
    zoomMultiplier: 1.9,
  },
]

interface HotspotData {
  id: string
  takeId: HangarTake
  title: string
  subtitle: string
  x: number // Relative % on background
  y: number // Relative % on background
  status: 'nominal' | 'active' | 'warning'
  metrics: { label: string; value: string }[]
  icon: typeof Rocket
}

const HOTSPOTS: HotspotData[] = [
  {
    id: 'ship',
    takeId: 'ship',
    title: 'Nave Científica IGNIS (Pad 03)',
    subtitle: 'Módulo de Exploração e Ensaios em Microgravidade',
    x: 0.58,
    y: 0.58,
    status: 'nominal',
    icon: Rocket,
    metrics: [
      { label: 'Ensaio Atual', value: 'Flame in Freefall (FLEX-2)' },
      { label: 'Câmara Térmica', value: 'Pronta / 24.2 °C' },
      { label: 'Pressão de Injeção', value: '1.02 atm' },
      { label: 'Status dos Propulsores', value: 'Standby Criogênico' },
    ],
  },
  {
    id: 'hub',
    takeId: 'hub',
    title: 'Hub de Acesso ao Estaleiro',
    subtitle: 'Saguão Envidraçado de Transição e Embarque',
    x: 0.18,
    y: 0.85,
    status: 'active',
    icon: Building2,
    metrics: [
      { label: 'Pressurização Interna', value: '1.00 atm (O2/N2)' },
      { label: 'Pesquisadores no Setor', value: '8 em trânsito' },
      { label: 'Eclusa Principal', value: 'Conectada ao Núcleo' },
      { label: 'Visibilidade da Pista', value: '100% Panorâmica' },
    ],
  },
  {
    id: 'portal',
    takeId: 'portal',
    title: 'Portal de Voo para o Vácuo Espacial',
    subtitle: 'Saída Desobstruída para a Órbita Baixa',
    x: 0.86,
    y: 0.32,
    status: 'nominal',
    icon: ShieldCheck,
    metrics: [
      { label: 'Campo de Força Hexagonal', value: 'Ativo (99.8%)' },
      { label: 'Vetor de Decolagem', value: 'Livre / Trajetória 04' },
      { label: 'Balizadores de Proa', value: 'Estrobos Sincronizados' },
      { label: 'Vácuo Externo', value: '10⁻¹¹ Torr' },
    ],
  },
]

export default function HangarScene() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const worldRef = useRef<Container | null>(null)
  const bgSpriteRef = useRef<Sprite | null>(null)

  const [activeTake, setActiveTake] = useState<HangarTake>('overview')
  const [activeHotspot, setActiveHotspot] = useState<HotspotData | null>(HOTSPOTS[0])
  const [showHotspots, setShowHotspots] = useState(true)
  const [isAutoTour, setIsAutoTour] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(100)

  // Camera animation target ref
  const cameraRef = useRef({
    targetX: 0,
    targetY: 0,
    targetScale: 1,
    isTransitioning: false,
    baseScale: 1,
  })

  // Apply a Take
  const applyTake = (takeId: HangarTake) => {
    setActiveTake(takeId)
    const cfg = TAKES.find((t) => t.id === takeId)
    if (!cfg || !appRef.current || !bgSpriteRef.current) return

    const app = appRef.current
    const bg = bgSpriteRef.current
    const baseScale = cameraRef.current.baseScale
    const targetScale = baseScale * cfg.zoomMultiplier

    // Calculate world position to center the target point on screen
    const targetX = app.screen.width / 2 - cfg.relX * bg.width * targetScale
    const targetY = app.screen.height / 2 - cfg.relY * bg.height * targetScale

    cameraRef.current.targetX = targetX
    cameraRef.current.targetY = targetY
    cameraRef.current.targetScale = targetScale
    cameraRef.current.isTransitioning = true

    setZoomLevel(Math.round(cfg.zoomMultiplier * 100))
  }

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
  }, [isAutoTour])

  useEffect(() => {
    let isMounted = true
    let app: Application

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

      // Main world container for zoom & pan
      const world = new Container()
      world.eventMode = 'static'
      app.stage.addChild(world)
      worldRef.current = world

      // Load background image
      const bgTexture = await Assets.load('/assets/hangar/hangar_bg.jpg')
      const bgSprite = new Sprite(bgTexture)
      bgSprite.anchor.set(0.5)
      world.addChild(bgSprite)
      bgSpriteRef.current = bgSprite

      // Calculate initial fit
      const initialScale = Math.min(
        app.screen.width / bgSprite.width,
        app.screen.height / bgSprite.height,
      ) * 1.05

      cameraRef.current.baseScale = initialScale
      cameraRef.current.targetScale = initialScale
      cameraRef.current.targetX = app.screen.width / 2
      cameraRef.current.targetY = app.screen.height / 2
      world.scale.set(initialScale)
      world.x = app.screen.width / 2
      world.y = app.screen.height / 2

      // Animated beacon pulses overlay
      const pulseLayer = new Graphics()
      world.addChild(pulseLayer)

      // Landing pads
      const pads = [
        { x: bgSprite.width * (0.58 - 0.5), y: bgSprite.height * (0.58 - 0.5), radius: 56 },
        { x: bgSprite.width * (0.42 - 0.5), y: bgSprite.height * (0.76 - 0.5), radius: 48 },
        { x: bgSprite.width * (0.24 - 0.5), y: bgSprite.height * (0.68 - 0.5), radius: 44 },
      ]

      let elapsed = 0
      app.ticker.add((ticker) => {
        elapsed += ticker.deltaTime * 0.04

        // 1. Smooth Camera Transition (Lerp)
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

        // 2. Pulse Animations
        pulseLayer.clear()

        // Landing pads cyan glowing rings
        pads.forEach((pad, i) => {
          const wave = Math.sin(elapsed + i * 1.5)
          const ringAlpha = 0.25 + 0.2 * wave
          const ringRadius = pad.radius + wave * 4

          pulseLayer.circle(pad.x, pad.y, ringRadius)
          pulseLayer.stroke({ width: 2, color: 0x49b8d6, alpha: ringAlpha })

          pulseLayer.circle(pad.x, pad.y, pad.radius * 0.5)
          pulseLayer.stroke({ width: 1.5, color: 0x49b8d6, alpha: 0.15 + 0.15 * wave })
        })

        // Gateway portal forcefield shimmer
        const portalX = bgSprite.width * (0.86 - 0.5)
        const portalY = bgSprite.height * (0.34 - 0.5)
        const forcefieldWave = Math.sin(elapsed * 1.8)
        pulseLayer.ellipse(portalX, portalY, 110, 180)
        pulseLayer.stroke({
          width: 3,
          color: 0x49b8d6,
          alpha: 0.15 + 0.1 * forcefieldWave,
        })

        // Runway strobe pillars (flashing beacon lights)
        const pillarStrobe = Math.floor(elapsed * 2) % 2 === 0
        const pillars = [
          { x: bgSprite.width * (0.55 - 0.5), y: bgSprite.height * (0.38 - 0.5) },
          { x: bgSprite.width * (0.78 - 0.5), y: bgSprite.height * (0.55 - 0.5) },
          { x: bgSprite.width * (0.83 - 0.5), y: bgSprite.height * (0.42 - 0.5) },
        ]
        pillars.forEach((p, idx) => {
          const isRed = (idx + (pillarStrobe ? 1 : 0)) % 2 === 0
          pulseLayer.circle(p.x, p.y - 12, 4)
          pulseLayer.fill({
            color: isRed ? 0xf07272 : 0x49b8d6,
            alpha: 0.7 + 0.3 * Math.sin(elapsed * 4 + idx),
          })
        })
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
    }

    initPixi()

    return () => {
      isMounted = false
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
        {/* Left: Title & Takes */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-cyan-300 font-semibold">
            <Camera className="h-4 w-4" />
            TAKES DO HANGAR:
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

        {/* Right: Controls, Auto-Tour & Hotspots */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAutoTour(!isAutoTour)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono font-medium transition-colors ${
              isAutoTour
                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 animate-pulse'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Alterna automaticamente entre todos os takes cinematográficos a cada 5 segundos"
          >
            {isAutoTour ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {isAutoTour ? 'Auto-Tour Ativo' : 'Iniciar Auto-Tour'}
          </button>

          <span className="text-slate-600">|</span>

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
            title="Centralizar Visão Geral"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowHotspots(!showHotspots)}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono transition-colors ${
              showHotspots
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            {showHotspots ? 'Hotspots' : 'Ocultar'}
          </button>
        </div>
      </div>

      {/* Pixi Canvas Mount */}
      <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Interactive Overlay Hotspots on top of Pixi */}
      {showHotspots && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {HOTSPOTS.map((h) => {
            const Icon = h.icon
            const isSelected = activeHotspot?.id === h.id
            return (
              <div
                key={h.id}
                style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
                className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
              >
                <button
                  onClick={() => {
                    setActiveHotspot(isSelected ? null : h)
                    applyTake(h.takeId)
                  }}
                  className={`group relative flex items-center justify-center rounded-full p-2 transition-transform duration-200 hover:scale-125 ${
                    isSelected
                      ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/50 ring-4 ring-cyan-400/30'
                      : 'border border-cyan-400/60 bg-panel/90 text-cyan-400 hover:border-cyan-300'
                  }`}
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

      {/* Hotspot Expanded Card (Contrato de Callout do Usuário) */}
      {activeHotspot && (
        <div className="absolute right-4 bottom-4 z-30 w-84 rounded-lg border border-cyan-500/40 bg-panel/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between border-b border-edge pb-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <h4 className="text-sm font-semibold text-slate-100">{activeHotspot.title}</h4>
              </div>
              <p className="text-[11px] text-mist">{activeHotspot.subtitle}</p>
            </div>
            <button
              onClick={() => setActiveHotspot(null)}
              className="text-xs text-mist hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {activeHotspot.metrics.map((m, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="text-mist">{m.label}:</span>
                <span className="font-mono text-slate-200">{m.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-2 border-t border-edge flex items-center justify-between text-[11px]">
            <span className="text-cyan-400 font-mono">STATUS: {activeHotspot.status.toUpperCase()}</span>
            <span className="text-slate-400">Take Ativo: {activeTake.toUpperCase()}</span>
          </div>
        </div>
      )}
    </div>
  )
}
