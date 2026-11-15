import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { SiUiCommand } from '../lib/api'
import {
  streamChamber,
  type ChamberState,
} from '../lib/live'
import { navigate } from '../lib/scroll'
import { emitSimFrame, emitUiCommand, peekPendingUiCmd } from '../lib/simBus'
import { IconArrowUpRight } from './Icons'
import Button from './ui/Button'

/**
 * Live combustion chamber — streams the compiled C++ engine over
 * /ws/chamber at 30 Hz and draws the run on canvas. Closed-cabin mode
 * exercises the sealed atmosphere balance (O2 depletion -> emergent
 * extinction), the physics the dashboard claims.
 */

export const CHAMBER_INVESTIGATIONS = [
  { id: 'flex-2', label: 'flex-2 · heptane droplet', model: 'droplet' },
  { id: 'saffire', label: 'saffire · cotton spread', model: 'spread' },
  { id: 'bass-ii', label: 'bass-ii · pmma sphere', model: 'spread' },
  { id: 'confined-combustion', label: 'confined · thin sheet', model: 'spread' },
] as const

const INVESTIGATIONS = CHAMBER_INVESTIGATIONS

const REGIME = ['ignition', 'hot flame', 'cool flame', 'extinction', 'out']
const SPREAD_REGIME = ['preheat', 'spreading', 'cooling', 'out']

type Status = 'idle' | 'streaming' | 'done' | 'offline'

