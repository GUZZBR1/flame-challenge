import { riskIndexLocal } from '../sim-bridge/risk'

/**
 * "What could you simulate?" decision cards — each option's score is the
 * model's containment efficacy / safety margin for that operating point,
 * computed by the same risk engine the C++ backend exposes.
 */

export interface DecisionModel {
  materialId: string
  o2Pct: number
  flowCms: number
  gravity?: string
}

/** 0..100 — higher is safer (1 - riskIndex) */
export function decisionScore(m: DecisionModel): number {
  const r = riskIndexLocal(m.materialId, m.o2Pct, m.flowCms, m.gravity ?? 'microgravity')
  return Math.max(1, Math.round((1 - r.riskIndex) * 100))
}
