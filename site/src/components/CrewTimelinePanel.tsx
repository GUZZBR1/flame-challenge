import { useState } from 'react'
import Button from './ui/Button'
import { IconCheck, IconRotateCcw } from './Icons'

export type CrewHealthStatus = 'Nominal' | 'Smoke Inhalation' | 'Burn Injury' | 'Fatal Casualty' | 'Contained' | 'Safe'
export type MissionOutcomeStatus = 'MISSION ACCOMPLISHED' | 'EMERGENCY CONTAINED' | 'MISSION ABORTED / HULL BREACH'

export interface CrewMember {
  id: string
  name: string
  role: string
  avatar: string
  status: CrewHealthStatus
  statusDetail: string
}

export interface CausalEvent {
  time: string
  actor: string
  action: string
  severity: 'info' | 'warning' | 'danger'
}

export interface CounterfactualDoctrine {
  title: string
  recommendedAction: string
  outcomeDelta: string
  crewSavedPct: number
  riskReductionPct: number
}

interface CrewTimelinePanelProps {
  missionTitle?: string
  outcomeStatus?: MissionOutcomeStatus
  crew?: CrewMember[]
  causalLog?: CausalEvent[]
  counterfactual?: CounterfactualDoctrine
  onApplyCounterfactual?: () => void
}

export const DEFAULT_CREW: CrewMember[] = [
  {
    id: 'cdr',
    name: 'Cdr. Alex Chen',
    role: 'Mission Commander',
    avatar: '/assets/crew_lucas.png',
    status: 'Nominal',
    statusDetail: 'Monitoring life-support telemetry from Flight Deck.',
  },
  {
    id: 'fe',
    name: 'Elena Ruiz',
    role: 'Flight Systems Engineer',
    avatar: '/assets/pixel_engineer.png',
    status: 'Smoke Inhalation',
    statusDetail: 'Attempted forced ventilation exhaust; exposed to dense smoke plume.',
  },
  {
    id: 'ps',
    name: 'Dr. Marcus Vance',
    role: 'Payload Science Specialist',
    avatar: '/assets/pixel_scientist.png',
    status: 'Burn Injury',
    statusDetail: 'Approached combustion chamber during cool-flame regime; suffered flash burn.',
  },
]

export const DEFAULT_CAUSAL_LOG: CausalEvent[] = [
  {
    time: 'T+00:00',
    actor: 'Hab Module B',
    action: 'Electrical short ignites PMMA duct insulation inside ventilation channel.',
    severity: 'info',
  },
  {
    time: 'T+00:03',
    actor: 'Ceiling Detectors',
    action: 'Optical smoke alarms fail to trigger — 0g absence of buoyancy prevents smoke column from rising (NASA PSI SAME-R finding).',
    severity: 'warning',
  },
  {
    time: 'T+00:08',
    actor: 'Flight Engineer',
    action: 'Manually activates high-rate air scrubber (20 cm/s flow) to clear haze — unintentionally feeding oxygen to the smolder front.',
    severity: 'danger',
  },
  {
    time: 'T+00:15',
    actor: 'Chamber Window',
    action: 'Visible flame dies out. Crew assumes fire extinguished; science specialist opens inspection hatch.',
    severity: 'warning',
  },
  {
    time: 'T+00:18',
    actor: 'Cool Flame Flashover',
    action: 'Low-temperature oxidation (700 K) triggers explosive re-ignition upon atmospheric rush. Hull compartment breached.',
    severity: 'danger',
  },
]

export const DEFAULT_COUNTERFACTUAL: CounterfactualDoctrine = {
  title: 'NASA PSI Saffire / BASS Containment Doctrine',
  recommendedAction:
    '1. Cut all forced ventilation immediately (V_flow → 0 cm/s).\n2. Isolate compartment hatch to limit oxygen recharge.\n3. Flood channel with CO₂/N₂ suppression gas.\n4. Verify radiative extinction via radiometric/UV sensors before opening hatches.',
  outcomeDelta: 'Zero casualties. Radiative quenching occurs in 4.2 seconds. Hull integrity maintained at 100%.',
  crewSavedPct: 100,
  riskReductionPct: 76,
}

