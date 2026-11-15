import { useCallback, useEffect, useRef, useState } from 'react'
import {
  gravityRegime,
  siChat,
  type SiChamberState,
  type SiVoiceCommandResult,
} from '../lib/api'
import { applyNavigation } from '../lib/scroll'
import { emitSiEntry, emitSimulationCommands, emitUiCommand } from '../lib/simBus'
import { IconKeyboard, IconMic, IconSend } from './Icons'
import Button from './ui/Button'
import { useMissionVoiceControl } from '../hooks/useMissionVoiceControl'

/**
 * Voice-first mission control HUD — always-on push-to-talk uplink.
 * Hold Space (outside text fields) or hold the mic button: the clip is
 * converted to WAV PCM16 16 kHz in-browser and shipped to
 * /api/si/voice-command; the returned navigation + simulation_commands
 * are applied app-wide through the ignis:* event channels.
 */

const DEFAULT_STATE: SiChamberState = {
  investigationId: null,
  materialId: null,
  o2Pct: 21,
  flowCms: 0,
  gravity: 'microgravity',
  module: null,
}

export default function VoiceHud() {
  const [last, setLast] = useState<SiVoiceCommandResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [textBusy, setTextBusy] = useState(false)
  // the console reports its live chamber state on request — voice
  // commands then reason over what the operator actually sees
  const stateRef = useRef<SiChamberState>(DEFAULT_STATE)
  const noticeTimer = useRef(0)

  useEffect(() => {
    const onReport = (e: Event) => {
      const s = (e as CustomEvent<SiChamberState>).detail
      if (s) stateRef.current = s
    }
    window.addEventListener('ignis:voice-state', onReport)
    // ask whoever is mounted (SiConsole) for the current state once
    window.dispatchEvent(new CustomEvent('ignis:voice-state-request'))
    return () => window.removeEventListener('ignis:voice-state', onReport)
  }, [])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const flash = useCallback((msg: string) => {
    setNotice(msg)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5200)
  }, [])

  const apply = useCallback(
    (r: SiVoiceCommandResult) => {
      setLast(r)
      // the deck's response surface carries the answer too — the HUD's
      // own bubbles are transient, the stage keeps the record
      emitSiEntry(r.transcript, r, 'voice-hud')
      const nav = r.navigation
      applyNavigation(nav)
      const sim = r.simulation_commands
      if (sim && Object.values(sim).some((v) => v != null)) {
        // fan the executable surface out on the shared command bus —
        // SiConsole + LiveChamber already know how to retune on it; the
        // bus also stashes it so a still-closed deck seeds on mount
        emitSimulationCommands(
          sim,
          'voice-hud',
          stateRef.current.investigationId ?? null,
        )
        // keep the HUD's own view of the chamber roughly in sync
        const s = stateRef.current
        stateRef.current = {
          ...s,
          ...(sim.set_o2_percent != null ? { o2Pct: sim.set_o2_percent } : {}),
          ...(sim.set_airflow_cm_s != null
            ? { flowCms: sim.set_airflow_cm_s }
            : {}),
          ...(sim.load_preset ? { investigationId: sim.load_preset } : {}),
          ...(sim.set_gravity_g != null
            ? { gravity: gravityRegime(sim.set_gravity_g) }
            : {}),
        }
      }
    },
    [],
  )

  const voice = useMissionVoiceControl({
    chamberState: () => {
      window.dispatchEvent(new CustomEvent('ignis:voice-state-request'))
      return stateRef.current
    },
    onResult: apply,
    onError: flash,
    bindSpace: true,
  })

  useEffect(() => {
    if (voice.recording) {
      window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: 'listening' } }))
    } else if (voice.busy || textBusy) {
      window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: 'thinking' } }))
    } else {
      window.dispatchEvent(new CustomEvent('ignis:si-state', { detail: { state: 'idle' } }))
    }
  }, [voice.recording, voice.busy, textBusy])

  /** the ⌨ tab — same copilot, typed. /api/si/chat already returns the
   *  full nav + simulation_commands envelope, so a typed "run saffire"
   *  navigates and relights the chamber exactly like a spoken one. */
  const sendTyped = useCallback(async () => {
    const msg = text.trim()
    if (!msg || textBusy) return
    setTextBusy(true)
    setText('')
    try {
      const resp = await siChat(msg, stateRef.current)
      applyNavigation(resp.navigation)
      const sim = resp.simulation_commands
      if (sim && Object.values(sim).some((v) => v != null)) {
        emitSimulationCommands(
          sim,
          'voice-hud',
          stateRef.current.investigationId ?? null,
        )
      } else if (resp.ui_command) {
        emitUiCommand({ ...resp.ui_command, __origin: 'voice-hud' })
      }
      // render through the same transcript/briefing bubbles as voice
      setLast({
        ...resp,
        transcript: `⌨ ${msg}`,
        stt: 'offline',
        navigation: resp.navigation ?? null,
        simulation_commands: resp.simulation_commands ?? null,
      })
      emitSiEntry(`⌨ ${msg}`, resp, 'voice-hud')
      const s = stateRef.current
      stateRef.current = {
        ...s,
        ...(sim?.set_o2_percent != null ? { o2Pct: sim.set_o2_percent } : {}),
        ...(sim?.set_airflow_cm_s != null ? { flowCms: sim.set_airflow_cm_s } : {}),
        ...(sim?.load_preset ? { investigationId: sim.load_preset } : {}),
        ...(sim?.set_gravity_g != null
          ? { gravity: gravityRegime(sim.set_gravity_g) }
          : {}),
      }
    } finally {
      setTextBusy(false)
    }
  }, [text, textBusy])

  const line = notice ?? voice.statusLabel

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-md flex-col items-end gap-2 font-mono text-[12.5px] lowercase tracking-[0.1em]"
      aria-live="polite"
    >
      {last?.transcript && (
        <div className="card-soft pointer-events-none px-3.5 py-2.5 text-[var(--ink)] opacity-90">
          <span className="text-[var(--accent)]">you:</span> {last.transcript}
        </div>
      )}
      {last?.briefing && (
        <div className="card-soft pointer-events-none px-3.5 py-2.5 leading-relaxed text-[var(--ink)] opacity-85">
          <span className="text-[var(--accent)]">ignis:</span> {last.briefing}
        </div>
      )}
      {/* invite bubble — a little nudge until the first command lands */}
      {!last && !typing && (
        <div className="hud-bob card-soft pointer-events-none relative px-3.5 py-2.5 text-[var(--ink)] opacity-95">
          <span className="text-[var(--accent)]">try now</span> — hold space
          &amp; say "run saffire"
          <span className="absolute -bottom-[5px] right-7 h-2.5 w-2.5 rotate-45 rounded-[2px] border-b border-r border-[var(--edge)] bg-[color-mix(in_srgb,#ffffff_55%,var(--bg))]" />
        </div>
      )}

      {/* ⌨ tab — the write-in path: same copilot, keyboard instead of mic */}
      {typing && (
        <form
          className="card-soft pointer-events-auto flex items-center py-1 pl-4 pr-1 text-[var(--ink)]"
          onSubmit={(e) => {
            e.preventDefault()
            void sendTyped()
          }}
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setTyping(false)
            }}
            placeholder="type a command — e.g. run saffire at 19%"
            aria-label="type a command to the copilot"
            className="w-72 bg-transparent py-2 text-[13.5px] outline-none placeholder:opacity-40"
          />
          <Button
            type="submit"
            disabled={textBusy}
            aria-label="send command"
            variant="accent"
            size="icon-sm"
            className="ml-1"
          >
            {textBusy ? '…' : <IconSend size={15} />}
          </Button>
        </form>
      )}

      <div className="card-soft pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 text-[var(--ink)]">
        <span className={voice.recording ? 'text-[var(--accent)]' : 'opacity-60'}>
          {line}
        </span>
        <Button
          type="button"
          aria-label="type a command instead"
          aria-pressed={typing}
          onClick={() => setTyping((t) => !t)}
          variant={typing ? 'accent' : 'glass'}
          size="icon-sm"
        >
          <IconKeyboard size={15} />
        </Button>
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
          size="icon-sm"
        >
          <span className={voice.recording ? '' : 'mic-pulse inline-flex'}>
            <IconMic size={15} />
          </span>
        </Button>
      </div>
    </div>
  )
}
