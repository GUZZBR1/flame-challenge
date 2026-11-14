import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, History, Play } from 'lucide-react'
import data from '../data/decision_cards.json'
import { decisionScore } from '../game/decisions'
import { PRESETS } from '../game/presets'
import type { DashConditions, DecisionCard, EnvKey } from '../types'

const CARDS = (data as { cards: DecisionCard[] }).cards

const ENVS: { key: EnvKey; label: string; short: string }[] = [
  { key: 'microgravity', label: 'ISS Microgravity (0g)', short: '0g' },
  { key: 'lunar', label: 'Lunar Gateway (⅙g)', short: '⅙g' },
  { key: 'martian', label: 'Mars Transit', short: '0.38g' },
  { key: 'historical', label: 'Historical Crises', short: 'Apollo / Mir' },
  { key: 'earth', label: 'Earth Baseline (1g)', short: '1g' },
]

interface Props {
  cond: DashConditions
  onCond: (patch: Partial<DashConditions>) => void
  onApply: (presetId: string, patch: Partial<DashConditions>) => void
}

/**
 * "What could you simulate?" — environment pills + decision cards whose
 * option bars are scored live by the risk engine. Clicking an option loads
 * the matching NASA replay in the 2.5D yard and adopts its conditions.
 */
export default function SimulateBar({ cond, onCond, onApply }: Props) {
  const [open, setOpen] = useState(true)
  const scored = useMemo(
    () =>
      CARDS.map((c) => ({
        card: c,
        options: c.options.map((o) => ({ o, score: decisionScore(o.model) })),
      })),
    [],
  )

  return (
    <section className="border-b border-edge bg-panel/60 backdrop-blur">
      <div className="flex items-center gap-3 px-3 pt-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13px] font-bold tracking-wide text-white">What could you simulate?</h2>
          <span className="hidden text-[10px] text-mist md:inline">
            decision surface over real NASA PSI records — click a regime, card or option to replay it
          </span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 rounded border border-edge px-1.5 py-0.5 text-[10px] text-mist hover:text-white"
          title="Collapse the decision surface"
        >
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {open ? 'hide' : 'show'}
        </button>
      </div>

      {/* environment pills */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
        {ENVS.map((e) => {
          const active = cond.env === e.key
          return (
            <button
              key={e.key}
              onClick={() => onCond({ env: e.key, tag: e.key === 'historical' ? 'incident' : null })}
              title={e.label}
              className={`rounded-full px-3 py-1 text-[10px] font-semibold transition-colors ${
                active
                  ? 'bg-white text-void'
                  : 'border border-edge bg-transparent text-mist hover:border-mist hover:text-white'
              }`}
            >
              {e.key === 'historical' && <History className="mr-1 inline h-3 w-3" />}
              {e.label}
            </button>
          )
        })}
        <span className="mx-1 hidden h-4 w-px bg-edge sm:block" />
        <span className="text-[9px] font-semibold uppercase tracking-widest text-mist">
          official replays
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onApply(p.id, {})}
            title={`${p.tagline} — ${p.citation}`}
            className="flex items-center gap-1 rounded border border-flame/50 px-2 py-0.5 text-[10px] font-semibold text-flame hover:bg-flame/15"
          >
            <Play className="h-2.5 w-2.5" />
            {p.name.split(' — ')[0]}
          </button>
        ))}
      </div>

      {/* decision cards */}
      {open && (
        <div className="grid gap-2.5 p-3 md:grid-cols-3">
          {scored.map(({ card, options }) => (
            <div
              key={card.id}
              className="flex flex-col rounded-lg border border-edge bg-panel2 p-3 transition-colors hover:border-mist/60"
            >
              <div className="text-[9px] font-semibold uppercase tracking-widest text-mist">
                {card.context}
              </div>
              <button
                onClick={() => onApply(card.preset, {})}
                className="mt-1 text-left text-[13px] font-semibold leading-snug text-white hover:text-ice"
                title="Replay this scenario in the yard"
              >
                {card.question}
              </button>
              <div className="mt-2.5 space-y-2">
                {options.map(({ o, score }) => (
                  <button
                    key={o.label}
                    onClick={() =>
                      onApply(card.preset, {
                        env: (o.model.gravity as EnvKey) ?? cond.env,
                        o2Pct: o.model.o2Pct,
                        flowCms: o.model.flowCms,
                      })
                    }
                    className="group/opt block w-full text-left"
                    title={`${o.why} — apply ${o.model.o2Pct}% O₂ / ${o.model.flowCms} cm/s and replay`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10.5px] text-white/85 group-hover/opt:text-white">
                        {o.label}
                      </span>
                      <span className="font-mono text-[10px] text-mist">{score}%</span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-edge">
                      <div
                        className={`h-full rounded-full transition-all ${
                          score >= 60 ? 'bg-emerald-400' : score >= 30 ? 'bg-ember' : 'bg-red-400'
                        }`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                    <div className="mt-0.5 truncate text-[9px] italic text-mist/80">{o.why}</div>
                  </button>
                ))}
              </div>
              <div className="mt-auto pt-2.5">
                <div className="text-[8px] font-semibold uppercase tracking-widest text-mist/70">
                  NASA PSI sources — {card.metric} scored by the risk engine
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {card.sources.map((s) => (
                    <button
                      key={s}
                      onClick={() => onCond({ tag: s.toLowerCase() })}
                      className="rounded bg-edge/70 px-1.5 py-px text-[9px] text-mist hover:bg-ice/20 hover:text-ice"
                      title="Highlight matching records in the PSI grid"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
