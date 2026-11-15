import { gravityRegime, type SiResponse, type SiSimulationCommands, type SiUiCommandEvent } from './api'
import type { ChamberState } from './live'
import { scrollToSection } from './scroll'

/** cross-screen sim state — the simulations deck mounts and unmounts
 *  while commands and frames fly, so the last chamber frame and the
 *  freshest ui-command live here, not only on the event wire. */

let lastFrame: ChamberState | null = null

/** LiveChamber publishes every streamed frame — the deck's flame glyph
 *  listens on 'ignis:sim-frame' and seeds from the stash so it keeps
 *  burning across remounts */
export function emitSimFrame(f: ChamberState): void {
  lastFrame = f
  window.dispatchEvent(new CustomEvent('ignis:sim-frame', { detail: f }))
}

export function getSimFrame(): ChamberState | null {
  return lastFrame
}

/** a ui-command stays "pending" only briefly — long enough for the
 *  deck to mount and seed from it after a 'go to simulations' command,
 *  never long enough to replay stale intent on a later open */
let pendingUiCmd: { cmd: SiUiCommandEvent; until: number } | null = null

export function emitUiCommand(cmd: SiUiCommandEvent): void {
  pendingUiCmd = { cmd, until: Date.now() + 2500 }
  window.dispatchEvent(new CustomEvent('ignis:ui-command', { detail: cmd }))
}

/** non-consuming read — several components can seed from the same
 *  fresh command (the chamber retunes+runs, the console syncs state) */
export function peekPendingUiCmd(): SiUiCommandEvent | null {
  if (!pendingUiCmd) return null
  if (Date.now() > pendingUiCmd.until) {
    pendingUiCmd = null
    return null
  }
  return pendingUiCmd.cmd
}

/** flatten a copilot simulation_commands block onto the ui-command bus
 *  — one mapping shared by the global voice HUD and the console's own
 *  mic/typed paths so "run saffire" relights the chamber no matter
 *  which input heard it. scopeInv is the investigation the answer was
 *  computed over; it's only attached when a chamber setting actually
 *  rides along (a containment-only order must not restart a run). */
export function emitSimulationCommands(
  sim: SiSimulationCommands | null | undefined,
  origin: string,
  scopeInv: string | null,
): void {
  if (!sim || !Object.values(sim).some((v) => v != null)) return
  const isRun =
    sim.load_preset != null ||
    sim.set_o2_percent != null ||
    sim.set_airflow_cm_s != null
  emitUiCommand({
    set_o2_percent: sim.set_o2_percent ?? null,
    set_airflow_cm_s: sim.set_airflow_cm_s ?? null,
    load_preset: sim.load_preset ?? null,
    set_gravity:
      sim.set_gravity_g != null ? gravityRegime(sim.set_gravity_g) : null,
    trigger_containment: sim.trigger_containment ?? null,
    __investigation:
      sim.set_o2_percent != null ||
      sim.set_airflow_cm_s != null ||
      sim.load_preset != null
        ? (sim.load_preset ?? scopeInv)
        : null,
    __origin: origin,
  })
  // "run saffire" said on a page without a chamber should still show
  // the burn — the deferred reveal lets the answer land first, then
  // opens the deck, which seeds the just-emitted command off the stash.
  // skipped when an overlay already answered the intent (a psi-dataset
  // navigation means the copilot pointed at the record, not a run)
  if (isRun) {
    window.setTimeout(() => {
      if (
        !document.getElementById('chamber') &&
        location.hash !== '#psi-dataset'
      ) {
        scrollToSection('chamber')
      }
    }, 350)
  }
}

/* ---------- copilot answer feed ----------

 *  every surface that talks to the copilot (console chat, console mic,
 *  global HUD voice + typed) files its answers here — the simulations
 *  deck renders them on the stage, so a spoken answer still lands on
 *  the response surface even when the console's own log is far down
 *  the deck. bounded; the stash lets a still-closed deck reopen with
 *  the last exchanges intact. */

export interface SiFeedEntry {
  id: number
  ts: number
  prompt: string | null
  resp: SiResponse
  origin: string
}

let feedId = 0
let feed: SiFeedEntry[] = []

export function emitSiEntry(
  prompt: string | null,
  resp: SiResponse,
  origin: string,
): void {
  const entry: SiFeedEntry = { id: feedId++, ts: Date.now(), prompt, resp, origin }
  feed = [...feed.slice(-13), entry]
  // the entry's evidence also feeds the copilot's cortex — brain.ts
  // listens on this same event channel
  window.dispatchEvent(new CustomEvent('ignis:si-entry', { detail: entry }))
}

export function getSiFeed(): SiFeedEntry[] {
  return feed
}
