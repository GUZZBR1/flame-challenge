import type { Investigation } from '../types'
import calib from '../data/calibration.json'
import riskModel from '../data/risk_model.json'

/**
 * Comparative telemetry — the 1 g vs 0 g contrast that makes non-specialist
 * judges immediately "get" why space fire is a different problem.
 * Text is anchored to each investigation's measured PSI metrics.
 */

export interface GravityContrast {
  earth: string
  space: string
}

const CALIB_INV = (calib as { investigations: Record<string, { materialId: string }> })
  .investigations
const MATS =
  (riskModel as { materials?: Record<string, { burnRateMedianMm2s?: number }> }).materials ?? {}

/** d²-law burnout estimate for a ~4 mm droplet using the PSI-fitted burn rate */
function dropletBurnoutSecs(inv: Investigation): number | null {
  if (inv.category !== 'droplet') return null
  const matId = CALIB_INV[inv.id]?.materialId
  const k = matId ? MATS[matId]?.burnRateMedianMm2s : null
  return k ? Math.round(16 / k) : null
}

export function gravityContrast(inv: Investigation): GravityContrast {
  const spread = inv.metrics.flameSpreadRateCms
  const loc = inv.metrics.limitingOxygenPct
  const t = dropletBurnoutSecs(inv)

  switch (inv.category) {
    case 'droplet':
      return {
        earth: `Buoyant plume sheds the vapor cloud —${t ? ` d²-law burnout ≈ ${t} s for a 4 mm droplet,` : ''} then it is out for good.`,
        space:
          'Spherical diffusion flame → radiative extinction → an invisible ~600 K cool-flame stage keeps burning (FLEX · PSI-39).',
      }
    case 'solid-flame-spread':
      return {
        earth: `Buoyant flow ~1 m/s flushes heat from the fuel bed — below-LOC samples self-extinguish (LOC ${loc ?? '?'}%).`,
        space: `Spreads at ${spread ? `${spread.min}–${spread.max}` : '?'} cm/s on forced flow alone — ${inv.name.split(' ')[0]} burned below its Earth LOC.`,
      }
    case 'gaseous-diffusion':
      return {
        earth: 'Buoyancy lifts soot out of the flame zone — cleaner burn, faster plume venting.',
        space: 'Soot stays trapped inside the spherical flame — ACME measured record soot volume fractions.',
      }
    case 'large-scale-fire':
      return {
        earth: 'The plume rises; upstream material starves as vitiated air pools — large items often self-limit.',
        space: 'No buoyant venting — the flame follows the duct at forced-flow speed (SAFFIRE 5–25 cm/s).',
      }
    case 'confined':
    case 'smoke-aerosol':
      return {
        earth: 'Convection carries smoke and aerosols away from the fire zone in seconds.',
        space: 'Aerosols accumulate around the source — smoke lingers and masks hot spots (SAME).',
      }
    case 'partial-gravity':
      return {
        earth: 'Full buoyancy — convective cooling and plume venting dominate.',
        space: `At ${inv.gravity === 'partial-gravity' ? '0.38 g (Mars)' : 'reduced g'} buoyancy weakens — spread sits between Earth and ISS regimes.`,
      }
    default:
      return {
        earth: 'Buoyant convection removes heat and combustion products.',
        space: 'Diffusion dominates — flames become spherical, persistent and harder to detect.',
      }
  }
}
