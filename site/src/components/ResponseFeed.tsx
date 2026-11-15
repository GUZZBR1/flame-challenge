import { useEffect, useState } from 'react'
import { navigate, scrollToSection } from '../lib/scroll'
import {
  emitUiCommand,
  getSiFeed,
  type SiFeedEntry,
} from '../lib/simBus'
import {
  ACTION_LABEL,
  cleanBriefing,
  modeLabel,
  riskBits,
} from '../lib/format'
import TypedText from './TypedText'
import { IconArrowUpRight } from './Icons'
import Button from './ui/Button'

/** the copilot's answer surface — every path that talks to it
 *  (console chat, console mic, the global HUD's voice and typed
 *  modes) files its answers on the shared feed, and they land here
 *  as soft cards: the question as the title, tool-call pills for
 *  what it did, the typed answer, risk as a number you can read
 *  from across the room. fresh exchanges sit at full ink; older
 *  ones recede over ~a minute so a long conversation stays
 *  readable instead of piling into a wall. */

const SECTION_LABEL: Record<string, string> = {
  dashboard: 'dashboard',
  'psi-dataset': 'psi dataset',
  simulations: 'simulations',
  chamber: 'chamber',
  'mission-control': 'si console',
  'si-console': 'si console',
  ask: 'the record',
}

/** entries hold full ink for ~9s, then fade over the next ~50s and
 *  floor at a readable ghost — the history never vanishes, it recedes */
function inkFor(ts: number, now: number): number {
  const age = (now - ts) / 1000
  if (age < 9) return 1
  return Math.max(0.22, 1 - (age - 9) / 50)
}

type PillTone = 'blue' | 'green' | 'slate'
interface Tool {
  label: string
  tone: PillTone
  onClick: () => void
}

/** derive the tool-call pills from the response envelope — what the
 *  copilot DID, not what it said: ran a sim, created a dashboard
 *  ranking, consulted the record */
