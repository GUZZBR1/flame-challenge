import { useMemo, useState } from 'react'
import ChartsPanel from './components/ChartsPanel'
import DetailPanel from './components/DetailPanel'
import FilterBar, { type Filters } from './components/FilterBar'
import Header from './components/Header'
import InsightFeed from './components/InsightFeed'
import RankingTable from './components/RankingTable'
import StatCards from './components/StatCards'
import { getInvestigations } from './lib/data'
import {
  buildInsights,
  CATEGORY_LABELS,
  HAZARD_LABELS,
  rankInvestigations,
} from './lib/insights'
import type { Category, HazardTag } from './types'

const EMPTY_FILTERS: Filters = {
  q: '',
  category: '',
  hazard: '',
  explorationOnly: false,
}

function App() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)

  const allRanked = useMemo(() => rankInvestigations(getInvestigations()), [])

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return allRanked.filter(({ inv }) => {
      if (filters.category && inv.category !== filters.category) return false
      if (filters.hazard && !inv.hazards.includes(filters.hazard)) return false
      if (filters.explorationOnly && !inv.conditions.explorationRelevant) return false
      if (q) {
        const haystack = [
          inv.name,
          inv.title,
          inv.platform,
          inv.facility ?? '',
          ...inv.fuels,
          ...inv.keyFindings,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [allRanked, filters])

  const selected =
    filtered.find((r) => r.inv.id === selectedId) ?? filtered[0]

  const stats = useMemo(() => {
    const locs = allRanked
      .map((r) => ({ v: r.inv.metrics.limitingOxygenPct, n: r.inv.name }))
      .filter((x): x is { v: number; n: string } => x.v !== null)
    const minLocRaw = locs.length
      ? locs.reduce((a, b) => (a.v < b.v ? a : b))
      : null
    const minLoc = minLocRaw
      ? { value: minLocRaw.v, name: minLocRaw.n }
      : null
    const hidden = new Set(
      allRanked
        .map((r) => r.inv)
        .filter(
          (i) =>
            i.metrics.coolFlameObserved ||
            i.metrics.smolderObserved ||
            i.hazards.includes('detection-gap'),
        )
        .map((i) => i.id),
    )
    return {
      total: allRanked.length,
      minLoc,
      hiddenHazards: hidden.size,
      explorationRelevant: allRanked.filter(
        (r) => r.inv.conditions.explorationRelevant,
      ).length,
    }
  }, [allRanked])

  const insights = useMemo(() => buildInsights(allRanked), [allRanked])

  return (
    <div className="min-h-screen font-sans text-slate-200 antialiased">
      <Header />
      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-6">
        <StatCards
          total={stats.total}
          minLoc={stats.minLoc}
          hiddenHazards={stats.hiddenHazards}
          explorationRelevant={stats.explorationRelevant}
        />

        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4">
            <FilterBar
              filters={filters}
              onChange={setFilters}
              categories={Object.keys(CATEGORY_LABELS) as Category[]}
              hazards={Object.keys(HAZARD_LABELS) as HazardTag[]}
            />
            <RankingTable
              ranked={filtered}
              selectedId={selected?.inv.id}
              onSelect={setSelectedId}
            />
          </div>
          <DetailPanel entry={selected} />
        </div>

        <ChartsPanel ranked={allRanked} />
        <InsightFeed insights={insights} />

        <footer className="border-t border-edge pt-4 text-xs text-mist">
          <p>
            <strong className="text-slate-300">Data provenance:</strong> starter
            dataset compiled from public NASA literature and marked{' '}
            <code className="rounded bg-panel2 px-1">verified=false</code>. Ingest
            and verify real PSI files via <code className="rounded bg-panel2 px-1">scripts/build_dataset.py</code>.
            This tool summarizes published research to support fire-safety
            analysis — it is not certification data.
          </p>
          <p className="mt-2">
            Challenge:{' '}
            <a
              className="text-ice hover:underline"
              href="https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/"
              target="_blank"
              rel="noreferrer"
            >
              spaceappschallenge.org/2026/flame-in-freefall
            </a>
            {' · '}PSI:{' '}
            <a
              className="text-ice hover:underline"
              href="https://psi.nasa.gov/physci/repo"
              target="_blank"
              rel="noreferrer"
            >
              psi.nasa.gov/physci/repo
            </a>
          </p>
        </footer>
      </main>
    </div>
  )
}

export default App
