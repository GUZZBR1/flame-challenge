import type { RankedInvestigation } from '../types'
import { CATEGORY_LABELS, HAZARD_LABELS } from '../lib/insights'
import {
  ExternalLink,
  FlaskConical,
  Rocket,
  ShieldAlert,
  Thermometer,
} from 'lucide-react'

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'warn' }) {
  const cls =
    tone === 'warn'
      ? 'border-ember/40 bg-ember/10 text-ember'
      : 'border-edge bg-panel2 text-mist'
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${cls}`}>{children}</span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">
        {title}
      </h3>
      {children}
    </section>
  )
}

export default function DetailPanel({ entry }: { entry: RankedInvestigation | undefined }) {
  if (!entry) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-edge bg-panel p-8 text-sm text-mist">
        Select an investigation to see its AI summary and fire-safety implications.
      </div>
    )
  }

  const { inv, score } = entry
  const loc = inv.metrics.limitingOxygenPct
  const spread = inv.metrics.flameSpreadRateCms

  return (
    <article className="rounded-xl border border-edge bg-panel p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-white">{inv.name}</h2>
            <Chip tone="warn">risk score {score.total}/100</Chip>
            <Chip>{inv.status}</Chip>
            {!inv.verified && <Chip>starter data — unverified</Chip>}
          </div>
          <p className="mt-1 text-sm text-mist">{inv.title}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {inv.fuels.slice(0, 4).map((f) => (
              <span
                key={f}
                className="rounded-md bg-panel2 px-2 py-0.5 text-xs text-slate-300"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right text-xs text-mist">
          <div className="flex items-center justify-end gap-1">
            <Rocket size={12} /> {inv.platform}
          </div>
          <div className="mt-1">{inv.years}</div>
          {inv.facility && <div className="mt-1">{inv.facility}</div>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-edge bg-panel2 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-mist">
            <Thermometer size={11} /> Limiting O₂
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {loc === null ? '—' : `${loc}%`}
          </div>
          <div className="text-[10px] text-mist">LOC (lower = worse)</div>
        </div>
        <div className="rounded-lg border border-edge bg-panel2 p-3">
          <div className="text-[10px] uppercase tracking-wide text-mist">Spread rate</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {spread ? `${spread.min}–${spread.max} cm/s` : '—'}
          </div>
          <div className="text-[10px] text-mist">flame spread</div>
        </div>
        <div className="rounded-lg border border-edge bg-panel2 p-3">
          <div className="text-[10px] uppercase tracking-wide text-mist">O₂ range</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {inv.conditions.oxygenPct
              ? `${inv.conditions.oxygenPct[0]}–${inv.conditions.oxygenPct[1]}%`
              : '—'}
          </div>
          <div className="text-[10px] text-mist">
            {inv.conditions.flowCms
              ? `flow ${inv.conditions.flowCms[0]}–${inv.conditions.flowCms[1]} cm/s`
              : 'no forced flow'}
          </div>
        </div>
        <div className="rounded-lg border border-edge bg-panel2 p-3">
          <div className="text-[10px] uppercase tracking-wide text-mist">Pressure</div>
          <div className="mt-1 text-sm font-semibold text-white">
            {inv.conditions.pressureKpa ? `${inv.conditions.pressureKpa} kPa` : '—'}
          </div>
          <div className="text-[10px] text-mist">
            {inv.gravity === 'partial-gravity' ? 'partial-g tested' : `${inv.gravity}`}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <Section title="SI summary">
          <p className="rounded-lg border border-flame/25 bg-flame/5 p-3 text-sm leading-relaxed text-slate-200">
            {entry.summary}
          </p>
        </Section>

        <Section title="Key findings">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            {inv.keyFindings.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Section>

        <Section title="Fire-safety implications">
          <ul className="space-y-2">
            {inv.safetyImplications.map((s) => (
              <li
                key={s}
                className="flex gap-2 rounded-lg border border-ember/20 bg-ember/5 p-2.5 text-sm text-slate-200"
              >
                <ShieldAlert size={15} className="mt-0.5 shrink-0 text-ember" />
                {s}
              </li>
            ))}
          </ul>
        </Section>

        <div className="flex flex-wrap items-center gap-1.5">
          {inv.hazards.map((h) => (
            <Chip key={h} tone="warn">
              {HAZARD_LABELS[h]}
            </Chip>
          ))}
          <Chip>{CATEGORY_LABELS[inv.category]}</Chip>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-edge pt-3 text-xs text-mist">
          <span className="flex items-center gap-1">
            <FlaskConical size={12} /> {inv.publications} related publications
          </span>
          <span>data: {inv.data.availability}</span>
          {inv.data.psiUrl && (
            <a
              href={inv.data.psiUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-ice hover:underline"
            >
              PSI repository <ExternalLink size={11} />
            </a>
          )}
          {inv.agencies.length > 0 && <span>{inv.agencies.join(' · ')}</span>}
        </div>
      </div>
    </article>
  )
}
