import { useCallback, useEffect, useRef, useState } from 'react'
import {
  decisionCards,
  materialsIndex,
  riskIndex,
  siChat,
  type DecisionPayload,
  type InvestigationSpec,
  type SiChamberState,
  type SiResponse,
  type SiUiCommandEvent,
} from '../lib/api'
import type { RiskResult } from '../lib/risk'
import { ACTION_LABEL, cleanBriefing, modeLabel } from '../lib/format'
import { applyNavigation } from '../lib/scroll'
import {
  emitSiEntry,
  emitSimulationCommands,
  emitUiCommand,
  peekPendingUiCmd,
} from '../lib/simBus'
import TypedText from './TypedText'
import { IconMic, IconSend } from './Icons'
import { useMissionVoiceControl } from '../hooks/useMissionVoiceControl'
import Button from './ui/Button'
import AsciiBrain from './AsciiBrain'

/* recommended_action → which card + option actions it maps to */
const ACTION_MAP: Record<string, { card: string; options: string[] }> = {
  CUT_VENTILATION: { card: 'containment', options: ['cut-vent'] },
  REDUCE_O2: { card: 'atmosphere', options: ['reduce-o2', 'below-loc'] },
  COOL_AND_ISOLATE: { card: 'suppression', options: ['water-mist'] },
  SUPPRESS_LOCAL: { card: 'suppression', options: ['inert-gas'] },
}

const MODULES = ['lab', 'fab', 'dock', 'hab']
const GRAVITIES = ['microgravity', 'lunar', 'martian', 'earth']

const LEVEL_TONE: Record<string, string> = {
  minimal: 'text-[var(--ink)]',
  low: 'text-[var(--ink)]',
  moderate: 'text-[var(--link)]',
  high: 'text-[var(--link)]',
  critical: 'text-[var(--link)]',
}

interface Entry {
  id: number
  role: 'you' | 'ignis' | 'sys'
  text: string
  resp?: SiResponse
}

let entryId = 0

/** clamp helper for ui_command values arriving over the wire */
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Mission Control SI Console — chat + push-to-talk voice against the
 *  /api/si copilot. Applies returned ui_command live to the chamber
 *  state, re-scores risk, and highlights the matching decision card.
 *  slim=true (inside the simulations deck) hides the chamber-state
 *  panel — the live chamber owns physical controls there — while the
 *  state itself stays live for the copilot's reasoning. */
