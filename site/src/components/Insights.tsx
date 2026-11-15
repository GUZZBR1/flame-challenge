import { useEffect, useRef, useState } from 'react'
import { decisionCards, riskRank } from '../lib/api'
import {
  ALL_THEMES,
  DATASET_STATS,
  DIFF_CARDS,
  INVESTIGATIONS,
  localTactics,
  rankMaterials,
  SCENARIOS,
  THEME_LABELS,
  type Scenario,
  type TacticCard,
} from '../lib/dashboard'
import { gsap } from '../lib/scroll'
import type { RiskResult } from '../lib/risk'

const LEVEL_ORDER = ['minimal', 'low', 'moderate', 'high', 'critical']

function levelClass(level: string): string {
  const i = LEVEL_ORDER.indexOf(level)
  if (i <= 1) return 'text-[var(--ink)] opacity-70'
  if (i === 2) return 'text-[var(--ink)]'
  return 'text-[var(--accent)] font-medium'
}

/** format helpers */
const fmtO2 = (i: { conditions: { oxygenPct: [number, number] | null } }) =>
  i.conditions.oxygenPct
    ? i.conditions.oxygenPct[0] === i.conditions.oxygenPct[1]
      ? `${i.conditions.oxygenPct[0]}%`
      : `${i.conditions.oxygenPct[0]}–${i.conditions.oxygenPct[1]}%`
    : '—'
const fmtFlow = (i: { conditions: { flowCms: [number, number] | null } }) =>
  i.conditions.flowCms ? `${i.conditions.flowCms[0]}–${i.conditions.flowCms[1]}` : '—'

/** The dashboard — the three verbs the challenge asks for, each anchored
 *  to the PSI record: summarize (investigation matrix), rank (fitted
 *  risk model), interpret (counterfactual tactical cards), plus the
 *  investigation diff (what changed vs what held). */
