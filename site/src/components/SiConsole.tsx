import { useCallback, useEffect, useRef, useState } from 'react'
import {
  decisionCards,
  materialsIndex,
  riskIndex,
  siChat,
  siVoice,
  type DecisionPayload,
  type InvestigationSpec,
  type SiChamberState,
  type SiResponse,
  type SiUiCommand,
} from '../lib/api'
import type { RiskResult } from '../lib/risk'

/* recommended_action → which card + option actions it maps to */
const ACTION_MAP: Record<string, { card: string; options: string[] }> = {
  CUT_VENTILATION: { card: 'containment', options: ['cut-vent'] },
  REDUCE_O2: { card: 'atmosphere', options: ['reduce-o2', 'below-loc'] },
  COOL_AND_ISOLATE: { card: 'suppression', options: ['water-mist'] },
  SUPPRESS_LOCAL: { card: 'suppression', options: ['inert-gas'] },
}

const ACTION_LABEL: Record<string, string> = {
  CUT_VENTILATION: 'cut ventilation',
  REDUCE_O2: 'reduce o₂',
  COOL_AND_ISOLATE: 'cool & isolate',
  SUPPRESS_LOCAL: 'suppress local',
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
 *  state, re-scores risk, and highlights the matching decision card. */
export default function SiConsole() {
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
  const [recording, setRecording] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false)

  const logRef = useRef<HTMLDivElement>(null)
  const appliedTimer = useRef(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

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
      streamRef.current?.getTracks().forEach((t) => t.stop())
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
    window.speechSynthesis.speak(u)
  }, [])

  const push = useCallback((e: Omit<Entry, 'id'>) => {
    setLog((l) => [...l.slice(-24), { ...e, id: entryId++ }])
  }, [])

  /** apply a ui_command from the copilot to the live chamber state and
   *  broadcast it so any engine/scene subscriber can react too */
  const applyUiCommand = useCallback(
    (cmd: SiUiCommand) => {
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
      if (cmd.focus_module) {
        setFocusModule(cmd.focus_module)
        did.push(`focus → ${cmd.focus_module}`)
      }
      window.dispatchEvent(
        new CustomEvent('ignis:ui-command', { detail: cmd }),
      )
      if (did.length) {
        setApplied(`applied · ${did.join(' · ')}`)
        window.clearTimeout(appliedTimer.current)
        appliedTimer.current = window.setTimeout(() => setApplied(null), 5200)
      }
    },
    [specs],
  )

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
        handleResponse(resp)
      } finally {
        setBusy(false)
      }
    },
    [busy, chamberState, handleResponse, push],
  )

  /* ---------- push-to-talk ---------- */

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    setRecording(false)
  }, [])

  const startRecording = useCallback(async () => {
    if (busy || recording) return
    try {
      streamRef.current ??= await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      const rec = new MediaRecorder(streamRef.current)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType })
        if (blob.size > 400) {
          setBusy(true)
          void siVoice(blob, chamberState())
            .then((r) => {
              if (!r) {
                push({ role: 'sys', text: 'voice uplink unreachable — try text.' })
                return
              }
              if (r.transcript) {
                push({ role: 'you', text: `voice › ${r.transcript}` })
              } else {
                push({ role: 'sys', text: 'stt offline (whisper.cpp down) — answer below is from chamber state.' })
              }
              push({ role: 'ignis', text: r.response.briefing, resp: r.response })
              handleResponse(r.response)
            })
            .finally(() => setBusy(false))
        }
      }
      recorderRef.current = rec
      rec.start()
      setRecording(true)
    } catch {
      push({ role: 'sys', text: 'microphone unavailable — check browser permission.' })
    }
  }, [busy, recording, chamberState, handleResponse, push])

  const hi = highlight ? ACTION_MAP[highlight] : null
  const cardHighlighted = (id: string) => hi?.card === id
  const optionHighlighted = (cardId: string, action: string) =>
    cardHighlighted(cardId) && (hi?.options.includes(action) ?? false)

  return (
    <section
      id="mission-control"
      aria-labelledby="si-title"
      className="relative scroll-mt-24 px-5 pb-24 pt-4 sm:px-10 lg:px-16"
    >
      <div className="mx-auto max-w-6xl">
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
          a synthetic-intelligence copilot wired into the engine. every answer
          is built on the psi record first — the 3 nearest real test runs are
          attached as evidence, and its commands can retune the chamber live.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[19rem_1fr]">
          {/* chamber state — what the copilot reasons over */}
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
              {MODULES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFocusModule(focusModule === m ? null : m)}
                  className={`cursor-pointer border px-2 py-0.5 text-[11px] lowercase tracking-[0.12em] transition-colors duration-200 ${
                    focusModule === m
                      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]'
                      : 'border-[var(--edge)] text-[var(--ink)] opacity-70 hover:border-[var(--accent)] hover:opacity-100'
                  }`}
                >
                  {m}
                </button>
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

          {/* console — comms log + input + ptt */}
          <div className="border-2 border-[var(--ink)] bg-[var(--panel)] shadow-[4px_4px_0_0_color-mix(in_srgb,var(--ink)_30%,transparent)]">
            <div className="flex items-center justify-between border-b border-[var(--edge)] px-4 py-2 font-mono text-[10px] lowercase tracking-[0.2em]">
              <span className="opacity-60">comms · ignis copilot</span>
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

            <div
              ref={logRef}
              aria-live="polite"
              className="h-72 space-y-3 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed sm:h-80"
            >
              {log.map((e) =>
                e.role === 'ignis' ? (
                  <div key={e.id} className="bubble-in">
                    <p className="text-[var(--ink)]">
                      <span className="text-[var(--accent)]">ignis:</span> {e.text}
                    </p>
                    {e.resp && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] lowercase tracking-[0.12em]">
                        <span className="border border-[var(--accent)] px-1.5 py-0.5 text-[var(--accent)]">
                          {ACTION_LABEL[e.resp.recommended_action] ??
                            e.resp.recommended_action.toLowerCase()}
                        </span>
                        <span className="opacity-50">{e.resp.mode}</span>
                        {e.resp.evidence.slice(0, 2).map((ev) => (
                          <a
                            key={ev.runId}
                            href={ev.sourceUrl || undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--link)] underline-offset-4 hover:underline"
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
                        ? 'text-[var(--ink)]'
                        : 'text-[var(--ink)] opacity-50'
                    }`}
                  >
                    <span className="text-[var(--accent)]">
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
              <div className="border-t border-[var(--edge)] px-4 py-1.5 font-mono text-[10.5px] lowercase tracking-[0.14em] text-[var(--accent)]">
                {applied}
              </div>
            )}

            <form
              className="flex items-stretch border-t border-[var(--edge)]"
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
                className="min-w-0 flex-1 bg-transparent px-4 py-3 font-mono text-[12.5px] text-[var(--ink)] outline-none placeholder:lowercase placeholder:opacity-40"
              />
              <button
                type="button"
                aria-label={recording ? 'release to send voice' : 'hold to talk'}
                onPointerDown={() => void startRecording()}
                onPointerUp={stopRecording}
                onPointerLeave={stopRecording}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') void startRecording()
                }}
                onKeyUp={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') stopRecording()
                }}
                className={`w-14 cursor-pointer border-l border-[var(--edge)] font-mono text-[15px] transition-colors duration-150 ${
                  recording
                    ? 'bg-[var(--accent)] text-[var(--bg)]'
                    : 'text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] hover:text-[var(--accent)]'
                }`}
              >
                {recording ? '●' : '◉'}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="w-16 cursor-pointer border-l border-[var(--edge)] font-mono text-[11px] lowercase tracking-[0.14em] text-[var(--ink)] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] hover:text-[var(--accent)] disabled:opacity-40"
              >
                send
              </button>
            </form>
          </div>
        </div>

        {/* decision cards — the recommended action's card lights up */}
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
      </div>
    </section>
  )
}
