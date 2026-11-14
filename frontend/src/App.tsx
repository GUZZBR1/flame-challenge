import { useCallback, useEffect, useState } from 'react'
import BuildPalette from './ui/BuildPalette'
import EventFeed from './ui/EventFeed'
import ExperimentModal from './ui/ExperimentModal'
import InspectPanel from './ui/InspectPanel'
import MissionModal from './ui/MissionModal'
import { GameOverOverlay, IntroOverlay } from './ui/Overlays'
import TopBar from './ui/TopBar'
import WorldView, { type Selection } from './renderer/WorldView'
import { engine, useGameVersion } from './state/store'
import type { RoomType } from './game/types'

export default function App() {
  const [started, setStarted] = useState(false)
  const [mode, setMode] = useState<'inspect' | RoomType>('inspect')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [expRoom, setExpRoom] = useState<number | null>(null)
  const [missionOpen, setMissionOpen] = useState(false)
  useGameVersion()

  const exitBuild = useCallback(() => setMode('inspect'), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        engine.setSpeed(engine.state.speed === 0 ? 1 : 0)
      } else if (e.key === '1') engine.setSpeed(1)
      else if (e.key === '2') engine.setSpeed(2)
      else if (e.key === '3') engine.setSpeed(4)
      else if (e.key === 'Escape') {
        setMode('inspect')
        setExpRoom(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-void text-white">
      <TopBar engine={engine} onOpenMission={() => setMissionOpen(true)} />
      <div className="relative min-h-0 flex-1">
        <WorldView
          engine={engine}
          mode={mode}
          selection={selection}
          onSelect={setSelection}
          onExitBuild={exitBuild}
        />
        <BuildPalette mode={mode} onMode={setMode} />
        <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-2">
          <InspectPanel
            engine={engine}
            selection={selection}
            onClose={() => setSelection(null)}
            onRunExperiment={(id) => setExpRoom(id)}
          />
          <EventFeed engine={engine} />
        </div>
        {engine.state.notice && (
          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded border border-ember/40 bg-panel/95 px-3 py-1.5 text-[12px] text-ember">
            {engine.state.notice}
          </div>
        )}
        {expRoom !== null && (
          <ExperimentModal engine={engine} roomId={expRoom} onClose={() => setExpRoom(null)} />
        )}
        {missionOpen && <MissionModal engine={engine} onClose={() => setMissionOpen(false)} />}
        {!started && <IntroOverlay onStart={() => setStarted(true)} />}
        <GameOverOverlay engine={engine} />
      </div>
    </div>
  )
}
