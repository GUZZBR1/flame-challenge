import { useEffect, useRef, useState } from 'react'
import { Application, Container, Sprite, Graphics, Assets } from 'pixi.js'
import { Play, Pause, Compass, Zap, Eye, Rocket, Sparkles, Gauge } from 'lucide-react'

export interface ShipyardSpaceSceneProps {
  className?: string
}

type TakeMode = 'macro' | 'patrol' | 'toroidal' | 'thrusters' | 'thrusters-close' | 'thrusters-burn' | 'comets'

export default function ShipyardSpaceScene({ className = '' }: ShipyardSpaceSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [take, setTake] = useState<TakeMode>('macro')
  const [isPlaying, setIsPlaying] = useState<boolean>(true)
  const [showThrusters, setShowThrusters] = useState<boolean>(true)
  const [cometFrequency, setCometFrequency] = useState<'normal' | 'high'>('normal')
  const [activeSpeed, setActiveSpeed] = useState<number>(1)
  const [loaded, setLoaded] = useState<boolean>(false)

  // Mutable refs to pass state to Pixi ticker
  const stateRef = useRef({
    take: 'macro' as TakeMode,
    isPlaying: true,
    showThrusters: true,
    cometFrequency: 'normal' as 'normal' | 'high',
    speed: 1,
  })

  useEffect(() => {
    stateRef.current.take = take
    stateRef.current.isPlaying = isPlaying
    stateRef.current.showThrusters = showThrusters
    stateRef.current.cometFrequency = cometFrequency
    stateRef.current.speed = activeSpeed
  }, [take, isPlaying, showThrusters, cometFrequency, activeSpeed])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.repeat || target?.closest('button, a, input, textarea, select, [role="button"]')) return
      if (event.code === 'Space') {
        event.preventDefault()
        setIsPlaying((value) => !value)
      } else if (event.key.toLowerCase() === 't') {
        setShowThrusters((value) => !value)
      } else if (event.key.toLowerCase() === 'c') {
        setCometFrequency((value) => value === 'normal' ? 'high' : 'normal')
      } else if (event.key === '+' || event.key === '=') {
        setActiveSpeed((value) => Math.min(2, value + 0.5))
      } else if (event.key === '-') {
        setActiveSpeed((value) => Math.max(0.5, value - 0.5))
      } else if (/^[1-7]$/.test(event.key)) {
        const modes: TakeMode[] = ['macro', 'patrol', 'toroidal', 'thrusters', 'thrusters-close', 'thrusters-burn', 'comets']
        setTake(modes[Number(event.key) - 1])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const parent = containerRef.current
    if (!parent) return

    let app: Application | null = null
    let destroyed = false
    let removeResizeListener: (() => void) | null = null

    async function initPixi() {
      if (!parent) return
      const pixiApp = new Application()
      await pixiApp.init({
        width: parent.clientWidth || 1024,
        height: parent.clientHeight || 640,
        backgroundColor: 0x030612,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true,
      })

      if (destroyed) {
        pixiApp.destroy(true, { children: true })
        return
      }

      app = pixiApp
      parent.appendChild(pixiApp.canvas)

      // Load Assets
      const assetUrls = {
        stationBg: '/assets/space/estaleiro/estaleiro_bg.jpg',
        stationFg: '/assets/space/estaleiro/station_foreground.png',
        shipPatrol: '/assets/space/naves/ship_science_patrol.png',
        shipScout: '/assets/space/naves/ship_scout_interceptor.png',
        shipCargo: '/assets/space/naves/ship_heavy_cargo.png',
        shipRecon: '/assets/space/naves/ship_recon_corvette.png',
        fxIdle: '/assets/space/motores/fx_thruster_idle.png',
        fxCruising: '/assets/space/motores/fx_thruster_cruising.png',
        fxFullBurn: '/assets/space/motores/fx_thruster_full_burn.png',
        fxBoost: '/assets/space/motores/fx_thruster_boost.png',
        fxIonAmber: '/assets/space/motores/fx_thruster_ion_amber.png',
        fxCometCyan: '/assets/space/cometas/fx_comet_cyan.png',
        fxCometGold: '/assets/space/cometas/fx_comet_gold.png',
        fxCometGreen: '/assets/space/cometas/fx_comet_green.png',
        fxAsteroid: '/assets/space/asteroides/fx_asteroid_small.png',
        fxFlare: '/assets/space/motores/fx_thruster_flare.png',
      }

      const textures: Record<string, any> = {}
      for (const [k, url] of Object.entries(assetUrls)) {
        try {
          textures[k] = await Assets.load(url)
        } catch (e) {
          console.warn('Could not load texture', url, e)
        }
      }

      if (destroyed) return

      // Strict Layer Hierarchy: SHIPS & EFFECTS BEHIND STATION!
      const starLayer = new Container()
      const cometLayer = new Container()
      const bgLayer = new Container()
      const shipLayer = new Container()       // SHIPS STRICTLY BEHIND STATION!
      const effectLayer = new Container()     // THRUSTER PARTICLES BEHIND STATION!
      const stationFgLayer = new Container()  // STATION FOREGROUND OCCLUDES SHIPS!

      pixiApp.stage.addChild(starLayer)
      pixiApp.stage.addChild(bgLayer)
      pixiApp.stage.addChild(cometLayer)
      pixiApp.stage.addChild(shipLayer)
      pixiApp.stage.addChild(effectLayer)
      pixiApp.stage.addChild(stationFgLayer)

      const w = pixiApp.screen.width
      const h = pixiApp.screen.height

      // 1. Starfield
      const stars: { g: Graphics; x: number; y: number; s: number; baseA: number; speed: number }[] = []
      for (let i = 0; i < 220; i++) {
        const star = new Graphics()
        const size = Math.random() < 0.85 ? 1 : Math.random() < 0.95 ? 1.8 : 2.4
        const color = Math.random() < 0.6 ? 0xffffff : Math.random() < 0.8 ? 0x8be9fd : 0xffb86c
        star.circle(0, 0, size).fill({ color })
        const x = Math.random() * w
        const y = Math.random() * h
        const baseA = 0.35 + Math.random() * 0.65
        star.x = x
        star.y = y
        star.alpha = baseA
        starLayer.addChild(star)
        stars.push({ g: star, x, y, s: size, baseA, speed: 0.02 + Math.random() * 0.05 })
      }

      // 2. Station Background & Foreground
      let stationSprite: Sprite | null = null
      if (textures.stationBg) {
        stationSprite = new Sprite(textures.stationBg)
        stationSprite.anchor.set(0.5)
        stationSprite.x = w * 0.52
        stationSprite.y = h * 0.5
        const scale = Math.min(w / stationSprite.width, h / stationSprite.height) * 1.05
        stationSprite.scale.set(scale)
        bgLayer.addChild(stationSprite)
      }

      let stationFgSprite: Sprite | null = null
      if (textures.stationFg) {
        stationFgSprite = new Sprite(textures.stationFg)
        stationFgSprite.anchor.set(0.5)
        stationFgSprite.x = w * 0.52
        stationFgSprite.y = h * 0.5
        const scale = Math.min(w / stationFgSprite.width, h / stationFgSprite.height) * 1.05
        stationFgSprite.scale.set(scale)
        stationFgLayer.addChild(stationFgSprite)
      }

      // 3. Ships Setup — ALL FLIGHT PATHS ARE STRICTLY BEHIND THE STATION
      interface ShipEntity {
        id: string
        sprite: Sprite
        thrusters: Sprite[]
        particles: { g: Graphics; x: number; y: number; life: number; maxLife: number }[]
        t: number
        speed: number
        scale: number
        angleOffset: number
        path: (t: number) => { x: number; y: number; rot: number; speedMod: number }
      }

      const ships: ShipEntity[] = []

      // Ship 1: Science Patrol Cruiser (Upper Orbit Sweep Behind Station Rim)
      if (textures.shipPatrol) {
        const s = new Sprite(textures.shipPatrol)
        s.anchor.set(0.5, 0.5)
        const t1 = textures.fxFullBurn ? new Sprite(textures.fxFullBurn) : new Sprite()
        t1.anchor.set(0.1, 0.5)
        t1.scale.set(0.7)
        t1.blendMode = 'add'
        s.addChild(t1)

        shipLayer.addChild(s)
        ships.push({
          id: 'patrol',
          sprite: s,
          thrusters: [t1],
          particles: [],
          t: 0.15,
          speed: 0.0003,
          scale: 0.22,
          angleOffset: 0.35,
          path: (t: number) => {
            // Sweeps horizontally across upper space behind the station
            const rad = t % 1
            const px = -120 + rad * (w + 240)
            const py = h * 0.18 + Math.sin(rad * Math.PI * 2) * (h * 0.06)
            const rot = Math.atan2(
              Math.PI * 2 * Math.cos(rad * Math.PI * 2) * (h * 0.06),
              w + 240,
            )
            return { x: px, y: py, rot, speedMod: 1.0 }
          },
        })
      }

      // Ship 2: Agile Scout Interceptor (Passing through central toroidal ring hole!)
      if (textures.shipScout) {
        const s = new Sprite(textures.shipScout)
        s.anchor.set(0.5, 0.5)
        const t1 = textures.fxBoost ? new Sprite(textures.fxBoost) : new Sprite()
        t1.anchor.set(0.2, 0.5)
        t1.scale.set(0.6)
        t1.blendMode = 'add'
        s.addChild(t1)

        shipLayer.addChild(s)
        ships.push({
          id: 'scout',
          sprite: s,
          thrusters: [t1],
          particles: [],
          t: 0.45,
          speed: 0.00055,
          scale: 0.18,
          angleOffset: 0.4,
          path: (t: number) => {
            // Crosses diagonally through the toroidal void (x: 0.45w to 0.75w, y: 0.3w to 0.5w)
            const rad = t % 1
            const startX = w * 0.35
            const startY = h * 0.25
            const endX = w * 0.85
            const endY = h * 0.48
            const px = startX + (endX - startX) * rad
            const py = startY + (endY - startY) * rad
            const rot = Math.atan2(endY - startY, endX - startX)
            return { x: px, y: py, rot, speedMod: 1.3 }
          },
        })
      }

      // Ship 3: Heavy Cargo Shuttle (Distant Deep-Orbit Patrol)
      if (textures.shipCargo) {
        const s = new Sprite(textures.shipCargo)
        s.anchor.set(0.5, 0.5)
        const t1 = textures.fxIonAmber ? new Sprite(textures.fxIonAmber) : new Sprite()
        t1.anchor.set(0.1, 0.5)
        t1.scale.set(0.75)
        t1.blendMode = 'add'
        s.addChild(t1)

        shipLayer.addChild(s)
        ships.push({
          id: 'cargo',
          sprite: s,
          thrusters: [t1],
          particles: [],
          t: 0.7,
          speed: 0.00018,
          scale: 0.20,
          angleOffset: 0.35,
          path: (t: number) => {
            // Slow crawl in the top deep background
            const rad = t % 1
            const px = w + 100 - rad * (w + 200)
            const py = h * 0.12 + Math.sin(rad * Math.PI) * (h * 0.04)
            const rot = Math.PI - 0.2
            return { x: px, y: py, rot, speedMod: 0.7 }
          },
        })
      }

      // Ship 4: Recon Corvette (Passing Behind North Antennas)
      if (textures.shipRecon) {
        const s = new Sprite(textures.shipRecon)
        s.anchor.set(0.5, 0.5)
        const t1 = textures.fxCruising ? new Sprite(textures.fxCruising) : new Sprite()
        t1.anchor.set(0.1, 0.5)
        t1.scale.set(0.65)
        t1.blendMode = 'add'
        s.addChild(t1)

        shipLayer.addChild(s)
        ships.push({
          id: 'recon',
          sprite: s,
          thrusters: [t1],
          particles: [],
          t: 0.3,
          speed: 0.00045,
          scale: 0.18,
          angleOffset: 0.4,
          path: (t: number) => {
            const rad = t % 1
            const px = w * 0.8 + Math.cos(rad * Math.PI * 2) * (w * 0.25)
            const py = h * 0.25 + Math.sin(rad * Math.PI * 2) * (h * 0.12)
            const dx = -Math.sin(rad * Math.PI * 2) * (w * 0.25)
            const dy = Math.cos(rad * Math.PI * 2) * (h * 0.12)
            const rot = Math.atan2(dy, dx)
            return { x: px, y: py, rot, speedMod: 1.1 }
          },
        })
      }

      // 4. Comets System
      interface CometEntity {
        sprite: Sprite
        x: number
        y: number
        vx: number
        vy: number
        life: number
        maxLife: number
      }
      const comets: CometEntity[] = []
      const cometTextures = [textures.fxCometCyan, textures.fxCometGold, textures.fxCometGreen].filter(Boolean)

      function spawnComet() {
        if (!cometTextures.length && !textures.fxAsteroid) return
        const isAsteroid = Boolean(textures.fxAsteroid) && Math.random() < 0.22
        const tex = isAsteroid
          ? textures.fxAsteroid
          : cometTextures[Math.floor(Math.random() * cometTextures.length)]
        const cs = new Sprite(tex)
        cs.anchor.set(isAsteroid ? 0.5 : 0.2, 0.5)
        if (!isAsteroid) cs.blendMode = 'add'
        const startX = isAsteroid ? -80 : Math.random() * w * 1.2
        const startY = isAsteroid ? h * (0.12 + Math.random() * 0.18) : -60
        const angle = isAsteroid ? (Math.random() - 0.5) * 0.16 : (Math.PI / 4) + (Math.random() - 0.5) * 0.35
        const speed = isAsteroid ? 1.2 + Math.random() * 0.8 : 7 + Math.random() * 8
        const vx = Math.cos(angle) * speed
        const vy = Math.sin(angle) * speed
        const scale = isAsteroid ? 0.035 + Math.random() * 0.02 : 0.35 + Math.random() * 0.4
        cs.scale.set(scale)
        cs.rotation = angle
        cs.x = startX
        cs.y = startY
        cometLayer.addChild(cs)
        comets.push({
          sprite: cs,
          x: startX,
          y: startY,
          vx,
          vy,
          life: 0,
          maxLife: isAsteroid ? (w + 180) / Math.max(vx, 0.1) : 140 + Math.random() * 80,
        })
      }

      spawnComet()
      setLoaded(true)

      // Main Animation Loop
      let frame = 0
      let engineCycleMs = 0
      pixiApp.ticker.add((time) => {
        frame++
        const dt = time.deltaTime
        const currentSpeed = stateRef.current.speed
        const playing = stateRef.current.isPlaying
        const showThr = stateRef.current.showThrusters
        const freq = stateRef.current.cometFrequency
        const currentTake = stateRef.current.take
        const elapsedMs = time.deltaMS * currentSpeed

        stars.forEach((st) => {
          st.g.alpha = st.baseA + Math.sin(frame * st.speed) * 0.25
        })

        if (stationSprite && stationFgSprite) {
          const osc = Math.sin(frame * 0.015) * 3
          stationSprite.y = h * 0.5 + osc
          stationFgSprite.y = h * 0.5 + osc
        }

        if (playing) {
          engineCycleMs = (engineCycleMs + elapsedMs) % 8000
          // Comets update
          const spawnChance = freq === 'high' ? 0.03 : 0.009
          if (Math.random() < spawnChance * currentSpeed) {
            spawnComet()
          }

          for (let i = comets.length - 1; i >= 0; i--) {
            const c = comets[i]
            c.life += dt * currentSpeed
            c.x += c.vx * dt * currentSpeed
            c.y += c.vy * dt * currentSpeed
            c.sprite.x = c.x
            c.sprite.y = c.y
            const progress = c.life / c.maxLife
            c.sprite.alpha = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8

            if (c.life >= c.maxLife || c.x > w + 200 || c.y > h + 200) {
              cometLayer.removeChild(c.sprite)
              c.sprite.destroy()
              comets.splice(i, 1)
            }
          }

          // Ships update (STRICTLY BEHIND STATION)
          if (currentTake.startsWith('thrusters') && ships[0]?.thrusters[0]) {
            const engine = ships[0].thrusters[0]
            const burstStartMs = 7200
            const burstDurationMs = 800
            const inBurst = engineCycleMs >= burstStartMs
            const burstProgress = inBurst ? (engineCycleMs - burstStartMs) / burstDurationMs : 0
            const engineFrames = [textures.fxIdle, textures.fxCruising, textures.fxFullBurn, textures.fxBoost].filter(Boolean)
            const frameIndex = !inBurst ? 0 : burstProgress < 0.2 ? 1 : burstProgress < 0.75 ? 2 : 3
            engine.visible = showThr && inBurst
            if (engineFrames.length && inBurst) engine.texture = engineFrames[Math.min(frameIndex, engineFrames.length - 1)]
          }

          ships.forEach((ship) => {
            ship.t = (ship.t + ship.speed * currentSpeed * dt) % 1
            const pos = ship.path(ship.t)
            ship.sprite.x = pos.x
            ship.sprite.y = pos.y
            ship.sprite.scale.set(ship.scale)
            ship.sprite.rotation = pos.rot + ship.angleOffset

            // Thruster fire animations
            ship.thrusters.forEach((th) => {
              th.visible = showThr && (!currentTake.startsWith('thrusters') || th !== ships[0]?.thrusters[0] || engineCycleMs >= 7200)
              if (showThr) {
                const pulse = 1 + Math.sin(frame * 0.35 + Math.random() * 0.2) * 0.2 * pos.speedMod
                th.scale.x = (th.scale.y || 0.6) * pulse
                th.alpha = 0.85 + Math.random() * 0.15
                th.x = -ship.sprite.texture.width * 0.38
                th.y = 0
              }
            })

            // Emit glowing exhaust particles behind station
            if (showThr && Math.random() < 0.4 * currentSpeed) {
              const p = new Graphics()
              const pColor = ship.id === 'cargo' ? 0xffaa33 : 0x38bdf8
              p.circle(0, 0, 1.2 + Math.random() * 1.5).fill({ color: pColor, alpha: 0.85 })
              p.x = pos.x - Math.cos(pos.rot) * 20
              p.y = pos.y - Math.sin(pos.rot) * 20
              effectLayer.addChild(p)
              ship.particles.push({ g: p, x: p.x, y: p.y, life: 0, maxLife: 25 + Math.random() * 15 })
            }

            for (let j = ship.particles.length - 1; j >= 0; j--) {
              const pt = ship.particles[j]
              pt.life += dt
              pt.g.alpha = 1 - pt.life / pt.maxLife
              pt.g.scale.set(1 + (pt.life / pt.maxLife) * 0.7)
              if (pt.life >= pt.maxLife) {
                effectLayer.removeChild(pt.g)
                pt.g.destroy()
                ship.particles.splice(j, 1)
              }
            }
          })
        }

        // Camera / Take Adjustments
        let targetScale = 1
        let targetX = 0
        let targetY = 0

        if (currentTake === 'patrol' && ships[0]) {
          targetScale = 1.3
          targetX = w * 0.5 - ships[0].sprite.x * 1.3
          targetY = h * 0.35 - ships[0].sprite.y * 1.3
        } else if (currentTake === 'toroidal' && ships[1]) {
          targetScale = 1.45
          targetX = w * 0.5 - ships[1].sprite.x * 1.45
          targetY = h * 0.45 - ships[1].sprite.y * 1.45
        } else if (currentTake.startsWith('thrusters') && ships[0]) {
          targetScale = currentTake === 'thrusters-close' ? 1.9 : currentTake === 'thrusters-burn' ? 1.25 : 1.5
          targetX = w * 0.5 - ships[0].sprite.x * targetScale
          targetY = h * (currentTake === 'thrusters-close' ? 0.38 : 0.3) - ships[0].sprite.y * targetScale
        } else if (currentTake === 'comets') {
          targetScale = 0.95
          targetX = 0
          targetY = 0
        }

        pixiApp.stage.scale.x += (targetScale - pixiApp.stage.scale.x) * 0.05
        pixiApp.stage.scale.y += (targetScale - pixiApp.stage.scale.y) * 0.05
        pixiApp.stage.x += (targetX - pixiApp.stage.x) * 0.05
        pixiApp.stage.y += (targetY - pixiApp.stage.y) * 0.05
      })

      const onResize = () => {
        if (!parent || !pixiApp.renderer) return
        pixiApp.renderer.resize(parent.clientWidth || 1024, parent.clientHeight || 640)
      }
      window.addEventListener('resize', onResize)
      removeResizeListener = () => window.removeEventListener('resize', onResize)
    }

    initPixi()

    return () => {
      destroyed = true
      removeResizeListener?.()
      if (app) {
        app.destroy(true, { children: true })
      }
    }
  }, [])

  return (
    <div className={`relative flex flex-col overflow-hidden rounded-2xl border border-edge bg-slate-950 shadow-2xl ${className}`}>
      {/* Top Bar / Controls */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-edge/60 bg-slate-900/80 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
            <Compass size={16} />
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">
              IGNIS // Orbital Shipyard & Ships in Rear Orbit
            </h2>
            <p className="text-[10px] text-slate-400">PixiJS v8 · Ships strictly behind the shipyard · 2.5D physical occlusion</p>
          </div>
        </div>

        {/* Takes Selector */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-edge/50 bg-slate-950/60 p-1">
          <button
            onClick={() => setTake('macro')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              take === 'macro' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Take 1: Overview
          </button>
          <button
            onClick={() => setTake('patrol')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              take === 'patrol' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Take 2: Rear Patrol
          </button>
          <button
            onClick={() => setTake('toroidal')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              take === 'toroidal' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Take 3: Toroidal Center Passage
          </button>
          <button
            onClick={() => setTake('thrusters')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              take === 'thrusters' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Take 4: Engine Burn
          </button>
          <button
            onClick={() => setTake('thrusters-close')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              take === 'thrusters-close' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Take 5: Thruster Close-up
          </button>
          <button
            onClick={() => setTake('thrusters-burn')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              take === 'thrusters-burn' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Take 6: Full Burn
          </button>
          <button
            onClick={() => setTake('comets')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${
              take === 'comets' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Take 7: Background Comets
          </button>
        </div>

        {/* Action Toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowThrusters(!showThrusters)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              showThrusters
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-800 bg-slate-900 text-slate-500'
            }`}
            title="Toggle thruster flames"
          >
            <Zap size={13} />
            Thrusters
          </button>

          <button
            onClick={() => setCometFrequency(cometFrequency === 'normal' ? 'high' : 'normal')}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              cometFrequency === 'high'
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
            title="Background comet frequency"
          >
            <Sparkles size={13} />
            {cometFrequency === 'high' ? 'Comet Shower' : 'Comets'}
          </button>

          <button
            onClick={() => setActiveSpeed(activeSpeed === 1 ? 2 : activeSpeed === 2 ? 0.5 : 1)}
            className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            title="Toggle orbital speed"
          >
            <Gauge size={13} />
            {activeSpeed}x
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>

      {/* PixiJS Canvas Container */}
      <div ref={containerRef} className="relative h-[560px] w-full bg-slate-950">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-sky-400">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Rocket className="animate-bounce" size={20} />
              Loading PixiJS orbital scene (Occlusion Layers)...
            </div>
          </div>
        )}
      </div>

      {/* Bottom Info Status Bar */}
      <div className="flex items-center justify-between border-t border-edge/40 bg-slate-900/60 px-4 py-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <span>
            <strong className="text-slate-300">Active Mode:</strong> {take.toUpperCase()}
          </span>
          <span>
            <strong className="text-slate-300">Ships in Orbit:</strong> 4 ships passing BEHIND the shipyard
          </span>
          <span>
            <strong className="text-slate-300">Shipyard:</strong> Foreground Layer (Full Occlusion)
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sky-400">
          <Eye size={12} />
          <span>2.5D Orbital Physics · Particles and Toroidal Passage</span>
        </div>
      </div>
    </div>
  )
}
