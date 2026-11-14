import sheet from '../data/master_sheet.json'
import calib from '../data/calibration.json'
import type { MasterRow } from '../types'

/** the consolidated NASA combustion master sheet — mirrors
 *  data/processed/nasa_combustion_master.csv row-for-row */
export const MASTER_ROWS = (sheet as { rows: MasterRow[] }).rows

/** investigation_id -> engine material (calibration.json) */
export const INV_MATERIAL: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(
    (calib as { investigations: Record<string, { materialId?: string }> }).investigations,
  ).map(([k, v]) => [k, v.materialId]),
)

/** investigation_id -> canonical LOC the engines burn with
 *  (calibration.json effectiveLoc: dataset LOC ?? material locPct, possibly
 *  psi-fitted by fit_risk_model.py) — keeps the TS mirror in parity with
 *  the C++ chamber, which always uses the material table */
export const INV_LOC: Record<string, number | undefined> = Object.fromEntries(
  Object.entries(
    (calib as {
      investigations: Record<string, { effectiveLoc?: number | null }>
    }).investigations,
  ).map(([k, v]) => [k, v.effectiveLoc ?? undefined]),
)

function num(v: string | number | undefined): number | undefined {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** what clicking a master-sheet row does to the 2.5D yard */
export function injectTarget(row: MasterRow):
  | { kind: 'scenario'; id: string }
  | { kind: 'experiment'; invId: string; o2: number; flow: number }
  | null {
  if (row.record_type === 'incident') return { kind: 'scenario', id: row.id }
  const invId = row.investigation_id || INV_MATERIAL[row.id || '']
  if (!invId) return null
  const lo = num(row.o2_min)
  const hi = num(row.o2_max)
  const o2 =
    num(row.o2_pct) ??
    (lo !== undefined && hi !== undefined ? Math.round(((lo + hi) / 2) * 2) / 2 : undefined) ??
    (num(row.loc_pct) !== undefined ? num(row.loc_pct)! + 2 : undefined) ??
    21
  const flow = num(row.flow_cms) ?? num(row.flow_min) ?? 0
  return { kind: 'experiment', invId, o2, flow }
}
