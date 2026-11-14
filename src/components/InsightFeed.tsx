import type { Insight } from '../types'
import { ClipboardList, Layers, Radar, TriangleAlert, Wind } from 'lucide-react'

const KIND_ICON = {
  detection: Radar,
  materials: Layers,
  atmosphere: Wind,
  operations: ClipboardList,
} as const

const KIND_LABEL: Record<Insight['kind'], string> = {
  detection: 'Detection',
  materials: 'Materials',
  atmosphere: 'Atmosphere',
  operations: 'Operations',
}

const SEVERITY_STYLE: Record<Insight['severity'], string> = {
  critical: 'border-flame/50 bg-flame/10 text-flame',
  high: 'border-ember/40 bg-ember/10 text-ember',
  medium: 'border-ice/30 bg-ice/10 text-ice',
}

export default function InsightFeed({ insights }: { insights: Insight[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <TriangleAlert size={16} className="text-ember" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-mist">
          AI-generated fire-safety insights
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((ins) => {
          const Icon = KIND_ICON[ins.kind]
          return (
            <article
              key={ins.id}
              className={`rounded-xl border p-4 ${SEVERITY_STYLE[ins.severity].split(' ').slice(0, 2).join(' ')}`}
            >
              <div className="flex items-center gap-2">
                <Icon size={15} className="text-ember" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-mist">
                  {KIND_LABEL[ins.kind]}
                </span>
                <span
                  className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_STYLE[ins.severity]}`}
                >
                  {ins.severity}
                </span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-white">{ins.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{ins.body}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ins.sources.map((s) => (
                  <span
                    key={s}
                    className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-mist"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
