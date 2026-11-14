import type { RankedInvestigation, ScoreBreakdown } from '../types'
import { CATEGORY_LABELS } from '../lib/insights'

const SEGMENTS: { key: keyof ScoreBreakdown; color: string; label: string; max: number }[] = [
  { key: 'flammability', color: '#ff6b35', label: 'Flammability', max: 40 },
  { key: 'hiddenHazard', color: '#ffb347', label: 'Hidden hazard', max: 25 },
  { key: 'relevance', color: '#67e8f9', label: 'Exploration relevance', max: 20 },
  { key: 'dataRichness', color: '#8b94a7', label: 'Data richness', max: 15 },
]

function ScoreBar({ score }: { score: ScoreBreakdown }) {
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-edge"
      title={SEGMENTS.map((s) => `${s.label}: ${Math.round(score[s.key])}/${s.max}`).join(' · ')}
    >
      {SEGMENTS.map((s) => (
        <div
          key={s.key}
          style={{ width: `${(score[s.key] / s.max) * 25}%`, background: s.color }}
        />
      ))}
    </div>
  )
}

interface Props {
  ranked: RankedInvestigation[]
  selectedId: string | undefined
  onSelect: (id: string) => void
}

export default function RankingTable({ ranked, selectedId, onSelect }: Props) {
  if (ranked.length === 0) {
    return (
      <div className="rounded-xl border border-edge bg-panel p-6 text-center text-sm text-mist">
        No investigations match the current filters.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-panel">
      <div className="border-b border-edge px-4 py-3 text-xs font-semibold uppercase tracking-wide text-mist">
        Safety risk ranking
      </div>
      <ul className="divide-y divide-edge">
        {ranked.map((r) => {
          const active = r.inv.id === selectedId
          return (
            <li key={r.inv.id}>
              <button
                onClick={() => onSelect(r.inv.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                  active ? 'bg-flame/10' : 'hover:bg-panel2'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                    active ? 'bg-flame text-black' : 'bg-panel2 text-mist'
                  }`}
                >
                  {r.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-white">
                      {r.inv.name}
                    </span>
                    <span className="shrink-0 rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-mist">
                      {CATEGORY_LABELS[r.inv.category]}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ScoreBar score={r.score} />
                    <span className="shrink-0 text-xs font-semibold text-ember">
                      {r.score.total}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-3 border-t border-edge px-4 py-2 text-[10px] text-mist">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#ff6b35]" />Flammability</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#ffb347]" />Hidden hazard</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#67e8f9]" />Relevance</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#8b94a7]" />Data</span>
      </div>
    </div>
  )
}