function toolsFor(e: SiFeedEntry): Tool[] {
  const r = e.resp
  const sim = r.simulation_commands
  const tools: Tool[] = []
  if (sim && Object.values(sim).some((v) => v != null)) {
    const bits = [
      sim.load_preset ?? 'the chamber',
      sim.set_o2_percent != null ? `o₂ ${sim.set_o2_percent}%` : null,
      sim.set_airflow_cm_s != null ? `${sim.set_airflow_cm_s} cm/s` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    tools.push({
      label: `ran ${bits}`,
      tone: 'blue',
      onClick: () => {
        // re-emit the run so the chamber mounts already tuned —
        // deterministic, not a race against the pending stash's ttl
        emitUiCommand({
          set_o2_percent: sim.set_o2_percent ?? null,
          set_airflow_cm_s: sim.set_airflow_cm_s ?? null,
          load_preset: sim.load_preset ?? null,
          __investigation: sim.load_preset ?? null,
          __origin: 'feed',
        })
        scrollToSection('chamber')
      },
    })
    tools.push({
      label: 'created dashboard ranking',
      tone: 'green',
      onClick: () => {
        emitUiCommand({
          set_o2_percent: sim.set_o2_percent ?? null,
          set_airflow_cm_s: sim.set_airflow_cm_s ?? null,
          __origin: 'feed',
        })
        navigate('#dashboard')
      },
    })
  }
  const nav = r.navigation?.scroll_to_section
  if (nav) {
    tools.push({
      label: `created ${SECTION_LABEL[nav] ?? nav}`,
      tone: 'green',
      onClick: () => navigate(`#${nav}`),
    })
  }
  const n = r.evidence?.length ?? 0
  if (n > 0) {
    tools.push({
      label: `consulted psi record ×${n}`,
      tone: 'slate',
      onClick: () => navigate('#psi-dataset'),
    })
  }
  return tools
}

function Entry({ e, now }: { e: SiFeedEntry; now: number }) {
  const r = e.resp
  const { text, offline } = cleanBriefing(r.briefing)
  const risk = riskBits(r.chamber, text)
  const tools = toolsFor(e)
  const fresh = now - e.ts < 6000
  return (
    <div
      className="card-soft rise-in p-6 transition-opacity duration-1000 sm:p-8"
      style={{ opacity: inkFor(e.ts, now) }}
    >
      {e.prompt && (
        <p className="m-0 text-[15.5px] font-medium lowercase leading-snug text-[var(--ink)]">
          <span className="mr-1.5 font-mono text-[12px] lowercase text-[var(--accent)]">
            you:
          </span>
          {e.prompt}
        </p>
      )}
      {tools.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          {tools.map((t) => (
            <Button
              key={t.label}
              type="button"
              onClick={t.onClick}
              variant="chip"
              className={`pill pill-${t.tone} cursor-pointer`}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
              {t.label}
              <IconArrowUpRight size={12} />
            </Button>
          ))}
        </div>
      )}
      <p className="mt-3.5 max-w-3xl text-[15px] lowercase leading-[1.75] text-[var(--ink)]">
        <span className="mr-1.5 font-mono text-[12px] text-[var(--accent)]">
          ignis:
        </span>
        <TypedText text={text} instant={!fresh} />
      </p>
      {risk && (
        <div className="mt-4 flex items-center gap-3.5 font-mono lowercase">
          <span className="text-[var(--ink)]">
            <span className="text-[11.5px] tracking-[0.16em] opacity-60">
              risk
            </span>{' '}
            <span className="text-[24px] font-bold tracking-[-0.02em] text-[var(--accent)]">
              {risk.pct}%
            </span>
          </span>
          {risk.level && (
            <span className={`pill ${risk.pct >= 60 ? 'pill-amber' : 'pill-slate'}`}>
              {risk.level}
            </span>
          )}
          <span className="bar-soft w-28">
            <span
              className="bar-fill"
              style={{ width: `${risk.pct}%` }}
            />
          </span>
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 font-mono text-[11.5px] lowercase tracking-[0.1em] text-[var(--ink)]">
        {r.recommended_action && (
          <span className="pill pill-blue">
            {ACTION_LABEL[r.recommended_action] ??
              r.recommended_action.toLowerCase()}
          </span>
        )}
        {(offline || (r.mode && r.mode !== 'llm')) && (
          <span className="pill pill-slate opacity-80">
            {modeLabel(r.mode)}
          </span>
        )}
        {(r.evidence ?? []).slice(0, 2).map((ev) =>
          ev.sourceUrl ? (
            <a
              key={ev.runId}
              href={ev.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--link)] underline-offset-4 hover:underline"
            >
              psi {ev.accession} · {ev.similarity}%
            </a>
          ) : (
            <a
              key={ev.runId}
              href="#psi-dataset"
              onClick={(evt) => {
                evt.preventDefault()
                navigate('#psi-dataset')
              }}
              className="text-[var(--link)] underline-offset-4 hover:underline"
            >
              psi {ev.accession} · {ev.similarity}%
            </a>
          ),
        )}
      </div>
    </div>
  )
}

export default function ResponseFeed() {
  const [feed, setFeed] = useState<SiFeedEntry[]>(() => getSiFeed())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // the entry travels inside the event — the module stash only needs
    // to seed a deck that mounts later (entries fired while closed
    // render fully-typed; the 6s freshness window covers typing)
    const onEntry = (e: Event) => {
      const d = (e as CustomEvent<SiFeedEntry>).detail
      if (!d) return
      setFeed((f) => (f.some((x) => x.id === d.id) ? f : [...f, d]))
    }
    window.addEventListener('ignis:si-entry', onEntry)
    const t = window.setInterval(() => setNow(Date.now()), 1500)
    return () => {
      window.removeEventListener('ignis:si-entry', onEntry)
      window.clearInterval(t)
    }
  }, [])

  if (!feed.length) return null

  return (
    <div className="space-y-6" aria-live="polite">
      {feed.map((e) => (
        <Entry key={e.id} e={e} now={now} />
      ))}
    </div>
  )
}
