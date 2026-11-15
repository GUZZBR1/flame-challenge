import { useState } from 'react'
import { emitSimulationCommands } from '../lib/simBus'
import { navigate } from '../lib/scroll'
import Button from './ui/Button'
import { IconArrowUpRight, IconCheck } from './Icons'

interface CounterfactualTrackCardProps {
  scenarioTitle?: string
  originalAction?: string
  originalIntegrityPct?: number
  originalCasualties?: string
  siProtocolAction?: string
  siProtocolIntegrityPct?: number
  siProtocolCasualties?: string
  recommendedFlowCms?: number
  investigationId?: string
  baselineO2?: number
}

/**
 * Counterfactual Decision Track Card
 * Compares the Original Mission Outcome against the SI Recommended Containment Protocol
 * using clean horizontal track bars (#ECEAE4 background) and includes the 1-click
 * [Simulate Counterfactual in Live Chamber →] execution trigger.
 */
export default function CounterfactualTrackCard({
  scenarioTitle = 'Artemis Airlock Smolder Incident',
  originalAction = 'Maintain 20 cm/s ventilation attempting smoke clearance & visual inspection',
  originalIntegrityPct = 19,
  originalCasualties = '1 Severe Casualty (Smoke Inhalation / Flash Burn)',
  siProtocolAction = 'Immediate ventilation cutoff (V_flow = 0 cm/s) + N₂ inerting + UV thermal radiometric scan',
  siProtocolIntegrityPct = 86,
  siProtocolCasualties = 'Zero Casualties · Module Preserved',
  recommendedFlowCms = 0.0,
  investigationId = 'saffire',
  baselineO2,
}: CounterfactualTrackCardProps) {
  const [dispatched, setDispatched] = useState(false)

  const handleSimulate = () => {
    setDispatched(true)
    const commandSet = {
      set_airflow_cm_s: recommendedFlowCms,
      trigger_containment: 'cabin_seal_n2_purge',
      __investigation: investigationId,
      __run: true,
      ...(typeof baselineO2 === 'number' ? { set_o2_percent: baselineO2 } : {}),
    }
    emitSimulationCommands(commandSet, 'counterfactual-track', investigationId)
    window.dispatchEvent(
      new CustomEvent('ignis:ui-command', {
        detail: {
          load_preset: investigationId,
          set_airflow_cm_s: recommendedFlowCms,
          trigger_containment: 'cabin_seal_n2_purge',
          __run: true,
          ...(typeof baselineO2 === 'number' ? { set_o2_percent: baselineO2 } : {}),
        },
      }),
    )
    navigate('#simulations')
  }

  return (
    <div className="rounded-[28px] border border-[var(--edge)] bg-[color-mix(in_srgb,var(--panel)_85%,transparent)] p-5 shadow-xl backdrop-blur-xl sm:p-7">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--edge)] pb-4">
        <div>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
            Counterfactual Recovery Decision Track
          </span>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold sm:text-2xl">
            {scenarioTitle} — Causal Outcome Contrast
          </h3>
          <p className="mt-0.5 text-xs opacity-70">
            Comparing human error escalation against the calibrated NASA PSI safety doctrine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs font-semibold text-cyan-400">
            Delta: +{siProtocolIntegrityPct - originalIntegrityPct}% Survival
          </span>
        </div>
      </div>

      {/* Comparison Track Bars */}
      <div className="mt-6 space-y-6">
        {/* Track 1: Original Human Error Outcome */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between text-xs">
            <span className="font-mono font-semibold text-rose-400">
              [ORIGINAL HUMAN ERROR] {originalAction}
            </span>
            <span className="font-mono font-bold text-rose-400">
              {originalIntegrityPct}% Integridade · {originalCasualties}
            </span>
          </div>
          {/* Track Bar with #ECEAE4 background */}
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-[#eceae4] dark:bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-700"
              style={{ width: `${originalIntegrityPct}%` }}
            />
          </div>
        </div>

        {/* Track 2: SI Recommended Protocol Outcome */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between text-xs">
            <span className="font-mono font-semibold text-cyan-400">
              [SI PROTOCOL DOCTRINE] {siProtocolAction}
            </span>
            <span className="font-mono font-bold text-emerald-400">
              {siProtocolIntegrityPct}% Integridade · {siProtocolCasualties}
            </span>
          </div>
          {/* Track Bar with #ECEAE4 background */}
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-[#eceae4] dark:bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-700"
              style={{ width: `${siProtocolIntegrityPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Action Execution Button */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--edge)] pt-4">
        <p className="text-xs leading-relaxed opacity-75 max-w-xl">
          A aplicação imediata do protocolo NASA PSI zera o suprimento convectivo de oxigênio (V_flow &rarr; 0 cm/s),
          forçando a frente de chama a entrar em extinção radiativa espontânea.
        </p>
        <Button
          variant={dispatched ? 'glass' : 'primary'}
          size="default"
          onClick={handleSimulate}
          className="shrink-0"
        >
          {dispatched ? (
            <>
              <IconCheck size={16} /> Dispatched to Live Chamber
            </>
          ) : (
            <>
              Simulate Counterfactual in Live Chamber <IconArrowUpRight size={16} />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