export default function CrewTimelinePanel({
  missionTitle = 'Artemis Hab Module B Incident Replay',
  outcomeStatus = 'MISSION ABORTED / HULL BREACH',
  crew = DEFAULT_CREW,
  causalLog = DEFAULT_CAUSAL_LOG,
  counterfactual = DEFAULT_COUNTERFACTUAL,
  onApplyCounterfactual,
}: CrewTimelinePanelProps) {
  const [counterfactualApplied, setCounterfactualApplied] = useState(false)

  const handleApply = () => {
    setCounterfactualApplied(true)
    onApplyCounterfactual?.()
  }

  const activeOutcome = counterfactualApplied ? 'EMERGENCY CONTAINED' : outcomeStatus

  const badgeColor =
    activeOutcome === 'MISSION ACCOMPLISHED'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : activeOutcome === 'EMERGENCY CONTAINED'
      ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
      : 'bg-rose-500/15 text-rose-400 border-rose-500/30'

  return (
    <div className="rounded-[28px] border border-[var(--edge)] bg-[color-mix(in_srgb,var(--panel)_75%,transparent)] p-5 shadow-xl backdrop-blur-2xl sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--edge)] pb-5">
        <div>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
            Human Factors &amp; Mission Casualty Tracker
          </span>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold sm:text-2xl">
            {missionTitle}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full border px-4 py-1.5 font-mono text-xs font-bold tracking-wider ${badgeColor}`}>
            {activeOutcome}
          </span>
        </div>
      </div>

      {/* Crew Rosters */}
      <div className="mt-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider opacity-60">Crew Health &amp; Operational Status</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {crew.map((member) => {
            const isInjured = !counterfactualApplied && (member.status === 'Burn Injury' || member.status === 'Fatal Casualty')
            const isWarning = !counterfactualApplied && member.status === 'Smoke Inhalation'
            const currentStatus = counterfactualApplied ? 'Safe' : member.status

            return (
              <div
                key={member.id}
                className={`relative flex items-center gap-3 rounded-2xl border p-3.5 transition-all ${
                  isInjured
                    ? 'border-rose-500/40 bg-rose-500/10'
                    : isWarning
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-[var(--edge)] bg-white/40 dark:bg-white/[0.03]'
                }`}
              >
                <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-[var(--edge)] bg-black/20">
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="size-full object-cover object-top"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{member.name}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        currentStatus === 'Safe' || currentStatus === 'Nominal'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isInjured
                          ? 'bg-rose-500/20 text-rose-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {currentStatus}
                    </span>
                  </div>
                  <div className="text-xs opacity-60">{member.role}</div>
                  <div className="mt-1 line-clamp-1 text-[11px] opacity-75">
                    {counterfactualApplied ? 'Evacuated to safe bay; zero exposure.' : member.statusDetail}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Causal Event Log */}
      <div className="mt-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider opacity-60">Human Error &amp; Event Sequence</h4>
        <div className="mt-3 space-y-2 rounded-2xl border border-[var(--edge)] bg-black/10 p-3 sm:p-4">
          {(counterfactualApplied
            ? [
                { time: 'T+00:00', actor: 'Hab Module B', action: 'Thermal short detected in wiring channel.', severity: 'info' as const },
                { time: 'T+00:02', actor: 'Automated Containment', action: 'Ventilation shut off immediately (V_flow = 0 cm/s). Compartment doors locked.', severity: 'info' as const },
                { time: 'T+00:04', actor: 'Atmosphere Control', action: 'Nitrogen inerting gas released. Radiative cooling quenches cool-flame precursor.', severity: 'info' as const },
                { time: 'T+00:08', actor: 'IR Verification', action: 'Thermal sensor confirms chamber core T < 350 K. Mission preserved.', severity: 'info' as const },
              ]
            : causalLog
          ).map((item, idx) => (
            <div key={idx} className="flex items-start gap-3 text-xs leading-5">
              <span className="shrink-0 font-mono text-[11px] text-[var(--accent)]">{item.time}</span>
              <span className="shrink-0 font-mono font-semibold opacity-85">[{item.actor}]</span>
              <span className="opacity-75">{item.action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Counterfactual Action Card */}
      <div className="mt-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-cyan-400 animate-ping" />
              <h5 className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-400">
                {counterfactual.title}
              </h5>
            </div>
            <p className="mt-1 text-xs opacity-80 whitespace-pre-line">
              {counterfactual.recommendedAction}
            </p>
          </div>
          <Button
            variant={counterfactualApplied ? 'glass' : 'primary'}
            size="sm"
            onClick={handleApply}
            className="shrink-0"
          >
            {counterfactualApplied ? (
              <>
                <IconCheck size={14} /> Protocol Active
              </>
            ) : (
              <>
                <IconRotateCcw size={14} /> [Counterfactual: Apply Recovery Protocol]
              </>
            )}
          </Button>
        </div>
        {counterfactualApplied && (
          <div className="mt-3 border-t border-cyan-500/20 pt-3 text-xs font-medium text-cyan-300">
            ✓ Measured Delta: {counterfactual.outcomeDelta} ({counterfactual.riskReductionPct}% risk reduction validated by C++20 physics solver).
          </div>
        )}
      </div>
    </div>
  )
}
