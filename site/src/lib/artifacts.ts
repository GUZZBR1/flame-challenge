import { getSiFeed, type SiFeedEntry } from './simBus'
import { cleanBriefing, modeLabel, riskBits, ACTION_LABEL } from './format'

/** generated artifacts — the dashboards the copilot *makes*. every
 *  si-entry that carries a run or evidence is folded into a card:
 *  a question-shaped title, a confidence pill, the numbers as bars
 *  and links back to where the artifact can be re-driven or audited.
 *  they live on the dashboard page, newest first, and persist across
 *  reloads so a judge who asked things earlier still sees the pile. */

export interface ArtifactRow {
  label: string
  /** 0..100 — renders a soft bar */
  barPct?: number
  value?: string
}

export interface ArtifactLink {
  label: string
  /** 'chamber' re-lights the run on the sim deck; a '#…' navigates */
  target: string
}

export interface SiArtifact {
  id: number
  entryId: number
  ts: number
  title: string
  badge: { label: string; tone: 'green' | 'amber' | 'blue' | 'slate' }
  rows: ArtifactRow[]
  footnote?: string
  links: ArtifactLink[]
  sim?: {
    load_preset?: string | null
    set_o2_percent?: number | null
    set_airflow_cm_s?: number | null
  }
}

const STORE_KEY = 'ignis-artifacts'
const MAX_ITEMS = 24

let artifacts: SiArtifact[] = []
let nextId = 1
const seen = new Set<number>()

try {
  const raw = localStorage.getItem(STORE_KEY)
  if (raw) {
    const parsed = JSON.parse(raw) as SiArtifact[]
    if (Array.isArray(parsed)) {
      artifacts = parsed.slice(0, MAX_ITEMS)
      for (const a of artifacts) seen.add(a.entryId)
      nextId = artifacts.reduce((m, a) => Math.max(m, a.id), 0) + 1
    }
  }
} catch {
  artifacts = []
}

function persist(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(artifacts))
  } catch {
    // private-mode storage — artifacts still live for the session
  }
}

export function getArtifacts(): SiArtifact[] {
  return artifacts
}

/** confidence pill — grounded answers with near psi evidence rank
 *  highest; an offline model still speaks, just quieter about it */
function badgeFor(e: SiFeedEntry): SiArtifact['badge'] {
  const top = e.resp.evidence?.[0]?.similarity ?? 0
  if (e.resp.mode !== 'llm')
    return { label: modeLabel(e.resp.mode), tone: 'slate' }
  if (top >= 85) return { label: 'high confidence', tone: 'green' }
  if (top >= 60) return { label: 'moderate confidence', tone: 'amber' }
  return { label: 'model estimate', tone: 'blue' }
}

function artifactFromEntry(e: SiFeedEntry): SiArtifact | null {
  const r = e.resp
  const sim = r.simulation_commands
  const isRun =
    !!sim &&
    (sim.load_preset != null ||
      sim.set_o2_percent != null ||
      sim.set_airflow_cm_s != null)
  const evidence = r.evidence ?? []
  // worth a card when it ran something or grounded an answer —
  // a bare chat line stays in the feed only
  if (!isRun && !evidence.length) return null

  const { text } = cleanBriefing(r.briefing)
  const risk = riskBits(r.chamber, text)

  const rows: ArtifactRow[] = []
  if (risk) {
    rows.push({
      label: 'risk index',
      barPct: risk.pct,
      value: `${risk.pct}%${risk.level ? ` ${risk.level}` : ''}`,
    })
  }
  const margin = text.match(/margin\s*([+-]?\d+)\s*pt/i)
  if (margin) {
    const m = parseInt(margin[1], 10)
    rows.push({ label: 'margin vs loc', value: `${m > 0 ? '+' : ''}${m} pt` })
  }
  for (const ev of evidence.slice(0, 3)) {
    rows.push({
      label: `psi ${ev.accession.toLowerCase()} · ${ev.fuel}`,
      barPct: ev.similarity,
      value: `${ev.similarity}%`,
    })
  }

  const parts: string[] = []
  if (sim?.load_preset) parts.push(sim.load_preset)
  if (sim?.set_o2_percent != null) parts.push(`${sim.set_o2_percent}% o₂`)
  if (sim?.set_airflow_cm_s != null) parts.push(`${sim.set_airflow_cm_s} cm/s`)

  const title = e.prompt
    ? e.prompt.replace(/^[⌨◉]\s*/, '')
    : isRun
      ? `${parts.join(' · ') || 'the chamber'} — a generated run`
      : 'a grounded answer'

  const links: ArtifactLink[] = []
  if (isRun) links.push({ label: 'watch the burn', target: 'chamber' })
  links.push({ label: 'audit in psi dataset', target: '#psi-dataset' })
  if (r.navigation?.scroll_to_section === 'dashboard' || isRun)
    links.push({ label: 'echoed to risk rank', target: '#dashboard' })

  const a: SiArtifact = {
    id: nextId++,
    entryId: e.id,
    ts: e.ts,
    title,
    badge: badgeFor(e),
    rows: rows.slice(0, 5),
    links,
  }
  if (isRun) {
    a.sim = {
      load_preset: sim!.load_preset ?? null,
      set_o2_percent: sim!.set_o2_percent ?? null,
      set_airflow_cm_s: sim!.set_airflow_cm_s ?? null,
    }
    a.footnote = parts.length ? `ran: ${parts.join(' · ')}` : undefined
  } else if (r.recommended_action) {
    a.footnote =
      ACTION_LABEL[r.recommended_action] ??
      r.recommended_action.toLowerCase()
  }
  return a
}

function ingest(e: SiFeedEntry): void {
  if (seen.has(e.id)) return
  seen.add(e.id)
  const a = artifactFromEntry(e)
  if (!a) return
  artifacts = [a, ...artifacts].slice(0, MAX_ITEMS)
  persist()
  window.dispatchEvent(new CustomEvent('ignis:artifact', { detail: a }))
}

// the brain already proves this channel works — every surface that
// talks to the copilot files its answers on 'ignis:si-entry'
window.addEventListener('ignis:si-entry', (ev) => {
  const d = (ev as CustomEvent<SiFeedEntry>).detail
  if (d) ingest(d)
})

// entries filed before this module loaded (a voice answer on the
// landing page, say) still deserve their cards
for (const e of getSiFeed()) ingest(e)
if (artifacts.length) persist()
