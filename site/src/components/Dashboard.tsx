import { useEffect, useState } from 'react'
import { dashboardGeneratedEvent, getGeneratedDashboards, type GeneratedDashboard } from '../lib/generatedDashboards'
import { navigate, navigateBack } from '../lib/scroll'
import Button from './ui/Button'
import { IconArrowLeft, IconArrowUpRight } from './Icons'

function percent(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return `${Math.round(value <= 1 ? value * 100 : value)}%`
}

function Result({ item }: { item: GeneratedDashboard }) {
  const risk = percent(item.response.chamber?.riskIndex)
  const level = typeof item.response.chamber?.level === 'string' ? item.response.chamber.level : null
  const evidence = item.response.evidence ?? []
  return (
    <article id={`dashboard-${item.id}`} className="dashboard-result scroll-mt-28 rounded-[28px] border border-[var(--edge)] bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] p-6 shadow-[0_24px_70px_-42px_rgba(16,35,60,.5)] backdrop-blur-2xl sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full border border-[var(--edge)] px-3 py-1.5 text-sm font-medium capitalize opacity-80">
          {item.run ? 'simulation complete' : item.response.mode === 'llm' ? 'model analysis' : 'local analysis'}
        </span>
        <time className="text-sm opacity-60" dateTime={new Date(item.createdAt).toISOString()}>
          {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(item.createdAt)}
        </time>
      </div>
      <h2 className="mt-6 max-w-4xl font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight tracking-[-0.025em] sm:text-3xl">
        {item.prompt}
      </h2>
      {item.scenario && <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {[item.scenario.investigationId, item.scenario.materialId, `${item.scenario.o2Pct}% O₂`, `${item.scenario.flowCms} cm/s`, item.scenario.gravity].filter(Boolean).map((value) => <span key={value} className="rounded-full border border-[var(--edge)] bg-white/30 px-3 py-1.5 capitalize dark:bg-white/[0.04]">{value}</span>)}
      </div>}
      <p className="mt-4 max-w-4xl whitespace-pre-wrap text-base leading-8 opacity-85 sm:text-lg">{item.response.briefing}</p>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--edge)] bg-white/30 p-5 dark:bg-white/[0.04]">
          <div className="text-sm opacity-60">Risk index</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">{risk ?? '—'}</div>
          {level && <div className="mt-1 text-sm capitalize opacity-65">{level}</div>}
        </div>
        <div className="rounded-2xl border border-[var(--edge)] bg-white/30 p-5 dark:bg-white/[0.04]">
          <div className="text-sm opacity-60">Evidence records</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">{evidence.length}</div>
          <div className="mt-1 text-sm opacity-65">NASA PSI matches</div>
        </div>
        <div className="rounded-2xl border border-[var(--edge)] bg-white/30 p-5 dark:bg-white/[0.04]">
          <div className="text-sm opacity-60">Engine run</div>
          <div className="mt-2 text-3xl font-semibold">{item.run ? `${item.run.tSec.toFixed(1)} s` : '—'}</div>
          <div className="mt-1 text-sm capitalize opacity-65">{item.run ? (item.run.coolFlame ? 'cool flame observed' : item.run.ignited ? 'ignition observed' : 'no ignition') : 'analysis only'}</div>
        </div>
      </div>

      {evidence.length > 0 && (
        <div className="mt-7 border-t border-[var(--edge)] pt-5">
          <h3 className="text-base font-semibold">Source records</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {evidence.slice(0, 4).map((source) => (
              <li key={`${item.id}-${source.runId}`}>
                <a className="inline-flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-[var(--edge)] px-4 text-sm transition-colors hover:bg-white/50 dark:hover:bg-white/10" href={source.sourceUrl || '#psi-dataset'} target={source.sourceUrl ? '_blank' : undefined} rel="noreferrer">
                  <span className="truncate">{source.accession} · {source.fuel} · {source.outcome}</span>
                  <span className="shrink-0 tabular-nums opacity-65">{Math.round(source.similarity)}%</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="glass" size="default">
          <a href="#simulations" onClick={(event) => { event.preventDefault(); navigate('#simulations') }}>
            Open simulations <IconArrowUpRight size={16} />
          </a>
        </Button>
        {evidence[0]?.sourceUrl && <Button asChild variant="ghost" size="default"><a href={evidence[0].sourceUrl} target="_blank" rel="noreferrer">Open PSI source <IconArrowUpRight size={16} /></a></Button>}
      </div>
    </article>
  )
}

export default function Dashboard() {
  const [items, setItems] = useState(getGeneratedDashboards)
  useEffect(() => {
    const refresh = () => setItems(getGeneratedDashboards())
    window.addEventListener(dashboardGeneratedEvent(), refresh)
    return () => window.removeEventListener(dashboardGeneratedEvent(), refresh)
  }, [])

  useEffect(() => {
    const id = location.hash.startsWith('#dashboard-') ? location.hash.slice('#dashboard-'.length) : null
    if (!id) return
    const timer = window.setTimeout(() => document.getElementById(`dashboard-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    return () => window.clearTimeout(timer)
  }, [items])

  return (
    <div data-lenis-prevent className="fixed inset-0 z-10 overflow-y-auto overscroll-contain bg-[var(--bg)]">
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-10 lg:px-16">
        <Button variant="glass" size="default" onClick={navigateBack}><IconArrowLeft size={16} /> Back</Button>
        <div className="mt-12 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] opacity-60">IGNIS · generated reports</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.04em] sm:text-6xl">Dashboard</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 opacity-75 sm:text-lg">Scenario analyses and completed chamber runs, with their evidence and source links.</p>
          </div>
          {items.length > 0 && <Button variant="primary" size="default" onClick={() => navigate('#simulations')}>Generate a scenario <IconArrowUpRight size={16} /></Button>}
        </div>

        {items.length === 0 ? (
          <div className="mt-12 rounded-[32px] border border-[var(--edge)] bg-[color-mix(in_srgb,var(--panel)_70%,transparent)] px-6 py-16 text-center shadow-[0_32px_80px_-56px_rgba(16,35,60,.5)] backdrop-blur-2xl sm:px-12">
            <div className="mx-auto grid size-16 place-items-center rounded-full border border-[var(--edge)] bg-white/40 text-2xl dark:bg-white/5" aria-hidden="true">↗</div>
            <h2 className="mt-6 font-[family-name:var(--font-display)] text-2xl font-semibold sm:text-3xl">No generated dashboards yet</h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-7 opacity-70 sm:text-lg">Describe a combustion scenario in Simulations. Save an analysis or ask the copilot to run the chamber; each result will appear here with its sources.</p>
            <Button variant="primary" size="lg" className="mt-8" onClick={() => navigate('#simulations')}>Go to Simulations <IconArrowUpRight size={17} /></Button>
          </div>
        ) : (
          <div className="mt-10 grid gap-6">{items.map((item) => <Result key={item.id} item={item} />)}</div>
        )}
      </div>
    </div>
  )
}
