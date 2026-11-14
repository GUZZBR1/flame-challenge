import type { Category, HazardTag } from '../types'
import { CATEGORY_LABELS, HAZARD_LABELS } from '../lib/insights'
import { Search } from 'lucide-react'

export interface Filters {
  q: string
  category: Category | ''
  hazard: HazardTag | ''
  explorationOnly: boolean
}

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  categories: Category[]
  hazards: HazardTag[]
}

const inputCls =
  'w-full rounded-lg border border-edge bg-panel2 px-3 py-2 text-sm text-slate-200 placeholder:text-mist/60 focus:border-flame/50 focus:outline-none'

export default function FilterBar({ filters, onChange, categories, hazards }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })

  return (
    <div className="rounded-xl border border-edge bg-panel p-4">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist"
        />
        <input
          className={`${inputCls} pl-9`}
          placeholder="Search fuel, finding, platform…"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <select
          className={inputCls}
          value={filters.category}
          onChange={(e) => set({ category: e.target.value as Category | '' })}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={filters.hazard}
          onChange={(e) => set({ hazard: e.target.value as HazardTag | '' })}
        >
          <option value="">All hazards</option>
          {hazards.map((h) => (
            <option key={h} value={h}>
              {HAZARD_LABELS[h]}
            </option>
          ))}
        </select>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-mist">
        <input
          type="checkbox"
          checked={filters.explorationOnly}
          onChange={(e) => set({ explorationOnly: e.target.checked })}
          className="h-4 w-4 accent-[#ff6b35]"
        />
        Exploration-relevant only
      </label>
    </div>
  )
}
