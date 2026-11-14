import { useMemo, useState } from 'react'
import { CheckCircle2, Database, Play, X } from 'lucide-react'
import { injectTarget, MASTER_ROWS } from '../game/masterSheet'
import type { MasterRow } from '../types'

const ROWS = MASTER_ROWS

const TABS: { id: string; label: string; match: (r: MasterRow) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'investigation', label: 'Investigations', match: (r) => r.record_type === 'investigation' },
  { id: 'material', label: 'Materials', match: (r) => r.record_type === 'material' },
  { id: 'experiment_run', label: 'Test runs', match: (r) => r.record_type === 'experiment_run' },
  { id: 'incident', label: 'Incidents', match: (r) => r.record_type === 'incident' },
]

interface Props {
  onClose: () => void
  onInject: (row: MasterRow) => void
}

const cell = (v: string | number | undefined) => (v === undefined || v === '' ? '—' : String(v))

/**
 * Pillar 2 — the auditable master sheet. Filter/compare the consolidated
 * NASA records and inject any row straight into a 2.5D chamber.
 */
export default function MasterSheet({ onClose, onInject }: Props) {
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [verifiedOnly, setVerifiedOnly] = useState(false)

  const rows = useMemo(() => {
    const t = TABS.find((x) => x.id === tab)!
    return ROWS.filter(t.match).filter((r) => {
      if (verifiedOnly && r.verified !== 'true') return false
      if (!q) return true
      const hay =
        `${r.id} ${r.name} ${r.investigation_id ?? ''} ${r.material_id ?? ''} ${r.fuel_or_material ?? ''} ${r.outcome ?? ''} ${r.notes ?? ''}`.toLowerCase()
      return hay.includes(q.toLowerCase())
    })
  }, [tab, q, verifiedOnly])

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-edge bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-ice" />
            <span className="text-sm font-bold tracking-wide text-white">
              NASA COMBUSTION MASTER SHEET
            </span>
            <span className="font-mono text-[10px] text-mist">
              {rows.length}/{ROWS.length} rows · nasa_combustion_master.csv
            </span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-mist hover:bg-edge hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                tab === t.id ? 'bg-white text-void' : 'border border-edge text-mist hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filter — fuel, run id, outcome…"
            className="min-w-48 flex-1 rounded border border-edge bg-panel2 px-2 py-1 text-[11px] text-white placeholder:text-mist/60"
          />
          <label className="flex items-center gap-1 text-[10px] text-mist">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="accent-ice"
            />
            PSI-verified only
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-[10.5px]">
            <thead className="sticky top-0 bg-panel2 text-[9px] uppercase tracking-wide text-mist">
              <tr>
                {['ID', 'Record', 'Investigation', 'Fuel / material', 'O₂ %', 'Flow cm/s', 'LOC %', 'Cool flame', 'Outcome / metric', 'Ver.', ''].map((h) => (
                  <th key={h} className="border-b border-edge px-2 py-1.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tgt = injectTarget(r)
                return (
                  <tr key={`${r.record_type}-${r.id}`} className="border-b border-edge/50 hover:bg-panel2">
                    <td className="px-2 py-1 font-mono text-[9.5px] text-mist">{r.id}</td>
                    <td className="px-2 py-1">
                      <span
                        className={`rounded px-1 py-px text-[8.5px] font-semibold uppercase ${
                          r.record_type === 'incident'
                            ? 'bg-red-500/15 text-red-400'
                            : r.record_type === 'experiment_run'
                              ? 'bg-ice/10 text-ice'
                              : r.record_type === 'material'
                                ? 'bg-ember/10 text-ember'
                                : 'bg-edge/80 text-mist'
                        }`}
                      >
                        {r.record_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="max-w-44 truncate px-2 py-1 text-white/90" title={r.name}>{r.name}</td>
                    <td className="max-w-36 truncate px-2 py-1 text-mist" title={r.fuel_or_material}>{cell(r.fuel_or_material)}</td>
                    <td className="px-2 py-1 font-mono text-mist">
                      {r.o2_pct || (r.o2_min ? `${r.o2_min}–${r.o2_max}` : '—')}
                    </td>
                    <td className="px-2 py-1 font-mono text-mist">
                      {r.flow_cms || (r.flow_min !== undefined && r.flow_min !== '' ? `${r.flow_min}–${r.flow_max}` : '—')}
                    </td>
                    <td className="px-2 py-1 font-mono text-mist">{cell(r.loc_pct)}</td>
                    <td className="px-2 py-1 text-mist">{r.cool_flame === 'true' ? '✓' : '—'}</td>
                    <td className="max-w-52 truncate px-2 py-1 text-mist" title={r.notes}>
                      {cell(r.outcome || r.extinction_type)}
                    </td>
                    <td className="px-2 py-1">
                      {r.verified === 'true' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    </td>
                    <td className="px-2 py-1">
                      {tgt && (
                        <button
                          onClick={() => { onInject(r); }}
                          className="flex items-center gap-1 rounded bg-flame/15 px-1.5 py-0.5 text-[9px] font-bold text-flame hover:bg-flame/30"
                          title={tgt.kind === 'scenario' ? 'Trigger this incident in the yard' : `Inject ${tgt.invId} @ ${tgt.o2}% O₂ / ${tgt.flow} cm/s`}
                        >
                          <Play className="h-2.5 w-2.5" />
                          {tgt.kind === 'scenario' ? 'Trigger' : 'Inject'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-edge px-4 py-1.5 text-[9px] text-mist">
          One row = one auditable record. Runs are real per-test PSI files (verified ✓); materials
          and investigations carry curated starter values. Regenerate with{' '}
          <code className="text-ice/80">data/pipelines/build_master_sheet.py</code>.
        </div>
      </div>
    </div>
  )
}
