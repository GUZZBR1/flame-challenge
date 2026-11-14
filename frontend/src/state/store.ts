import { useSyncExternalStore } from 'react'
import { Engine } from '../game/engine'

/** single live game instance for the app session */
export const engine = new Engine()

/** re-render subscribing components every engine emit (~every tick) */
export function useGameVersion(): number {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.state.version,
  )
}