export default function SiConsole({ slim = false }: { slim?: boolean }) {
  const [specs, setSpecs] = useState<Record<string, InvestigationSpec>>({})
  const [inv, setInv] = useState('saffire')
  const [o2, setO2] = useState(24)
  const [flow, setFlow] = useState(15)
  const [gravity, setGravity] = useState('microgravity')
  const [focusModule, setFocusModule] = useState<string | null>(null)

  const [risk, setRisk] = useState<RiskResult | null>(null)
  const [cards, setCards] = useState<DecisionPayload | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)

  const [log, setLog] = useState<Entry[]>([
    {
      id: entryId++,
      role: 'sys',
      text: 'ignis copilot online — ask about the chamber, or hold the mic and talk. answers are grounded on the psi record.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false)
  const [showBrain, setShowBrain] = useState(true)
  // entries mounted with the console render full; only answers that
  // arrive while you're watching get the typewriter treatment
  const [typedIds] = useState(() => new Set(log.map((e) => e.id)))

  const logRef = useRef<HTMLDivElement>(null)
  const appliedTimer = useRef(0)

  const mat = specs[inv]?.materialId ?? 'cotton'
  const chamberState = useCallback(
    (): SiChamberState => ({
      investigationId: inv,
      materialId: mat,
      o2Pct: o2,
      flowCms: flow,
      gravity,
      module: focusModule,
    }),
    [inv, mat, o2, flow, gravity, focusModule],
  )

  useEffect(() => {
    void materialsIndex().then(setSpecs)
  }, [])

  // live risk + decision cards follow the chamber state
  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(() => {
      void riskIndex(mat, o2, flow, gravity).then((r) => {
        if (!cancelled) setRisk(r)
      })
      void decisionCards(mat, o2, flow, gravity).then((c) => {
        if (!cancelled) setCards(c)
      })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [mat, o2, flow, gravity])

  // auto-scroll the comms log
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [log])

  useEffect(
    () => () => {
      window.clearTimeout(appliedTimer.current)
      window.speechSynthesis?.cancel()
    },
    [],
  )

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.04
    u.pitch = 0.92
    u.onstart = () => {
      window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: 'speaking' } }))
    }
    u.onend = () => {
      window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: 'idle' } }))
    }
    u.onerror = () => {
      window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: 'idle' } }))
    }
    window.speechSynthesis.speak(u)
  }, [])

  const push = useCallback((e: Omit<Entry, 'id'>) => {
    setLog((l) => [...l.slice(-24), { ...e, id: entryId++ }])
  }, [])

  /** apply a ui_command from the copilot to the live chamber state and
   *  broadcast it so any engine/scene subscriber can react too.
   *  broadcast=false when the command arrived over the bus already —
   *  rebroadcasting would loop it back to every other subscriber. */
  const applyUiCommand = useCallback(
    (cmd: SiUiCommandEvent, broadcast = true) => {
      const did: string[] = []
      if (cmd.load_preset && specs[cmd.load_preset]) {
        const spec = specs[cmd.load_preset]
        setInv(cmd.load_preset)
        setO2((spec.o2Range[0] + spec.o2Range[1]) / 2)
        setFlow((spec.flowRangeCms[0] + spec.flowRangeCms[1]) / 2)
        did.push(`preset → ${cmd.load_preset}`)
      }
      if (cmd.set_o2_percent != null) {
        const v = clamp(cmd.set_o2_percent, 0, 40)
        setO2(v)
        did.push(`o₂ → ${v}%`)
      }
      if (cmd.set_airflow_cm_s != null) {
        const v = clamp(cmd.set_airflow_cm_s, 0, 40)
        setFlow(v)
        did.push(`airflow → ${v} cm/s`)
      }
      if (cmd.set_gravity && GRAVITIES.includes(cmd.set_gravity)) {
        setGravity(cmd.set_gravity)
        did.push(`gravity → ${cmd.set_gravity}`)
      }
      if (cmd.focus_module) {
        setFocusModule(cmd.focus_module)
        did.push(`focus → ${cmd.focus_module}`)
      }
      if (cmd.trigger_containment) setHighlight(cmd.trigger_containment)
      if (broadcast) {
        // carry the console's experiment so subscribers retune the SAME
        // investigation this answer was computed for, not whichever
        // preset they happen to hold — oxygen-only commands otherwise
        // restart the wrong run. Only attach it when the command tunes
        // something: a focus/containment-only broadcast must not restart
        // a running experiment
        const tunes =
          cmd.set_o2_percent != null ||
          cmd.set_airflow_cm_s != null ||
          cmd.load_preset != null
        emitUiCommand({
          ...cmd,
          __investigation: tunes
            ? (cmd.__investigation ?? cmd.load_preset ?? inv)
            : null,
          __origin: 'console',
        })
      }
      if (did.length) {
        setApplied(`applied · ${did.join(' · ')}`)
        window.clearTimeout(appliedTimer.current)
        appliedTimer.current = window.setTimeout(() => setApplied(null), 5200)
      }
    },
    [specs, inv],
  )

  // external ui_commands (the global voice HUD) retune this console too
  useEffect(() => {
    const onCmd = (e: Event) => {
      const d = (e as CustomEvent<SiUiCommandEvent>).detail
      if (!d || d.__origin === 'console') return
      applyUiCommand(d, false)
    }
    window.addEventListener('ignis:ui-command', onCmd)
    // a fresh command that landed while the deck was closed seeds this
    // mount — the console syncs to whatever the voice already ordered
    const pending = peekPendingUiCmd()
    if (pending && pending.__origin !== 'console') {
      applyUiCommand(pending, false)
    }
    return () => window.removeEventListener('ignis:ui-command', onCmd)
  }, [applyUiCommand])

  // keep the HUD posted on what the operator is looking at — it mounts
  // before this console does (the console now lives inside the deck)
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('ignis:voice-state', { detail: chamberState() }),
    )
  }, [chamberState])

  // voice uplink state probe — the HUD asks, the console reports what
  // the operator is actually looking at
  useEffect(() => {
    const onReq = () => {
      window.dispatchEvent(
        new CustomEvent('ignis:voice-state', { detail: chamberState() }),
      )
    }
    window.addEventListener('ignis:voice-state-request', onReq)
    return () => window.removeEventListener('ignis:voice-state-request', onReq)
  }, [chamberState])

  const handleResponse = useCallback(
    (resp: SiResponse) => {
      setHighlight(resp.recommended_action)
      if (resp.ui_command) applyUiCommand(resp.ui_command)
      if (voiceOn) speak(resp.briefing)
    },
    [applyUiCommand, speak, voiceOn],
  )

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || busy) return
      setInput('')
      push({ role: 'you', text })
      setBusy(true)
      try {
        const resp = await siChat(text, chamberState())
        push({ role: 'ignis', text: resp.briefing, resp })
        emitSiEntry(text, resp, 'console-chat')
        handleResponse(resp)
        // typed chat keeps the operator in the console — navigation is a
        // voice-command surface (hands-free), but simulation commands are
        // the point here: typing "run saffire at 19%" retunes and relights
        // the chamber through the same bus as the voice paths
        emitSimulationCommands(resp.simulation_commands, 'console-chat', inv)
      } finally {
        setBusy(false)
      }
    },
    [busy, chamberState, handleResponse, push],
  )

  /* ---------- push-to-talk — WAV PCM16 16kHz → /api/si/voice-command ---------- */

  const voice = useMissionVoiceControl({
    chamberState,
    onResult: (r) => {
      if (r.transcript) {
        push({ role: 'you', text: `voice › ${r.transcript}` })
      } else {
        push({
          role: 'sys',
          text: 'stt offline (whisper.cpp down) — answer below is from chamber state.',
        })
      }
      push({ role: 'ignis', text: r.briefing, resp: r })
      emitSiEntry(r.transcript, r, 'console-voice')
      handleResponse(r)
      applyNavigation(r.navigation)
      // the console's own mic must relight the chamber too — same
      // flattened sim-command mapping the global HUD uses
      emitSimulationCommands(r.simulation_commands, 'console-voice', inv)
    },
    onError: (msg) => push({ role: 'sys', text: msg }),
  })

  useEffect(() => {
    if (busy) {
      window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: 'thinking' } }))
    } else if (voice.recording) {
      window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: 'listening' } }))
    } else if (voice.busy) {
      window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: 'thinking' } }))
    } else if (!window.speechSynthesis?.speaking) {
      window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: 'idle' } }))
    }
  }, [busy, voice.recording, voice.busy])

  const hi = highlight ? ACTION_MAP[highlight] : null
  const cardHighlighted = (id: string) => hi?.card === id
  const optionHighlighted = (cardId: string, action: string) =>
    cardHighlighted(cardId) && (hi?.options.includes(action) ?? false)

  return (
    <section
      id="mission-control"
      aria-labelledby="si-title"
      className={`relative scroll-mt-24 ${
        slim ? 'pt-2' : 'px-5 pb-24 pt-4 sm:px-10 lg:px-16'
      }`}
    >
      <div className={slim ? '' : 'mx-auto max-w-6xl'}>
        {!slim && (
          <>
            <div className="font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
              <span className="cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100">
                mission control — si console
              </span>
            </div>
            <h2
              id="si-title"
              className="mt-4 cursor-default font-[family-name:var(--font-display)] text-[clamp(26px,4.5vw,40px)] font-bold leading-[1.08] tracking-[-0.02em] text-[var(--ink)] transition-colors duration-300 hover:text-[var(--accent)]"
            >
              talk to the shipyard
            </h2>
            <p className="mt-5 max-w-2xl font-mono text-[13px] leading-relaxed text-[var(--ink)] opacity-80">
              a synthetic-intelligence copilot wired into the engine. every
              answer is built on the psi record first — the 3 nearest real
              test runs are attached as evidence, and its commands can retune
              the chamber live.
            </p>
          </>
        )}

        <div className={`grid gap-6 ${slim ? '' : 'mt-10 lg:grid-cols-[19rem_1fr]'}`}>
          {/* chamber state — what the copilot reasons over (hidden in
              the slim deck variant: the live chamber owns controls) */}
          {!slim && (
          <div className="border-2 border-[var(--ink)] bg-[var(--panel)] p-4 font-mono shadow-[4px_4px_0_0_color-mix(in_srgb,var(--ink)_30%,transparent)]">
            <div className="text-[10px] lowercase tracking-[0.2em] opacity-60">
              chamber state
            </div>

            <label className="mt-4 block text-[11px] lowercase tracking-[0.14em]">
              preset
              <select
                value={inv}
                onChange={(e) => {
                  const id = e.target.value
                  setInv(id)
                  const spec = specs[id]
                  if (spec) {
                    setO2((spec.o2Range[0] + spec.o2Range[1]) / 2)
                    setFlow((spec.flowRangeCms[0] + spec.flowRangeCms[1]) / 2)
                  }
                }}
                className="mt-1 w-full cursor-pointer border border-[var(--edge)] bg-transparent px-2 py-1.5 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              >
                {Object.keys(specs).length
                  ? Object.keys(specs).map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))
                  : <option value={inv}>{inv}</option>}
              </select>
            </label>

            <label className="mt-4 block text-[11px] lowercase tracking-[0.14em]">
              o₂ · {o2.toFixed(1)}%
              <input
                type="range"
                min={8}
                max={40}
                step={0.5}
                value={o2}
                onChange={(e) => setO2(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </label>

            <label className="mt-3 block text-[11px] lowercase tracking-[0.14em]">
              airflow · {flow.toFixed(1)} cm/s
              <input
                type="range"
                min={0}
                max={40}
                step={0.5}
                value={flow}
                onChange={(e) => setFlow(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </label>

            <label className="mt-3 block text-[11px] lowercase tracking-[0.14em]">
              gravity
              <select
                value={gravity}
                onChange={(e) => setGravity(e.target.value)}
                className="mt-1 w-full cursor-pointer border border-[var(--edge)] bg-transparent px-2 py-1.5 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              >
                {GRAVITIES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 text-[10px] lowercase tracking-[0.18em] opacity-60">
              module
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(focusModule && !MODULES.includes(focusModule)
                ? [...MODULES, focusModule]
                : MODULES
              ).map((m) => (
                <Button
                  key={m}
                  type="button"
                  onClick={() => setFocusModule(focusModule === m ? null : m)}
                  aria-pressed={focusModule === m}
                  variant="chip"
                >
                  {m}
                </Button>
              ))}
            </div>

            {risk && (
              <div className="mt-5 border-t border-[var(--edge)] pt-3">
                <div className="flex items-baseline justify-between text-[11px] lowercase tracking-[0.14em]">
                  <span className="opacity-60">risk index</span>
                  <span className={LEVEL_TONE[risk.level] ?? ''}>
                    {Math.round(risk.riskIndex * 100)}% · {risk.level}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-[color-mix(in_srgb,var(--ink)_10%,transparent)]">
                  <div
                    className="h-full bg-[var(--accent)] transition-[width] duration-300"
                    style={{ width: `${Math.round(risk.riskIndex * 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[10px] lowercase tracking-[0.14em] opacity-60">
                  <span>{risk.materialId}</span>
                  <span>
                    margin {risk.margin} · loc {risk.locPct}%
                  </span>
                </div>
              </div>
            )}
          </div>
          )}

          {/* console — comms log + input + ptt. in the slim deck it's
              frameless: no box, the conversation just lives on the page */}
          <div className={slim ? '' : 'border-2 border-[var(--ink)] bg-[var(--panel)] shadow-[4px_4px_0_0_color-mix(in_srgb,var(--ink)_30%,transparent)]'}>
            <div className={`flex items-center justify-between font-mono lowercase tracking-[0.2em] ${slim ? 'py-1 text-[11.5px]' : 'border-b border-[var(--edge)] px-4 py-2 text-[10px]'}`}>
              <div className="flex items-center gap-2.5">
                <span className="opacity-60">comms · ignis copilot</span>
                <Button
                  type="button"
                  onClick={() => setShowBrain((v) => !v)}
                  variant="glass"
                  size="sm"
                  className="h-6 px-2.5 text-[9.5px] font-mono lowercase tracking-wider"
                >
                  {showBrain ? 'hide 3D cortex' : 'show 3D cortex'}
                </Button>
              </div>
              {slim && risk && (
                <span className={`flex items-baseline gap-2 ${LEVEL_TONE[risk.level] ?? ''}`}>
                  <span className="text-[11px] tracking-[0.16em] opacity-60">
                    risk
                  </span>
                  <span className="text-[20px] font-bold tracking-[-0.02em] text-[var(--accent)]">
                    {Math.round(risk.riskIndex * 100)}%
                  </span>
                  <span className={`pill ${risk.level === 'critical' || risk.level === 'high' ? 'pill-amber' : 'pill-slate'}`}>
                    {risk.level}
                  </span>
                </span>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 opacity-80">
                <input
                  type="checkbox"
                  checked={voiceOn}
                  onChange={(e) => {
                    setVoiceOn(e.target.checked)
                    if (!e.target.checked) window.speechSynthesis?.cancel()
                  }}
                  className="accent-[var(--accent)]"
                />
                voice feedback
              </label>
            </div>

            {showBrain && (
              <div className="border-b border-white/10 px-2 py-1">
                <AsciiBrain compact />
              </div>
            )}

            <div
              ref={logRef}
              aria-live="polite"
              className={`overflow-y-auto leading-relaxed ${slim ? 'max-h-96 space-y-5 px-0 py-3 text-[15px]' : 'h-72 space-y-3 px-4 py-3 font-mono text-[12.5px] sm:h-80'}`}
            >
              {log.map((e) =>
                e.role === 'ignis' ? (
                  <div key={e.id} className="bubble-in">
                    <p className="text-[var(--ink)]">
                      <span className="font-mono text-[0.8em] text-[var(--accent)]">ignis:</span>{' '}
                      <TypedText
                        text={cleanBriefing(e.text).text}
                        instant={typedIds.has(e.id)}
                      />
                    </p>
                    {e.resp && (
                      <div className={`mt-1.5 flex flex-wrap items-center lowercase tracking-[0.1em] ${slim ? 'gap-x-3 gap-y-1.5 text-[11.5px]' : 'gap-x-3 gap-y-1 font-mono text-[10.5px] tracking-[0.12em]'}`}>
                        <span className={slim ? 'pill pill-blue' : 'border border-[var(--accent)] px-1.5 py-0.5 text-[var(--accent)]'}>
                          {ACTION_LABEL[e.resp.recommended_action] ??
                            e.resp.recommended_action.toLowerCase()}
                        </span>
                        {e.resp.mode !== 'llm' && (
                          <span className={slim ? 'pill pill-slate opacity-80' : 'border border-[var(--edge)] px-1.5 py-0.5 opacity-60'}>
                            {modeLabel(e.resp.mode)}
                          </span>
                        )}
                        {e.resp.evidence.slice(0, 2).map((ev) => (
                          <a
                            key={ev.runId}
                            href={ev.sourceUrl || undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[var(--link)] underline-offset-4 hover:underline"
                          >
                            psi {ev.accession} · {ev.runId} · {ev.similarity}%
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p
                    key={e.id}
                    className={`bubble-in ${
                      e.role === 'you'
                        ? slim
                          ? 'ml-auto w-fit max-w-[88%] rounded-2xl bg-[color-mix(in_srgb,var(--ink)_6%,transparent)] px-4 py-2.5 text-[var(--ink)]'
                          : 'text-[var(--ink)]'
                        : `text-[var(--ink)] ${slim ? 'text-[0.85em] opacity-50' : 'opacity-50'}`
                    }`}
                  >
                    <span className="font-mono text-[0.8em] text-[var(--accent)]">
                      {e.role === 'you' ? 'you' : 'sys'}:
                    </span>{' '}
                    {e.text}
                  </p>
                ),
              )}
              {busy && (
                <p className="text-[var(--ink)] opacity-60">
                  <span className="text-[var(--accent)]">ignis:</span> thinking
                  <span className="caret-blink text-[var(--accent)]">▍</span>
                </p>
              )}
            </div>

            {applied && (
              <div className={`font-mono text-[10.5px] lowercase tracking-[0.14em] text-[var(--accent)] ${slim ? 'py-1' : 'border-t border-[var(--edge)] px-4 py-1.5'}`}>
                {applied}
              </div>
            )}

            <form
              className={`flex ${slim ? 'mt-5 items-center rounded-full border border-[var(--edge)] bg-[color-mix(in_srgb,#ffffff_72%,var(--bg))] py-1.5 pl-5 pr-1.5 shadow-[0_10px_30px_rgb(23_33_43/0.08),inset_0_1px_0_rgb(255_255_255/0.55)] backdrop-blur transition-all duration-200 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_16%,transparent),0_10px_30px_rgb(23_33_43/0.1)]' : 'items-center gap-2 border-t border-[var(--edge)] px-2 py-2'}`}
              onSubmit={(e) => {
                e.preventDefault()
                void send(input)
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="ask ignis — e.g. what kills this flame fastest?"
                aria-label="message the copilot"
                className={`min-w-0 flex-1 bg-transparent font-mono text-[var(--ink)] outline-none placeholder:lowercase placeholder:opacity-40 ${slim ? 'px-0 py-2 text-[14.5px]' : 'px-2 py-2 text-[12.5px]'}`}
              />
              <Button
                type="button"
                aria-label={voice.recording ? 'release to send voice' : 'hold to talk'}
                aria-pressed={voice.recording}
                onPointerDown={() => void voice.start()}
                onPointerUp={voice.stop}
                onPointerLeave={voice.stop}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                    e.preventDefault()
                    void voice.start()
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') voice.stop()
                }}
                variant={voice.recording ? 'recording' : 'glass'}
                size={slim ? 'icon' : 'icon-sm'}
              >
                <IconMic size={slim ? 17 : 15} />
              </Button>
              <Button
                type="submit"
                disabled={busy}
                aria-label="send message"
                variant={slim ? 'accent' : 'primary'}
                size={slim ? 'icon' : 'default'}
              >
                {slim ? <IconSend size={17} /> : 'send'}
              </Button>
            </form>
          </div>
        </div>

        {/* decision cards — the recommended action's card lights up
            (hidden in the slim deck variant: the dashboard owns the
            countermeasure surface, the comms log carries the answer) */}
        {!slim && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {(cards?.cards ?? []).map((c) => (
            <div
              key={c.id}
              className={`border-2 p-4 font-mono transition-all duration-300 ${
                cardHighlighted(c.id)
                  ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] shadow-[4px_4px_0_0_color-mix(in_srgb,var(--accent)_45%,transparent)]'
                  : 'border-[var(--ink)] bg-[var(--panel)] shadow-[4px_4px_0_0_color-mix(in_srgb,var(--ink)_30%,transparent)] opacity-80'
              }`}
            >
              <div className="text-[9.5px] lowercase tracking-[0.2em] opacity-60">
                {c.context}
              </div>
              <div className="mt-2 space-y-1.5">
                {c.options.map((o) => (
                  <div
                    key={o.action}
                    className={`border px-2 py-1.5 text-[11px] lowercase transition-colors duration-300 ${
                      optionHighlighted(c.id, o.action)
                        ? 'border-[var(--accent)] text-[var(--accent)]'
                        : 'border-[var(--edge)] text-[var(--ink)] opacity-75'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="tracking-[0.08em]">{o.label}</span>
                      <span className="shrink-0 text-[10px]">{o.score}%</span>
                    </div>
                    <div className="mt-1 h-0.5 w-full bg-[color-mix(in_srgb,var(--ink)_10%,transparent)]">
                      <div
                        className={`h-full transition-[width] duration-300 ${
                          optionHighlighted(c.id, o.action)
                            ? 'bg-[var(--accent)]'
                            : 'bg-[color-mix(in_srgb,var(--ink)_35%,transparent)]'
                        }`}
                        style={{ width: `${o.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 text-[9.5px] lowercase tracking-[0.16em] opacity-50">
                {c.sources.join(' · ')}
              </div>
            </div>
          ))}
          {!cards && (
            <div className="border-2 border-dashed border-[var(--edge)] p-4 font-mono text-[11px] lowercase tracking-[0.14em] opacity-50 md:col-span-3">
              decision cards offline — start the api for live countermeasure
              scores.
            </div>
          )}
        </div>
        )}
      </div>
    </section>
  )
}
