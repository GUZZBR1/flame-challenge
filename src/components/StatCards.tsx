import { Database, EyeOff, Percent, Rocket } from 'lucide-react'

interface Props {
  total: number
  minLoc: { value: number; name: string } | null
  hiddenHazards: number
  explorationRelevant: number
}

function Card({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-xl border border-edge bg-panel p-4">
      <div className="flex items-center gap-2 text-mist">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-mist">{sub}</div>
    </div>
  )
}

export default function StatCards({
  total,
  minLoc,
  hiddenHazards,
  explorationRelevant,
}: Props) {
  return (
    <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <Card
        icon={<Database size={16} />}
        label="Investigations indexed"
        value={String(total)}
        sub="NASA PSI combustion portfolio"
      />
      <Card
        icon={<Percent size={16} />}
        label="Lowest limiting O₂"
        value={minLoc ? `${minLoc.value}% O₂` : '—'}
        sub={minLoc ? `${minLoc.name} — burns below cabin 21% O₂` : 'no LOC data'}
      />
      <Card
        icon={<EyeOff size={16} />}
        label="Hidden-hazard studies"
        value={String(hiddenHazards)}
        sub="cool flames, smoldering, detection gaps"
      />
      <Card
        icon={<Rocket size={16} />}
        label="Exploration-relevant"
        value={String(explorationRelevant)}
        sub="Moon/Mars atmospheres & partial gravity"
      />
    </section>
  )
}
