import { useEffect, useState } from 'react'
import { getArtifacts, type SiArtifact } from '../lib/artifacts'
import { navigate, scrollToSection } from '../lib/scroll'
import { emitUiCommand } from '../lib/simBus'
import { IconArrowUpRight } from './Icons'
import Button from './ui/Button'

/** the dashboards the copilot generated — white rounded cards with a
 *  confidence pill, the numbers as thick soft bars and links that
 *  re-drive the run or open the audit trail. mounted on the
 *  dashboard page; a judge watches the gallery grow as they ask. */

function followLink(a: SiArtifact, target: string): void {
  if (target === 'chamber') {
    // re-emit the run so the chamber mounts already tuned
    emitUiCommand({
      set_o2_percent: a.sim?.set_o2_percent ?? null,
      set_airflow_cm_s: a.sim?.set_airflow_cm_s ?? null,
      load_preset: a.sim?.load_preset ?? null,
      __investigation: a.sim?.load_preset ?? null,
      __origin: 'artifact',
    })
    scrollToSection('chamber')
    return
  }
  navigate(target)
}

export default function Artifacts() {
  const [items, setItems] = useState<SiArtifact[]>(() => getArtifacts())

  useEffect(() => {
    const onNew = () => setItems(getArtifacts())
    window.addEventListener('ignis:artifact', onNew)
    return () => window.removeEventListener('ignis:artifact', onNew)
  }, [])

  return (
    <div data-reveal className="pt-14">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="font-mono text-[12px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
          <span className="text-[var(--accent)]">00</span> · generated — what
          the copilot built from your questions
        </div>
        <div className="font-mono text-[11px] lowercase tracking-[0.14em] text-[var(--ink)] opacity-60">
          {items.length
            ? `${items.length} card${items.length > 1 ? 's' : ''} this session`
            : 'ask it something — cards land here'}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card-soft mt-5 flex items-center justify-between gap-4 p-6 sm:p-7">
          <p className="m-0 text-[14px] leading-relaxed text-[var(--ink)] opacity-75">
            nothing generated yet — say{' '}
            <span className="font-mono text-[var(--accent)]">
              "run saffire at nineteen percent"
            </span>{' '}
            or ask a question and the copilot files what it builds here.
          </p>
          <Button
            type="button"
            onClick={() => navigate('#si-console')}
            variant="primary"
            className="shrink-0 lowercase"
          >
            open si console
            <IconArrowUpRight size={14} />
          </Button>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {items.map((a) => (
            <article key={a.id} className="card-soft rise-in p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className={`pill pill-${a.badge.tone}`}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                  {a.badge.label}
                </span>
                <span className="truncate font-mono text-[11px] lowercase tracking-[0.1em] text-[var(--ink)] opacity-50">
                  {a.footnote ?? 'psi-grounded'}
                </span>
              </div>
              <h3 className="m-0 mt-3.5 text-[16.5px] font-medium leading-snug text-[var(--ink)]">
                {a.title}
              </h3>
              {a.rows.length > 0 && (
                <ul className="m-0 mt-4 list-none space-y-3 p-0">
                  {a.rows.map((r) => (
                    <li key={r.label}>
                      <div className="flex items-baseline justify-between gap-3 font-mono text-[13px] lowercase text-[var(--ink)]">
                        <span className="opacity-85">{r.label}</span>
                        {r.value && (
                          <span className="shrink-0 font-medium">
                            {r.value}
                          </span>
                        )}
                      </div>
                      {r.barPct != null && (
                        <div className="bar-soft mt-1.5">
                          <span
                            className="bar-fill"
                            style={{ width: `${Math.min(100, r.barPct)}%` }}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 flex flex-wrap gap-2.5">
                {a.links.map((l) => (
                  <Button
                    key={l.label}
                    type="button"
                    onClick={() => followLink(a, l.target)}
                    variant="glass"
                    size="sm"
                    className="lowercase"
                  >
                    {l.label}
                    <IconArrowUpRight size={13} />
                  </Button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