export default function Insights() {
  const rootRef = useRef<HTMLElement>(null)
  const [theme, setTheme] = useState<string>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0])
  const [ranked, setRanked] = useState<(RiskResult & { rank: number })[]>([])
  const [engine, setEngine] = useState('local model')
  const [cards, setCards] = useState<TacticCard[]>([])
  const [evidence, setEvidence] = useState('')
  const [topMaterial, setTopMaterial] = useState('pmma')
  const [diffIdx, setDiffIdx] = useState(0)

  // rank + interpret follow the scenario; live api wins when reachable,
  // the bundled mirror (same formula) keeps the demo working offline
  useEffect(() => {
    let alive = true
    const local = rankMaterials(scenario)
    setRanked(local)
    setEngine('local model')
    const top = local[0]?.materialId ?? 'pmma'
    setTopMaterial(top)
    setCards(localTactics(top, scenario))
    setEvidence(
      `computed locally — same fitted model as the api (loc ${local[0]?.locPct}% on ${local[0]?.materialName})`,
    )
    void riskRank(scenario.o2Pct, scenario.flowCms, scenario.gravity).then(
      (live) => {
        if (!alive || !live) return
        setRanked(live.ranked.map((r, i) => ({ ...r, rank: i + 1 })))
        setEngine(`engine: ${live.engine}`)
      },
    )
    void decisionCards(top, scenario.o2Pct, scenario.flowCms, scenario.gravity).then(
      (live) => {
        if (!alive || !live) return
        setCards(
          live.cards.map((c) => ({
            context: c.context,
            question: c.question,
            evidence: c.sources.length
              ? `nearest psi evidence: ${c.sources.join(', ')}`
              : '',
            options: c.options.map((o) => ({
              id: o.action,
              label: o.label,
              score: o.score,
              why: o.why,
              uncertainty: o.uncertainty,
            })),
          })),
        )
        setEvidence(live.briefing)
        setEngine(`engine: ${live.engine}`)
      },
    )
    return () => {
      alive = false
    }
  }, [scenario])

  // reveal choreography — same register as the other sections
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
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

  const filtered =
    theme === 'all'
      ? INVESTIGATIONS
      : INVESTIGATIONS.filter((i) => i.themes.includes(theme))
  const card = DIFF_CARDS[diffIdx]

  return (
    <section
      id="dashboard"
      ref={rootRef}
      aria-labelledby="dashboard-title"
      className="relative scroll-mt-24 px-5 pb-28 pt-10 sm:px-10 lg:px-16"
    >
      <div className="mx-auto max-w-6xl">
        <div
          data-reveal
          className="flex items-baseline gap-6 font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70 sm:gap-8"
        >
          <span className="cursor-default transition-colors duration-300 hover:text-[var(--accent)] hover:opacity-100">
            the dashboard
          </span>
          <span className="hidden cursor-default font-semibold transition-colors duration-300 hover:text-[var(--accent)] sm:inline">
            summarize · rank · interpret — the three verbs of the brief
          </span>
        </div>

        <h2
          id="dashboard-title"
          data-reveal
          className="m-0 mt-4 cursor-default font-[family-name:var(--font-display)] text-[clamp(2rem,4.4vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.03em] text-[var(--ink)] transition-colors duration-300 hover:text-[var(--accent)]"
        >
          one dataset, three jobs
        </h2>
        <p
          data-reveal
          className="mt-6 max-w-2xl text-[clamp(13px,1.15vw,15px)] leading-[1.75] text-[var(--ink)] opacity-80"
        >
          the brief asks for a dashboard that summarizes, ranks and
          interprets the psi corpus. every number below is either a real
          test run or the fitted model on top of it — nothing is invented
          for the demo. offline? the bundled mirror of the same model
          takes over seamlessly.
        </p>

        {/* ============ 01 · SUMMARIZE ============ */}
        <div className="pt-16">
          <div
            data-reveal
            className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
          >
            <div className="font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
              <span className="text-[var(--accent)]">01</span> · summarize — the psi investigation matrix
            </div>
            <div className="font-mono text-[10.5px] lowercase tracking-[0.16em] text-[var(--ink)] opacity-60">
              {DATASET_STATS.investigations} investigations · {DATASET_STATS.psiRuns} parsed runs ·{' '}
              {DATASET_STATS.verified} pipeline-verified
            </div>
          </div>

          {/* theme filter — the names the brief calls out */}
          <div data-reveal className="mt-5 flex flex-wrap gap-2">
            {['all', ...ALL_THEMES].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                aria-pressed={theme === t}
                className={`cursor-pointer rounded-full border px-3 py-1 font-mono text-[10.5px] lowercase tracking-[0.14em] transition-colors duration-200 ${
                  theme === t
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--edge)] text-[var(--ink)] opacity-70 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:opacity-100'
                }`}
              >
                {t === 'all' ? 'all' : (THEME_LABELS[t] ?? t)}
              </button>
            ))}
          </div>

          <div data-reveal className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="font-mono text-[9.5px] lowercase tracking-[0.2em] text-[var(--ink)] opacity-50">
                  <th className="border-b border-[var(--edge)] px-2 py-2 font-medium">investigation</th>
                  <th className="border-b border-[var(--edge)] px-2 py-2 font-medium">theme</th>
                  <th className="border-b border-[var(--edge)] px-2 py-2 font-medium">fuels / samples</th>
                  <th className="border-b border-[var(--edge)] px-2 py-2 font-medium">o₂</th>
                  <th className="border-b border-[var(--edge)] px-2 py-2 font-medium">flow cm/s</th>
                  <th className="border-b border-[var(--edge)] px-2 py-2 font-medium">runs</th>
                  <th className="border-b border-[var(--edge)] px-2 py-2 font-medium">verified</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const expanded = open === inv.id
                  return [
                    <tr
                      key={inv.id}
                      onClick={() => setOpen(expanded ? null : inv.id)}
                      aria-expanded={expanded}
                      className="cursor-pointer transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]"
                    >
                      <td className="border-b border-[var(--edge)] px-2 py-2.5 font-mono text-[12px] font-medium lowercase tracking-[0.1em] text-[var(--ink)]">
                        <span className="mr-2 inline-block w-3 text-[var(--accent)]">
                          {expanded ? '−' : '+'}
                        </span>
                        {inv.name.toLowerCase()}
                      </td>
                      <td className="border-b border-[var(--edge)] px-2 py-2.5 font-mono text-[10px] lowercase tracking-[0.12em] text-[var(--ink)] opacity-70">
                        {inv.themes.map((t) => THEME_LABELS[t] ?? t).join(' · ')}
                      </td>
                      <td className="max-w-[220px] truncate border-b border-[var(--edge)] px-2 py-2.5 text-[11.5px] lowercase text-[var(--ink)] opacity-75">
                        {inv.fuels.join(', ')}
                      </td>
                      <td className="border-b border-[var(--edge)] px-2 py-2.5 font-mono text-[11px] text-[var(--ink)] opacity-75">
                        {fmtO2(inv)}
                      </td>
                      <td className="border-b border-[var(--edge)] px-2 py-2.5 font-mono text-[11px] text-[var(--ink)] opacity-75">
                        {fmtFlow(inv)}
                      </td>
                      <td className="border-b border-[var(--edge)] px-2 py-2.5 font-mono text-[11px] text-[var(--ink)] opacity-75">
                        {inv.psiRuns ?? '—'}
                      </td>
                      <td className="border-b border-[var(--edge)] px-2 py-2.5 font-mono text-[11px]">
                        <span
                          className={inv.verified ? 'text-[var(--accent)]' : 'text-[var(--ink)] opacity-40'}
                          title={inv.verified ? 'pipeline-ingested psi data' : 'curated from public literature'}
                        >
                          {inv.verified ? 'psi' : 'lit'}
                        </span>
                      </td>
                    </tr>,
                    expanded ? (
                      <tr key={`${inv.id}-detail`} className="bg-[color-mix(in_srgb,var(--accent)_4%,transparent)]">
                        <td colSpan={7} className="border-b border-[var(--edge)] px-2 py-4">
                          <div className="grid gap-4 pl-7 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <div className="font-mono text-[9.5px] lowercase tracking-[0.2em] text-[var(--accent)]">
                                objectives
                              </div>
                              <ul className="m-0 mt-1.5 list-none space-y-1 p-0 text-[11.5px] leading-relaxed text-[var(--ink)] opacity-80">
                                {inv.objectives.map((o) => (
                                  <li key={o.slice(0, 32)}>· {o}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <div className="font-mono text-[9.5px] lowercase tracking-[0.2em] text-[var(--accent)]">
                                rig &amp; sensors
                              </div>
                              <p className="m-0 mt-1.5 text-[11.5px] leading-relaxed text-[var(--ink)] opacity-80">
                                {inv.apparatus}
                              </p>
                              <ul className="m-0 mt-1.5 list-none space-y-1 p-0 text-[11px] leading-relaxed text-[var(--ink)] opacity-70">
                                {inv.sensors.map((s) => (
                                  <li key={s}>· {s}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-1">
                              <div className="font-mono text-[9.5px] lowercase tracking-[0.2em] text-[var(--accent)]">
                                within-investigation variation
                              </div>
                              <p className="m-0 mt-1.5 text-[11.5px] leading-relaxed text-[var(--ink)] opacity-80">
                                <span className="opacity-60">held:</span>{' '}
                                {inv.testVariables.held.join(' · ')}
                              </p>
                              <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-[var(--ink)] opacity-80">
                                <span className="opacity-60">varied:</span>{' '}
                                {inv.testVariables.varied.join(' · ')}
                              </p>
                              <p className="m-0 mt-2 font-mono text-[10px] lowercase tracking-[0.1em] text-[var(--ink)] opacity-50">
                                {inv.platform}
                                {inv.facility ? ` · ${inv.facility}` : ''} · {inv.years}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ]
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ============ 02 · RANK ============ */}
        <div className="pt-16">
          <div
            data-reveal
            className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
          >
            <div className="font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
              <span className="text-[var(--accent)]">02</span> · rank — flammability margin by scenario
            </div>
            <div className="font-mono text-[10.5px] lowercase tracking-[0.16em] text-[var(--ink)] opacity-60">
              {engine}
            </div>
          </div>

          <div data-reveal className="mt-5 flex flex-wrap gap-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScenario(s)}
                aria-pressed={scenario.id === s.id}
                className={`cursor-pointer rounded-full border px-3 py-1 font-mono text-[10.5px] lowercase tracking-[0.14em] transition-colors duration-200 ${
                  scenario.id === s.id
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--edge)] text-[var(--ink)] opacity-70 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:opacity-100'
                }`}
                title={s.blurb}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div data-reveal className="mt-4">
            <p className="m-0 font-mono text-[10.5px] lowercase tracking-[0.16em] text-[var(--ink)] opacity-60">
              {scenario.blurb} — which material has the smallest safety margin?
            </p>
            <ul className="m-0 mt-3 list-none p-0">
              {ranked.map((r) => (
                <li
                  key={r.materialId}
                  className="grid grid-cols-[2rem_9rem_1fr_5.5rem_4.5rem] items-center gap-x-3 rounded-md px-2 py-2 transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] sm:grid-cols-[2rem_11rem_1fr_6rem_6rem_4.5rem]"
                >
                  <span className="font-mono text-[11px] text-[var(--ink)] opacity-50">
                    {String(r.rank).padStart(2, '0')}
                  </span>
                  <span className="truncate font-mono text-[12px] lowercase tracking-[0.08em] text-[var(--ink)]">
                    {r.materialName.toLowerCase()}
                  </span>
                  <span className="relative h-[3px] overflow-hidden rounded bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]">
                    <span
                      className="absolute inset-y-0 left-0 bg-[var(--accent)] transition-[width] duration-500"
                      style={{ width: `${Math.round(r.riskIndex * 100)}%` }}
                    />
                  </span>
                  <span className="hidden text-right font-mono text-[11px] text-[var(--ink)] opacity-70 sm:inline">
                    {r.margin > 0 ? `+${r.margin}` : r.margin} pt
                  </span>
                  <span
                    className="hidden text-right font-mono text-[11px] text-[var(--ink)] opacity-70 sm:inline"
                    title={
                      r.uncertainty
                        ? `90% conformal band ${(r.uncertainty.lower * 100).toFixed(0)}–${(r.uncertainty.upper * 100).toFixed(0)}% · ${r.uncertainty.scope} n=${r.uncertainty.calibrationN}`
                        : undefined
                    }
                  >
                    {(r.riskIndex * 100).toFixed(1)}
                    {r.uncertainty && (
                      <span className="opacity-60">±{(r.uncertainty.effectiveHalfwidth * 100).toFixed(0)}</span>
                    )}
                    %
                  </span>
                  <span className={`text-right font-mono text-[11px] lowercase ${levelClass(r.level)}`}>
                    {r.uncertainty?.regime === 'extrapolation' && (
                      <span
                        title="outside the calibrated psi envelope — conformal band widened (extrapolation regime)"
                        aria-label="extrapolation regime"
                        className="mr-1 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-[var(--accent)]"
                      />
                    )}
                    {r.level}
                  </span>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-2 font-mono text-[10px] lowercase tracking-[0.12em] text-[var(--ink)] opacity-50">
              margin = o₂ − loc (limiting oxygen index) · ± = 90% conformal
              band on labeled psi runs ·{' '}
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />{' '}
              extrapolation beyond the calibrated envelope · flags:{' '}
              {ranked[0]?.flags.coolFlameCapable ? 'cool-flame capable · ' : ''}
              {ranked[0]?.flags.smoldering ? 'smoldering · ' : ''}
              top hazard: {topMaterial}
            </p>

            {/* shapley attribution — what physically drives the top risk */}
            {ranked[0]?.explanation && (
              <div className="mt-6 rounded-md border border-[var(--edge)] bg-[var(--panel)] p-4">
                <div className="font-mono text-[9.5px] lowercase tracking-[0.22em] text-[var(--accent)]">
                  what drives the top risk — exact shapley attribution
                </div>
                <ul className="m-0 mt-3 list-none space-y-2 p-0">
                  {ranked[0].explanation.contributions.map((c) => (
                    <li
                      key={c.factor}
                      className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-x-3 font-mono text-[10.5px] lowercase text-[var(--ink)]"
                    >
                      <span className="opacity-60">{c.label}</span>
                      <span className="relative h-[3px] overflow-hidden rounded bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]">
                        <span
                          className={`absolute inset-y-0 left-0 ${
                            c.phi >= 0 ? 'bg-[var(--accent)]' : 'bg-[var(--link)]'
                          }`}
                          style={{ width: `${Math.min(100, Math.abs(c.share) * 100)}%` }}
                        />
                      </span>
                      <span className="text-right tabular-nums opacity-80">
                        {c.share >= 0 ? '+' : ''}
                        {(c.share * 100).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="m-0 mt-3 font-mono text-[9.5px] lowercase tracking-[0.08em] text-[var(--ink)] opacity-45">
                  signed share of the deviation from the baseline module
                  (at-loc · neutral flow · hazard-free · µg) — closed-form
                  shapley on the multiplicative model, cross-checked against
                  the shap library in validation
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ============ 03 · INTERPRET ============ */}
        <div className="pt-16">
          <div
            data-reveal
            className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
          >
            <div className="font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70">
              <span className="text-[var(--accent)]">03</span> · interpret — what the numbers say to do
            </div>
          </div>
          <p
            data-reveal
            className="m-0 mt-4 max-w-3xl font-mono text-[11px] leading-relaxed lowercase tracking-[0.05em] text-[var(--ink)] opacity-70"
          >
            {evidence}
          </p>

          <div data-reveal className="mt-6 grid gap-4 lg:grid-cols-3">
            {cards.map((c) => (
              <article
                key={c.context}
                className="rounded-md border border-[var(--edge)] bg-[var(--panel)] p-4 transition-colors duration-300 hover:border-[var(--accent)]"
              >
                <div className="font-mono text-[9.5px] lowercase tracking-[0.22em] text-[var(--accent)]">
                  {c.context}
                </div>
                <h3 className="m-0 mt-2 text-[13px] font-medium lowercase leading-snug text-[var(--ink)]">
                  {c.question}
                </h3>
                <ul className="m-0 mt-3 list-none space-y-2.5 p-0">
                  {c.options.map((o) => (
                    <li key={o.id}>
                      <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] lowercase text-[var(--ink)]">
                        <span>{o.label}</span>
                        <span
                          className="shrink-0 text-[var(--accent)]"
                          title={
                            o.uncertainty
                              ? `90% conformal band on this counterfactual · ${o.uncertainty.scope} n=${o.uncertainty.calibrationN}`
                              : undefined
                          }
                        >
                          {o.score}
                          {o.uncertainty && (
                            <span className="opacity-60">
                              ±{Math.round(o.uncertainty.effectiveHalfwidth * 100)}
                            </span>
                          )}
                          %
                        </span>
                      </div>
                      <div className="mt-1 h-[3px] overflow-hidden rounded bg-[color-mix(in_srgb,var(--ink)_12%,transparent)]">
                        <div
                          className="h-full bg-[var(--accent)] transition-[width] duration-500"
                          style={{ width: `${o.score}%` }}
                        />
                      </div>
                      <p className="m-0 mt-1 text-[10.5px] lowercase leading-relaxed text-[var(--ink)] opacity-60">
                        {o.why}
                      </p>
                    </li>
                  ))}
                </ul>
                {c.evidence && (
                  <p className="m-0 mt-3 border-t border-[var(--edge)] pt-2 font-mono text-[9.5px] lowercase tracking-[0.08em] text-[var(--ink)] opacity-50">
                    {c.evidence}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>

        {/* ============ INVESTIGATION DIFF ============ */}
        <div className="pt-16">
          <div
            data-reveal
            className="font-mono text-[11px] lowercase tracking-[0.22em] text-[var(--ink)] opacity-70"
          >
            investigation diff — what changed vs what held
          </div>
          <p
            data-reveal
            className="m-0 mt-4 max-w-2xl text-[12.5px] lowercase leading-relaxed text-[var(--ink)] opacity-75"
          >
            pairs of real test runs from the same investigation, diffed
            field by field — the experiment-design matrix the brief asks
            for.
          </p>

          <div data-reveal className="mt-5 flex flex-wrap gap-2">
            {DIFF_CARDS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setDiffIdx(i)}
                aria-pressed={diffIdx === i}
                className={`cursor-pointer rounded-full border px-3 py-1 font-mono text-[10.5px] lowercase tracking-[0.12em] transition-colors duration-200 ${
                  diffIdx === i
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-[var(--edge)] text-[var(--ink)] opacity-70 hover:border-[var(--accent)] hover:text-[var(--accent)] hover:opacity-100'
                }`}
              >
                {c.hook}
              </button>
            ))}
          </div>

          {card && (
            <div
              data-reveal
              key={card.id}
              className="mt-5 rounded-md border border-[var(--edge)] bg-[var(--panel)] p-4 sm:p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="m-0 font-mono text-[13px] font-medium lowercase tracking-[0.08em] text-[var(--ink)]">
                  {card.title}
                </h3>
                <div className="font-mono text-[10px] lowercase tracking-[0.12em] text-[var(--ink)] opacity-60">
                  {card.accessions[0] === card.accessions[1]
                    ? card.accessions[0]
                    : `${card.accessions[0]} ↔ ${card.accessions[1]}`}
                  {' · '}
                  {card.sameInvestigation ? 'same investigation' : 'cross-investigation'}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[8rem_1fr_1fr] gap-x-3 sm:grid-cols-[10rem_1fr_1fr]">
                <div className="border-b border-[var(--edge)] pb-2 font-mono text-[9.5px] lowercase tracking-[0.2em] text-[var(--ink)] opacity-50">
                  field
                </div>
                <div className="border-b border-[var(--edge)] pb-2 font-mono text-[9.5px] lowercase tracking-[0.2em] text-[var(--accent)]">
                  run {card.runA.runId}
                </div>
                <div className="border-b border-[var(--edge)] pb-2 font-mono text-[9.5px] lowercase tracking-[0.2em] text-[var(--accent)]">
                  run {card.runB.runId}
                </div>

                {card.changed.map((f) => (
                  <div key={f.field} className="contents">
                    <div className="border-b border-[var(--edge)] py-1.5 font-mono text-[11px] lowercase text-[var(--accent)]">
                      Δ {f.label}
                    </div>
                    <div className="border-b border-[var(--edge)] py-1.5 font-mono text-[11px] text-[var(--ink)]">
                      {f.a || '—'}
                    </div>
                    <div className="border-b border-[var(--edge)] py-1.5 font-mono text-[11px] text-[var(--ink)]">
                      {f.b || '—'}
                    </div>
                  </div>
                ))}
                {card.held.map((f) => (
                  <div key={f.field} className="contents">
                    <div className="border-b border-[var(--edge)] py-1.5 font-mono text-[11px] lowercase text-[var(--ink)] opacity-50">
                      = {f.label}
                    </div>
                    <div className="col-span-2 border-b border-[var(--edge)] py-1.5 font-mono text-[11px] text-[var(--ink)] opacity-50">
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>

              <p className="m-0 mt-4 border-l-2 border-[var(--accent)] pl-3 text-[12px] lowercase leading-relaxed text-[var(--ink)] opacity-85">
                {card.insight}
              </p>
              <p className="m-0 mt-3 font-mono text-[9.5px] lowercase tracking-[0.1em] text-[var(--ink)] opacity-50">
                runs {card.runA.runId} &amp; {card.runB.runId} ·{' '}
                <a
                  href={card.runA.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--link)] underline-offset-4 transition-colors duration-300 hover:text-[var(--accent)] hover:underline"
                >
                  {card.accessions.join(' / ')} on psi.nasa.gov ↗
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
