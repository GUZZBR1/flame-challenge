import { useCallback, useEffect, useRef, useState } from 'react'
import {
  gravityRegime,
  type SiChamberState,
  type SiVoiceCommandResult,
} from '../lib/api'
import { scrollToSection } from '../lib/scroll'
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
      const nav = r.navigation
      if (nav?.scroll_to_section) scrollToSection(nav.scroll_to_section)
      if (nav?.active_filter_tag) {
        window.dispatchEvent(
          new CustomEvent('ignis:filter', {
            detail: { tag: nav.active_filter_tag },
          }),
        )
      }
      const sim = r.simulation_commands
      if (sim && Object.values(sim).some((v) => v != null)) {
        // fan the executable surface out on the console's command bus —
        // SiConsole + LiveChamber already know how to retune on it
        window.dispatchEvent(
          new CustomEvent('ignis:ui-command', {
            detail: {
              set_o2_percent: sim.set_o2_percent ?? null,
              set_airflow_cm_s: sim.set_airflow_cm_s ?? null,
              load_preset: sim.load_preset ?? null,
              set_gravity:
                sim.set_gravity_g != null
                  ? gravityRegime(sim.set_gravity_g)
                  : null,
              trigger_containment: sim.trigger_containment ?? null,
              __investigation: sim.load_preset ?? null,
              __origin: 'voice-hud',
            },
          }),
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

  const line = notice ?? voice.statusLabel

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col items-end gap-1.5 font-mono text-[10.5px] lowercase tracking-[0.14em]"
      aria-live="polite"
    >
      {last?.transcript && (
        <div className="pointer-events-none border border-[var(--edge)] bg-[var(--panel)] px-2.5 py-1.5 text-[var(--ink)] opacity-90 shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_25%,transparent)]">
          <span className="text-[var(--accent)]">you:</span> {last.transcript}
        </div>
      )}
      {last?.briefing && (
        <div className="pointer-events-none border border-[var(--edge)] bg-[var(--panel)] px-2.5 py-1.5 leading-relaxed text-[var(--ink)] opacity-80 shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_25%,transparent)]">
          <span className="text-[var(--accent)]">ignis:</span> {last.briefing}
        </div>
      )}
      <div className="pointer-events-auto flex items-center gap-2 border border-[var(--edge)] bg-[var(--panel)] px-2.5 py-1.5 text-[var(--ink)] shadow-[3px_3px_0_0_color-mix(in_srgb,var(--ink)_25%,transparent)]">
        <span className={voice.recording ? 'text-[var(--accent)]' : 'opacity-60'}>
          {line}
        </span>
        <button
          type="button"
          aria-label={voice.recording ? 'release to send voice' : 'hold to talk'}
          aria-pressed={voice.recording}
          onPointerDown={() => void voice.start()}
          onPointerUp={voice.stop}
          onPointerLeave={voice.stop}
          className={`cursor-pointer border px-1.5 py-0.5 transition-colors duration-150 ${
            voice.recording
              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]'
              : 'border-[var(--edge)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
          }`}
        >
          {voice.recording ? '●' : '◉'}
        </button>
      </div>
    </div>
  )
}
