import type { ChamberUiCommand } from './api'
import type { ChamberState } from './live'

/** Simulation frames and short-lived chamber commands survive deck remounts. */

let lastFrame: ChamberState | null = null

export function emitSimFrame(frame: ChamberState): void {
  lastFrame = frame
  window.dispatchEvent(new CustomEvent('ignis:sim-frame', { detail: frame }))
}

export function getSimFrame(): ChamberState | null {
  return lastFrame
}

let pendingUiCmd: { cmd: ChamberUiCommand; until: number } | null = null

export function emitUiCommand(cmd: ChamberUiCommand): void {
  pendingUiCmd = { cmd, until: Date.now() + 2500 }
  window.dispatchEvent(new CustomEvent('ignis:ui-command', { detail: cmd }))
}

export function peekPendingUiCmd(): ChamberUiCommand | null {
  if (!pendingUiCmd) return null
  if (Date.now() > pendingUiCmd.until) {
    pendingUiCmd = null
    return null
  }
  return pendingUiCmd.cmd
}

export function emitSimulationCommands(
  sim: import('./api').SiSimulationCommands | null | undefined,
  origin: string,
  scopeInv: string | null,
): void {
  if (!sim || !Object.values(sim).some((value) => value != null)) return
  const hasRunCondition = sim.load_preset != null || sim.set_o2_percent != null || sim.set_airflow_cm_s != null
  emitUiCommand({
    load_preset: sim.load_preset ?? null,
    set_o2_percent: sim.set_o2_percent ?? null,
    set_airflow_cm_s: sim.set_airflow_cm_s ?? null,
    set_gravity_g: sim.set_gravity_g ?? null,
    trigger_containment: sim.trigger_containment ?? null,
    __investigation: sim.load_preset ?? (hasRunCondition ? scopeInv : null),
    __origin: origin,
    __run: hasRunCondition,
  })
}
