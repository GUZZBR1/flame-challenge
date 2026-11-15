import { useEffect, useRef, useState } from 'react'
import {
  investigations,
  investigationDetail,
  insights,
  type Insight,
  type InvestigationCard,
  type InvestigationDetail,
} from '../lib/api'
import { gsap } from '../lib/scroll'

const PART_LABEL: Record<string, string> = {
  flammability: 'flammability',
  hiddenHazard: 'hidden hazard',
  explorationRelevance: 'exploration relevance',
  dataRichness: 'data richness',
}

const SEVERITY_DOT: Record<Insight['severity'], string> = {
  high: 'bg-[var(--accent)]',
  medium: 'bg-[var(--link)]',
  info: 'bg-[var(--ink)] opacity-40',
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] lowercase tracking-[0.14em]">
      <span className="w-36 truncate opacity-55">{label}</span>
      <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="w-8 text-right tabular-nums opacity-75">{value.toFixed(0)}</span>
    </div>
  )
}

/** Ranked investigation row — expandable to the SI detail card. */
function LeaderboardRow({ card, detail, onExpand, expanded }: {
  card: InvestigationCard
  detail: InvestigationDetail | null
  expanded: boolean
  onExpand: () => void
}) {
  return (
    <li className="rounded-md transition-colors duration-300 hover:bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]">
      <button
        type="button"
        onClick={onExpand}
        aria-expanded={expanded}
        className="grid w-full cursor-pointer grid-cols-[2.5rem_1fr_4rem] items-baseline gap-x-4 px-2 py-3 text-left sm:grid-cols-[3rem_10rem_1fr_5rem] sm:gap-x-6"
      >
        <span className="font-mono text-[12px] tabular-nums text-[var(--ink)] opacity-50">
          {String(card.rank).padStart(2, '0')}
        </span>
        <span className="font-mono text-[13px] font-medium lowercase tracking-[0.12em] text-[var(--ink)]">
          {card.name}
        </span>
        <span className="hidden sm:block">
          <span className="relative block h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
              style={{ width: `${card.score}%` }}
            />
          </span>
        </span>
        <span className="text-right font-mono text-[13px] tabular-nums text-[var(--ink)]">
          {card.score.toFixed(1)}
        </span>
      </button>

      {expanded && (
        <div className="grid gap-6 px-2 pb-5 pt-1 sm:grid-cols-[1fr_1fr] sm:px-10">
          <div>
            {Object.entries(card.breakdown).map(([k, v]) => (
              <Bar key={k} value={v} label={PART_LABEL[k] ?? k} />
            ))}
            <p className="mt-4 text-[12.5px] lowercase leading-relaxed text-[var(--ink)] opacity-80">
              {detail?.summary || card.summary}
            </p>
            {card.hazards.length > 0 && (
              <ul className="mt-3 flex list-none flex-wrap gap-2 p-0 font-mono text-[10px] lowercase tracking-[0.14em]">
                {card.hazards.map((h) => (
                  <li
                    key={h}
                    className="rounded-full border border-[color-mix(in_srgb,var(--ink)_20%,transparent)] px-2 py-0.5 opacity-70"
                  >
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="font-mono text-[11px] lowercase leading-[2] tracking-[0.1em] text-[var(--ink)] opacity-80">
            <div>
              psi runs <span className="tabular-nums">{card.stats.nRuns}</span>
              {' · '}labeled <span className="tabular-nums">{card.stats.nLabeled}</span>
            </div>
            {card.stats.coolFlameRuns > 0 && (
              <div>
                cool-flame runs{' '}
                <span className="tabular-nums text-[var(--accent)]">
                  {card.stats.coolFlameRuns}
                </span>
              </div>
            )}
            {card.engineFidelity && (
              <div>
                engine replay fidelity{' '}
                <span className="tabular-nums text-[var(--accent)]">
                  {(card.engineFidelity.accuracy * 100).toFixed(0)}%
                </span>
                <span className="opacity-50">
                  {' '}/ {card.engineFidelity.scoredRuns} runs
                </span>
              </div>
            )}
            {card.effectiveLoc != null && (
              <div>
                effective loc <span className="tabular-nums">{card.effectiveLoc}% o₂</span>
              </div>
            )}
            {detail?.material?.ignitionFitScope && (
              <div>
                ignition curve{' '}
                <span className="text-[var(--link)]">
                  {detail.material.ignitionFitScope}
                </span>
              </div>
            )}
            <div>
              <a
                href={card.psiUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--link)] underline-offset-4 transition-colors duration-300 hover:text-[var(--accent)] hover:underline"
              >
                nasa psi repository ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

/** The SI layer made visible: ranked investigations + interpreted findings. */
export default function Dashboard() {
  const rootRef = useRef<HTMLElement>(null)
  const [cards, setCards] = useState<InvestigationCard[]>([])
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [ins, setIns] = useState<Insight[]>([])
  const [live, setLive] = useState<boolean | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<InvestigationDetail | null>(null)

  useEffect(() => {
    let dead = false
    void (async () => {
      const [lb, i2] = await Promise.all([investigations(), insights()])
      if (dead) return
      setCards(lb.items)
      setWeights(lb.weights)
      setIns(i2.items)
      setLive(lb.live && i2.live)
    })()
    return () => {
      dead = true
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setDetail(null)
      return
    }
    let dead = false
    void investigationDetail(open).then((d) => {
      if (!dead) setDetail(d)
    })
    return () => {
      dead = true
    }
  }, [open])

  // same reveal convention as the rest of the page
  useEffect(() => {
    const root = rootRef.current
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 16,
          duration: 0.55,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 92%' },
        })
      })
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <section
      id="leaderboard"
      ref={rootRef}
      aria-labelledby="dashboard-title"
      className="relative px-5 pb-28 pt-6 sm:px-10 lg:px-16"
    >
      <div className="mx-auto max-w-6xl">
        <div
          data-reveal
          className="flex items-baseline justify-between gap-6 font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70"
        >
          <span className="cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100">
            mission intelligence — ranked investigations
          </span>
          {live !== null && (
            <span className="cursor-default opacity-60">
              {live ? 'live engine' : 'baked snapshot — backend offline'}
            </span>
          )}
        </div>

        <h2
          id="dashboard-title"
          data-reveal
          className="m-0 mt-6 cursor-default font-[family-name:var(--font-display)] text-[clamp(1.6rem,3.2vw,2.6rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--ink)] transition-colors duration-300 hover:text-[var(--accent)]"
        >
          which fire regimes deserve a crew's attention first
        </h2>
        <p data-reveal className="mt-4 max-w-3xl text-[clamp(13px,1.15vw,15px)] leading-[1.75] text-[var(--ink)] opacity-80">
          every investigation is scored on four auditable components —
          flammability{' '}
          <span className="font-mono text-[11px]">{(weights.flammability ?? 0) * 100}%</span>, hidden
          hazard{' '}
          <span className="font-mono text-[11px]">{(weights.hiddenHazard ?? 0) * 100}%</span>, exploration
          relevance{' '}
          <span className="font-mono text-[11px]">{(weights.explorationRelevance ?? 0) * 100}%</span>,
          data richness{' '}
          <span className="font-mono text-[11px]">{(weights.dataRichness ?? 0) * 100}%</span> —
          each computed from parsed psi runs, not assigned by hand.
        </p>

        <ul data-reveal className="m-0 mt-8 list-none divide-y divide-[color-mix(in_srgb,var(--ink)_10%,transparent)] p-0">
          {cards.map((c) => (
            <LeaderboardRow
              key={c.id}
              card={c}
              detail={open === c.id ? detail : null}
              expanded={open === c.id}
              onExpand={() => setOpen(open === c.id ? null : c.id)}
            />
          ))}
        </ul>

        {/* interpreted findings — the "interpret" deliverable */}
        <div data-reveal className="mt-16">
          <div className="font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
            <span className="cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100">
              interpreted findings — evidence-backed
            </span>
          </div>
          <dl className="m-0 mt-4">
            {ins.map((i) => (
              <div
                key={i.id}
                className="grid grid-cols-[1rem_1fr] items-baseline gap-x-4 rounded-md px-2 py-3 transition-colors duration-300 hover:bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]"
              >
                <span
                  className={`inline-block h-2 w-2 translate-y-[-1px] rounded-full ${SEVERITY_DOT[i.severity]}`}
                  aria-label={`severity: ${i.severity}`}
                />
                <div>
                  <dt className="font-mono text-[13px] font-medium lowercase tracking-[0.1em] text-[var(--ink)]">
                    {i.title}
                  </dt>
                  <dd className="m-0 mt-1 max-w-3xl text-[12.5px] lowercase leading-relaxed text-[var(--ink)] opacity-75">
                    {i.body}
                  </dd>
                  <dd className="m-0 mt-1 font-mono text-[10px] lowercase tracking-[0.16em] text-[var(--ink)] opacity-50">
                    sources: {i.sources.join(' · ')}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
