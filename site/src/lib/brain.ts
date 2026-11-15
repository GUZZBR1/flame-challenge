import type { SiEvidence } from './api'
import { INV_BY_ID } from './dashboard'
import type { AskResponse } from './live'

/** the copilot's memory — every record it has ever touched, kept in
 *  module scope so it survives the simulations deck closing and
 *  reopening. evidence cited by answers and citations/rows surfaced
 *  by the corpus ask all wire in here as "learned" tissue: repeats
 *  strengthen the synapse (uses), recency makes it fire brighter. */

export interface BrainRecord {
  key: string
  label: string
  investigationId: string | null
  fuel: string | null
  detail: string
  url: string | null
  uses: number
  firstTs: number
  lastTs: number
  themes: string[]
}

type RecordInput = Omit<BrainRecord, 'uses' | 'firstTs' | 'lastTs' | 'themes'> & {
  themes?: string[]
}

const records = new Map<string, BrainRecord>()

function fireSoon(): void {
  window.dispatchEvent(new CustomEvent('ignis:brain'))
}

export function touchRecords(items: RecordInput[]): void {
  if (!items.length) return
  const now = Date.now()
  for (const i of items) {
    const inv = i.investigationId ? INV_BY_ID.get(i.investigationId) : null
    const prev = records.get(i.key)
    records.set(i.key, {
      ...i,
      themes: i.themes ?? inv?.themes ?? [],
      uses: (prev?.uses ?? 0) + 1,
      firstTs: prev?.firstTs ?? now,
      lastTs: now,
    })
  }
  fireSoon()
}

/** copilot evidence — the psi runs attached to an answer */
export function touchEvidence(evs: SiEvidence[] | null | undefined): void {
  if (!evs?.length) return
  touchRecords(
    evs.map((e) => ({
      key: `${e.accession}/${e.runId}`,
      label: e.accession,
      investigationId: e.investigationId ?? null,
      fuel: e.fuel ?? null,
      detail: `${e.outcome} · ${e.similarity}%`,
      url: e.sourceUrl || null,
    })),
  )
}

/** corpus answers — citations and the exact psi rows they grounded on */
export function touchAsk(res: AskResponse): void {
  const inv = res.grounding?.investigationId ?? null
  const fuel = res.grounding?.fuel ?? null
  const items: RecordInput[] = []
  for (const c of res.citations ?? []) {
    items.push({
      key: `cite:${c.id ?? c.url ?? c.title}`,
      label: (c.ref ?? c.title).slice(0, 34),
      investigationId: inv,
      fuel,
      detail: `${c.type} · ntrs/psi`,
      url: c.url ?? null,
    })
  }
  for (const row of res.rows ?? []) {
    const accession = String(row.accession ?? row.accessionNumber ?? '')
    const runId = String(row.runId ?? row.run_id ?? row.id ?? '')
    const key = accession || runId
    if (!key) continue
    items.push({
      key: `row:${accession}/${runId}`,
      label: accession || runId,
      investigationId: String(row.investigationId ?? inv ?? '') || null,
      fuel: String(row.fuel ?? row.material ?? fuel ?? '') || null,
      detail: 'psi run row',
      url: null,
    })
  }
  touchRecords(items)
}

export function getBrainRecords(): BrainRecord[] {
  return [...records.values()]
}

/** 'ignis:si-entry' is THE record channel — every copilot answer
 *  travels it, so the cortex learns from the event itself rather than
 *  a side call inside emitSiEntry. module-init listener: registered
 *  once at bundle load, before any answer can arrive. */
window.addEventListener('ignis:si-entry', (e) => {
  const entry = (
    e as CustomEvent<{ resp?: { evidence?: SiEvidence[] } }>
  ).detail
  touchEvidence(entry?.resp?.evidence)
})
