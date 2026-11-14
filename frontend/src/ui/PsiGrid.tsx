import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Database, Grid3x3 } from 'lucide-react'
import { INV_MATERIAL, MASTER_ROWS } from '../game/masterSheet'
import { riskIndexLocal } from '../sim-bridge/risk'
import type { DashConditions, EnvKey, MasterRow } from '../types'

const ROWS = MASTER_ROWS

const GRAVITY_FOR_ENV: Record<EnvKey, string> = {
  microgravity: 'microgravity',
  lunar: 'lunar',
  martian: 'martian',
  historical: 'microgravity',
  earth: 'earth',
}

const TAGS: { id: string; label: string }[] = [
  { id: 'cool-flame', label: 'Cool Flames' },
  { id: 'smolder', label: 'Smolder' },
  { id: 'flex', label: 'FLEX' },
  { id: 'saffire', label: 'SAFFIRE' },
  { id: 'acme', label: 'ACME' },
  { id: 'incident', label: 'Crises' },
  { id: 'verified', label: 'Verified' },
]

function matchesTag(row: MasterRow, tag: string): boolean {
  const t = tag.toLowerCase()
  if (t === 'incident' || t === 'crises') return row.record_type === 'incident'
  if (t === 'cool-flame') return row.cool_flame === 'true'
  if (t === 'smolder') return row.smolder === 'true'
  if (t === 'verified') return row.verified === 'true'
  const hay =
    `${row.id} ${row.name} ${row.investigation_id ?? ''} ${row.material_id ?? ''} ${row.source ?? ''} ${row.notes ?? ''}`.toLowerCase()
  return t.split(/[\s-]+/).some((tok) => tok.length > 2 && hay.includes(tok))
}

type Bucket = 'quiet' | 'cool' | 'critical' | 'off'

function bucketFor(row: MasterRow, cond: DashConditions): Bucket {
  if (cond.tag && !matchesTag(row, cond.tag)) return 'off'
  if (cond.env === 'historical')
    return row.record_type === 'incident' ? 'critical' : 'off'
  if (row.record_type === 'incident') return 'critical'
  const matId = row.material_id || (row.investigation_id && INV_MATERIAL[row.investigation_id])
  if (!matId) return row.cool_flame === 'true' ? 'cool' : 'quiet'
  const r = riskIndexLocal(
    matId,
    cond.o2Pct,
    cond.flowCms,
    GRAVITY_FOR_ENV[cond.env],
  )
  if (r.level === 'high' || r.level === 'critical') return 'critical'
  if (r.flags.coolFlameCapable || row.cool_flame === 'true') return 'cool'
  return 'quiet'
}

const CELL_CLS: Record<Bucket, string> = {
  quiet: 'bg-ice/70 hover:bg-ice',
  cool: 'bg-ember/80 hover:bg-ember',
  critical: 'bg-red-400/90 hover:bg-red-400',
  off: 'bg-edge/60',
}

interface Props {
  cond: DashConditions
  onCond: (patch: Partial<DashConditions>) => void
  onInject: (row: MasterRow) => void
  onOpenSheet: () => void
}

/**
 * The master-sheet map — every square is one auditable row of
 * nasa_combustion_master.csv. Cells light up by regime under the current
 * cabin dial / environment; clicking one injects the record into the yard.
 */
export default function PsiGrid({ cond, onCond, onInject, onOpenSheet }: Props) {
  const [open, setOpen] = useState(true)
  const cells = useMemo(() => ROWS.map((row) => ({ row, b: bucketFor(row, cond) })), [cond])
  const lit = cells.filter((c) => c.b !== 'off').length

  return (
    <div className="pointer-events-auto absolute right-2 top-2 w-64 rounded border border-edge bg-panel/90 backdrop-blur">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 border-b border-edge px-2.5 py-1.5 text-left"
      >
        <Grid3x3 className="h-3.5 w-3.5 text-ice" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-white">
          NASA PSI records
        </span>
        <span className="ml-auto font-mono text-[9px] text-mist">{ROWS.length} pts</span>
        {open ? <ChevronUp className="h-3 w-3 text-mist" /> : <ChevronDown className="h-3 w-3 text-mist" />}
      </button>

      {open && (
        <div className="px-2.5 py-2">
          <p className="text-[9.5px] leading-snug text-mist">
            The C++20 core is calibrated on real ISS combustion tests — every cell is one record of
            the consolidated master sheet.
          </p>

          {/* tag filters */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {TAGS.map((t) => {
              const active = cond.tag === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => onCond({ tag: active ? null : t.id })}
                  className={`rounded-full px-1.5 py-px text-[8.5px] font-semibold ${
                    active ? 'bg-white text-void' : 'border border-edge text-mist hover:border-mist hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* waffle grid */}
          <div className="mt-2 grid grid-cols-[repeat(14,minmax(0,1fr))] gap-[3px] rounded border border-edge bg-panel2 p-1.5">
            {cells.map(({ row, b }) => (
              <button
                key={`${row.record_type}-${row.id}`}
                onClick={() => b !== 'off' && onInject(row)}
                title={`${row.name}\n${row.record_type}${row.verified === 'true' ? ' · verified' : ''}${row.o2_pct ? ` · ${row.o2_pct}% O₂` : ''}\n${(row.notes ?? '').slice(0, 140)}`}
                className={`aspect-square rounded-[2px] transition-colors ${CELL_CLS[b]}`}
              />
            ))}
          </div>

          <div className="mt-1.5 flex items-center gap-2 text-[8.5px] text-mist">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px] bg-ice/70" /> quiescent</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px] bg-ember/80" /> cool flame</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-[2px] bg-red-400/90" /> critical</span>
            <span className="ml-auto font-mono">{lit}/{ROWS.length}</span>
          </div>
          <button
            onClick={onOpenSheet}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-edge py-1 text-[9.5px] text-mist hover:border-mist hover:text-white"
          >
            <Database className="h-3 w-3" /> open master sheet (auditable CSV)
          </button>
        </div>
      )}
    </div>
  )
}