export default function LiveChamber({
  stage = false,
  children,
}: {
  stage?: boolean
  /** stage mode only — rendered between the scenario readout and the
   *  canvas; the deck's copilot answer feed lives there */
  children?: ReactNode
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [inv, setInv] = useState<string>('flex-2')
  const [o2, setO2] = useState(21)
  // null = let the engine pick the investigation's mid-range flow;
  // only an explicit copilot airflow command pins a value
  const [flow, setFlow] = useState<number | null>(null)
  const [sealed, setSealed] = useState(false)
  const [frame, setFrame] = useState<ChamberState | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [log, setLog] = useState<string[]>([])

  const stop = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  const run = useCallback(() => {
    stop()
    setFrame(null)
    setLog([])
    setStatus('streaming')
    const req = {
      investigationId: inv,
      o2Pct: o2,
      ...(flow != null ? { flowCms: flow } : {}),
      seed: 1,
      ...(sealed
        ? { volumeLiters: 50, ambientO2Pct: o2, ventPerSec: 0.0005 }
        : {}),
    }
    wsRef.current = streamChamber(
      req,
      (s) => {
        setFrame(s)
        emitSimFrame(s)
        if (s.events?.length) {
          setLog((l) => [...l.slice(-5), ...s.events!])
        }
        if (s.done) setStatus('done')
      },
      () => setStatus('offline'),
    )
    if (!wsRef.current) setStatus('offline')
  }, [inv, o2, flow, sealed, stop])

  useEffect(() => stop, [stop])

  // copilot commands retune the live chamber — SiConsole broadcasts
  // 'ignis:ui-command' after each SI answer, carrying __investigation =
  // the console's experiment. Auto-restart only when we can actually
  // synchronize that investigation; a SAME-scoped O₂ answer must not
  // respawn a FLEX heptane run under new numbers.
  const retune = useRef(false)
  // mirror of inv for the command handler — its effect closes over
  // state once, so comparisons need the ref
  const invRef = useRef(inv)
  useEffect(() => { invRef.current = inv }, [inv])

  const applyCmd = useCallback(
    (cmd: SiUiCommand & { __investigation?: string | null }) => {
      let touched = false
      const srcInv = cmd.__investigation ?? cmd.load_preset
      const runnable = srcInv != null
        && INVESTIGATIONS.some((i) => i.id === srcInv)
      const af = cmd.set_airflow_cm_s
      const hasFlow = typeof af === 'number'
      if (runnable) {
        // only a *different* investigation invalidates a pinned flow —
        // oxygen-only follow-ups on the same experiment keep it
        if (srcInv !== invRef.current && !hasFlow) setFlow(null)
        setInv(srcInv)
        touched = true
      }
      if (typeof cmd.set_o2_percent === 'number') {
        setO2(Math.round(
          Math.min(Math.max(cmd.set_o2_percent, 0), 40) * 10) / 10)
        touched = true
      }
      if (hasFlow) {
        setFlow(Math.round(Math.min(Math.max(af, 0), 40) * 10) / 10)
        touched = true
      }
      // restart only when the chamber runs the investigation the answer
      // was scoped to — otherwise the state lands for the next manual
      // run without spawning a misleading experiment
      if (touched && runnable) retune.current = true
    },
    [],
  )

  useEffect(() => {
    const onCmd = (e: Event) => {
      applyCmd(
        (e as CustomEvent<SiUiCommand & {
          __investigation?: string | null
        }>).detail ?? {},
      )
    }
    window.addEventListener('ignis:ui-command', onCmd)
    // a command that arrived in the same breath as 'go to simulations'
    // seeds this mount — voice 'run saffire' opens the deck and the
    // burn starts on its own
    const pending = peekPendingUiCmd()
    if (pending) applyCmd(pending)
    return () => window.removeEventListener('ignis:ui-command', onCmd)
  }, [applyCmd])

  // re-stream once the new parameters have landed in state
  useEffect(() => {
    if (retune.current) {
      retune.current = false
      run()
    }
  }, [run, inv, o2, flow])

  // ---------- canvas ----------
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const w = (cv.width = cv.clientWidth * devicePixelRatio)
    const h = (cv.height = cv.clientHeight * devicePixelRatio)
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.scale(devicePixelRatio, devicePixelRatio)
    const cw = cv.clientWidth
    const ch = cv.clientHeight
    const ink = getComputedStyle(document.documentElement)
      .getPropertyValue('--ink')
      .trim() || '#e8e6e0'

    if (!frame || !frame.ignited) {
      ctx.strokeStyle = ink
      ctx.globalAlpha = 0.25
      ctx.setLineDash([3, 4])
      ctx.strokeRect(cw / 2 - 60, ch / 2 - 40, 120, 80)
      ctx.setLineDash([])
      ctx.globalAlpha = 0.5
      ctx.font = '10px monospace'
      ctx.fillStyle = ink
      ctx.textAlign = 'center'
      ctx.fillText(
        status === 'streaming' ? 'igniting…' : 'stand by',
        cw / 2,
        ch / 2 + 3,
      )
      ctx.restore()
      return
    }

    const cx = cw / 2
    const cy = ch / 2

    if (frame.model === 'droplet') {
      const d = Math.max(2, (frame.dropletDMm ?? 1) * 14)
      const fr = Math.max(d, (frame.flameRMm ?? 0) * 14)
      // flame shell — hot flame amber, cool flame ghost-blue halo
      if (fr > d + 2 && frame.regime !== 4) {
        const cool = frame.coolFlame || frame.regime === 2
        const g = ctx.createRadialGradient(cx, cy, d, cx, cy, fr * 2.2)
        g.addColorStop(0, cool ? 'rgba(80,140,255,0.25)' : 'rgba(255,170,60,0.5)')
        g.addColorStop(0.6, cool ? 'rgba(80,140,255,0.10)' : 'rgba(255,120,30,0.18)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, fr * 2.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = cool ? 'rgba(120,170,255,0.6)' : 'rgba(255,190,90,0.7)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(cx, cy, fr, 0, Math.PI * 2)
        ctx.stroke()
      }
      // droplet
      ctx.fillStyle = frame.regime === 4 ? 'rgba(120,120,120,0.6)' : ink
      ctx.beginPath()
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
      ctx.fill()
      // fuel gauge
      const frac = frame.burnFraction ?? 0
      ctx.globalAlpha = 0.7
      ctx.fillStyle = ink
      ctx.fillRect(cx - 50, ch - 22, 100 * Math.min(1, frac), 2)
      ctx.strokeStyle = ink
      ctx.globalAlpha = 0.3
      ctx.strokeRect(cx - 50, ch - 22, 100, 2)
    } else {
      // solid spread: slab + advancing front
      const slabW = cw * 0.7
      const x0 = (cw - slabW) / 2
      const pos = Math.min(1, (frame.frontPosCm ?? 0) / 30)
      ctx.strokeStyle = ink
      ctx.globalAlpha = 0.4
      ctx.strokeRect(x0, cy - 6, slabW, 12)
      ctx.fillStyle = ink
      ctx.fillRect(x0, cy - 6, slabW * pos, 12)
      const fx = x0 + slabW * pos
      if (frame.regime === 1) {
        const inten = Math.min(1, frame.intensity ?? 0.5)
        const g = ctx.createRadialGradient(fx, cy, 2, fx, cy, 40)
        g.addColorStop(0, `rgba(255,180,70,${0.7 * inten})`)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(fx, cy, 40, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }, [frame, status])

  const regime = frame
    ? frame.model === 'droplet'
      ? REGIME[frame.regime] ?? '?'
      : SPREAD_REGIME[frame.regime] ?? '?'
    : '—'

  const invLabel =
    INVESTIGATIONS.find((i) => i.id === inv)?.label ?? inv

  return (
    <section
      id="chamber"
      className={`relative scroll-mt-24 ${
        stage ? '' : 'px-5 pb-28 pt-6 sm:px-10 lg:px-16'
      }`}
    >
      <div className={`flex items-baseline justify-between gap-6 font-mono lowercase tracking-[0.22em] text-[var(--ink)] opacity-70 ${stage ? 'text-[12.5px]' : 'text-[11px]'}`}>
        <span>live chamber — compiled c++ core</span>
        <span>{status === 'offline' ? 'engine offline' : `ws · 30 hz · ${status}`}</span>
      </div>
      {!stage && (
        <>
          <h2 className="m-0 mt-4 font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.2vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--ink)]">
            The engine, running.
          </h2>
          <p className="m-0 mt-1 max-w-3xl text-[12.5px] lowercase leading-relaxed text-[var(--ink)] opacity-75">
            compiled c++ physics streamed frame by frame — seal the cabin to
            watch the flame consume its own oxygen and die on the loc boundary.
          </p>
        </>
      )}

      <div className={`mt-4 grid gap-6 ${stage ? '' : 'sm:grid-cols-[1fr_16rem]'}`}>
        <div>
          {stage && (
            <div className="mb-3 font-mono text-[14px] lowercase tracking-[0.12em] text-[var(--ink)] opacity-85">
              <span className="text-[var(--accent)]">▸</span> {invLabel} · o₂{' '}
              {o2}%{flow != null ? ` · ${flow} cm/s` : ''}
              {sealed ? ' · sealed cabin' : ''}
            </div>
          )}
          {stage && children}
          {/* the stage stays empty until a command arrives — that's the
              "things appear" moment: the instrument panel materializes
              the instant the copilot retunes and relights the chamber */}
          {(!stage || status === 'streaming' || status === 'done') && (
            <>
              <canvas ref={canvasRef} className="h-64 w-full rounded-md sm:h-72" />
              {frame && (
                <div className="mt-3 flex items-baseline gap-5 font-mono text-[12.5px] lowercase text-[var(--ink)] opacity-75">
                  <span>t {frame.tSec.toFixed(1)}s</span>
                  <span>{regime}</span>
                  <span>o₂ {frame.o2Pct.toFixed(1)}%</span>
                  {sealed && <span>o₂eff {frame.o2EffPct.toFixed(1)}%</span>}
                  {frame.heatReleaseW != null && (
                    <span>{frame.heatReleaseW.toFixed(2)} w</span>
                  )}
                  {frame.spreadRateCms != null && (
                    <span>{frame.spreadRateCms.toFixed(2)} cm/s</span>
                  )}
                </div>
              )}
              {log.length > 0 && (
                <div className="mt-2 font-mono text-[10px] lowercase tracking-[0.14em] text-[var(--ink)] opacity-50">
                  {log.map((e, i) => (
                    <span key={i} className="mr-4">→ {e}</span>
                  ))}
                </div>
              )}
              {status === 'done' && (
                <a
                  href="#dashboard"
                  onClick={(e) => {
                    e.preventDefault()
                    // echo the run's parameters into the dashboard's risk
                    // ranking, then land on it — "save & show" without a
                    // second state model
                    emitUiCommand({
                      set_o2_percent: o2,
                      ...(flow != null ? { set_airflow_cm_s: flow } : {}),
                      __origin: 'chamber',
                    })
                    navigate('#dashboard')
                  }}
                  className="btn btn-ghost mt-3 h-10 px-5 text-[12.5px] lowercase"
                >
                  this run's risk, ranked in dashboard
                  <IconArrowUpRight size={14} />
                </a>
              )}
            </>
          )}
          {stage && status === 'idle' && (
            <p className="m-0 font-mono text-[13px] lowercase tracking-[0.12em] text-[var(--ink)] opacity-50">
              quiet — a copilot command lights it
            </p>
          )}
          {stage && status === 'offline' && (
            <p className="m-0 mt-3 font-mono text-[12.5px] lowercase leading-relaxed text-[var(--ink)] opacity-60">
              engine offline — start uvicorn on :8000 and ask again; the
              dashboard runs on the baked psi snapshot meanwhile.
            </p>
          )}
        </div>

        {!stage && (
        <div className="flex flex-col gap-3 font-mono text-[11px] lowercase text-[var(--ink)]">
          <label className="opacity-70">investigation</label>
          <select
            value={inv}
            onChange={(e) => {
              setInv(e.target.value)
              setFlow(null)
            }}
            className="rounded border border-[color-mix(in_srgb,var(--ink)_25%,transparent)] bg-transparent px-2 py-1.5 font-mono text-[11px] lowercase text-[var(--ink)]"
          >
            {INVESTIGATIONS.map((i) => (
              <option key={i.id} value={i.id}>{i.label}</option>
            ))}
          </select>
          <label className="mt-1 opacity-70">o₂ {o2.toFixed(0)}%</label>
          <input
            type="range"
            min={10}
            max={40}
            step={0.5}
            value={o2}
            onChange={(e) => setO2(Number(e.target.value))}
            className="accent-[var(--accent)]"
          />
          <label className="mt-1 flex items-center gap-2 opacity-80">
            <input
              type="checkbox"
              checked={sealed}
              onChange={(e) => {
                setSealed(e.target.checked)
                // a 1 mm droplet can't deplete 50 L — switch to a solid
                // spread run so the sealed demo shows real O2 depletion
                if (e.target.checked && inv === 'flex-2') setInv('saffire')
              }}
              className="accent-[var(--accent)]"
            />
            seal cabin · 50 l · 0.05%/s vent
          </label>
          <Button
            onClick={run}
            disabled={status === 'streaming'}
            variant="primary"
            className="mt-2 lowercase"
          >
            {status === 'streaming' ? 'burning…' : 'run experiment'}
          </Button>
          {status === 'offline' && (
            <p className="m-0 text-[10px] leading-relaxed opacity-60">
              backend offline — start uvicorn on :8000 to stream the engine.
              the dashboard above runs on the baked psi snapshot meanwhile.
            </p>
          )}
        </div>
        )}
      </div>
    </section>
  )
}
