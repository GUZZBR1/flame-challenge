import { useEffect, useRef, useState } from 'react'
import { gsap, navigateBack } from '../lib/scroll'
import KeyedFlame from './KeyedFlame'
import { IconArrowLeft } from './Icons'
import Button from './ui/Button'
import type { MissionOutcomeStatus } from './CrewTimelinePanel'

interface MissionPreset {
  id: string
  title: string
  tag: string
  accent: string
  o2Pct: number
  flowCms: number
  gravity: 'microgravity' | 'earth' | 'lunar' | 'mars'
  investigationId: string
  materialId: string
  description: string
  prompt: string
  outcomeStatus: MissionOutcomeStatus
}

const MISSION_PRESETS: MissionPreset[] = [
  {
    id: 'apollo-1-crisis',
    title: 'Historical Crisis: Apollo 1',
    tag: '100% O₂ Norm · 16.7 psia',
    accent: '#b91c1c',
    o2Pct: 40,
    flowCms: 5.0,
    gravity: 'earth',
    investigationId: 'flare',
    materialId: 'pmma',
    description: 'Pure high-pressure oxygen atmosphere resulting in catastrophic rapid flashover.',
    prompt: 'Analyze Apollo 1 pure oxygen risk conditions with high oxidizer fraction.',
    outcomeStatus: 'MISSION ABORTED / HULL BREACH',
  },
]

export default function SimDeck() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [activeMission, setActiveMission] = useState<MissionPreset>(MISSION_PRESETS[0])

  useEffect(() => {
    const root = rootRef.current
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(
      () => gsap.from('[data-hero]', { opacity: 0, y: 14, duration: 0.6, ease: 'power2.out', stagger: 0.07 }),
      root,
    )
    return () => ctx.revert()
  }, [])

  // selecting an envelope is a visual pick only — it marks the active
  // mission; the run/report pipeline intentionally lives outside this view
  const loadMissionPreset = (preset: MissionPreset) => setActiveMission(preset)

  return (
    <div ref={rootRef} data-lenis-prevent className="fixed inset-0 z-10 overflow-y-auto overscroll-contain bg-[var(--bg)]">
      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-24 sm:px-10 sm:pt-28 lg:px-16">
        <KeyedFlame
          className="inset-x-0 -top-8 h-[min(54vh,460px)]"
          strength={0.3}
          src={{ hd: '/assets/saffire5_uv.mp4', sd: '/assets/saffire5_uv_sd.mp4' }}
        />
        <header className="relative">
          <div data-hero className="flex items-center justify-between gap-5">
            <Button variant="glass" onClick={navigateBack}>
              <IconArrowLeft size={16} /> Back
            </Button>
          </div>
          <h1 data-hero className="mt-9 font-[family-name:var(--font-display)] text-5xl font-bold tracking-[-0.05em] sm:text-7xl">
            Simulations
          </h1>
          <p data-hero className="mt-4 max-w-2xl text-sm leading-6 opacity-80 sm:text-base sm:leading-7">
            Test real-world mission atmospheres, partial-gravity regimes, and historical fire crises. The copilot
            cross-references 30 years of NASA PSI data and streams physical combustion runs in real time.
          </p>
        </header>

        {/* GUIDED MISSION PRESETS CARDS (1-CLICK EXECUTION) */}
        <section className="relative mt-10 rounded-[32px] border border-[var(--edge)] bg-[color-mix(in_srgb,var(--panel)_75%,transparent)] p-6 shadow-xl backdrop-blur-2xl sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--edge)] pb-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
                Guided Scenarios &amp; Historical Crises
              </span>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold sm:text-2xl">
                1-Click Mission Envelopes
              </h2>
            </div>
            <span className="font-mono text-xs opacity-60">Click any card to preview the mission</span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MISSION_PRESETS.map((preset) => {
              const isActive = activeMission.id === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => loadMissionPreset(preset)}
                  className={`group flex flex-col justify-between rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                    isActive
                      ? 'border-[var(--accent)] bg-white/60 shadow-md dark:bg-white/[0.08]'
                      : 'border-[var(--edge)] bg-white/30 dark:bg-white/[0.03] hover:border-[var(--accent)]/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold" style={{ color: preset.accent }}>
                        {preset.tag}
                      </span>
                      {isActive && (
                        <span className="rounded bg-[var(--accent)]/20 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--accent)]">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-base font-bold group-hover:text-[var(--accent)] transition-colors">
                      {preset.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed opacity-75">{preset.description}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-[var(--edge)] pt-2.5 text-xs font-mono opacity-70">
                    <span>
                      {preset.investigationId} · {preset.o2Pct}% O₂
                    </span>
                    <span className="group-hover:translate-x-0.5 transition-transform">Select →</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <div className="relative mt-8 flex justify-end">
          <Button variant="glass" onClick={navigateBack}>
            Back to overview <IconArrowLeft size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
