import { useCallback, useEffect, useState } from 'react'
import BuildPalette from './ui/BuildPalette'
import EventFeed from './ui/EventFeed'
import ExperimentModal from './ui/ExperimentModal'
import InspectPanel from './ui/InspectPanel'
import MasterSheet from './ui/MasterSheet'
import MissionModal from './ui/MissionModal'
import { GameOverOverlay, IntroOverlay } from './ui/Overlays'
import PlaybookPanel from './ui/PlaybookPanel'
import PsiGrid from './ui/PsiGrid'
import RiskBoard from './ui/RiskBoard'
import SimulateBar from './ui/SimulateBar'
import TopBar from './ui/TopBar'
import HangarScene from './ui/HangarScene'
import ShipyardSpaceScene from './ui/ShipyardSpaceScene'
import WorldView, { type Selection } from './renderer/WorldView'
import { engine, useGameVersion } from './state/store'
import { injectTarget } from './game/masterSheet'
import type { RoomType } from './game/types'
import type { DashConditions, MasterRow } from './types'

export default function App() {
  const [sceneView, setSceneView] = useState<'foundry' | 'hangar' | 'shipyard'>('foundry')
  const [started, setStarted] = useState(false)
  const [mode, setMode] = useState<'inspect' | RoomType>('inspect')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [expRoom, setExpRoom] = useState<number | null>(null)
  const [missionOpen, setMissionOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [cond, setCond] = useState<DashConditions>({
    env: 'microgravity',
    o2Pct: 21,
    flowCms: 0,
    tag: null,
  })
  useGameVersion()

  const patchCond = useCallback(
    (p: Partial<DashConditions>) => setCond((c) => ({ ...c, ...p })),
    [],
  )

  /** decision card / replay chip — rebuild the yard and adopt its conditions */
  const applyPreset = useCallback(
    (id: string, patch: Partial<DashConditions>) => {
      if (engine.loadPreset(id)) patchCond(patch)
    },
    [patchCond],
  )

  /** grid cell / master-sheet row → inject into the 2.5D yard */
  const injectRow = useCallback((row: MasterRow) => {
    const t = injectTarget(row)
    if (!t) return
    if (t.kind === 'scenario') engine.triggerScenario(t.id)
    else engine.injectExperiment(t.invId, t.o2, t.flow)
  }, [])

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
        setSceneView('foundry')
        setMode('inspect')
        setExpRoom(null)
        setMissionOpen(false)
        setSheetOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-void text-white">
      <TopBar
        engine={engine}
        onOpenMission={() => setMissionOpen(true)}
        onOpenData={() => setSheetOpen(true)}
      />
      <nav aria-label="Scene views" className="z-20 flex shrink-0 items-center gap-2 border-b border-edge bg-panel px-4 py-2">
        <button className={`rounded px-3 py-1.5 text-xs ${sceneView === 'foundry' ? 'bg-ice/20 text-ice' : 'text-mist hover:text-white'}`} onClick={() => setSceneView('foundry')}>Foundry</button>
        <button className={`rounded px-3 py-1.5 text-xs ${sceneView === 'hangar' ? 'bg-ice/20 text-ice' : 'text-mist hover:text-white'}`} onClick={() => setSceneView('hangar')}>Hangar</button>
        <button className={`rounded px-3 py-1.5 text-xs ${sceneView === 'shipyard' ? 'bg-ice/20 text-ice' : 'text-mist hover:text-white'}`} onClick={() => setSceneView('shipyard')}>Orbital Shipyard</button>
      </nav>
      {sceneView === 'hangar' ? (
        <div className="min-h-0 flex-1 overflow-auto p-3"><HangarScene /></div>
      ) : sceneView === 'shipyard' ? (
        <div className="relative min-h-0 flex-1"><ShipyardSpaceScene /></div>
      ) : (
        <>
      <SimulateBar cond={cond} onCond={patchCond} onApply={applyPreset} />
      <div className="relative min-h-0 flex-1">
        <WorldView
          engine={engine}
          mode={mode}
          selection={selection}
          onSelect={setSelection}
          onExitBuild={exitBuild}
        />
        <RiskBoard engine={engine} cond={cond} onCond={patchCond} />
        <PsiGrid cond={cond} onCond={patchCond} onInject={injectRow} onOpenSheet={() => setSheetOpen(true)} />
        <BuildPalette mode={mode} onMode={setMode} />
        <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-2">
          <InspectPanel
            engine={engine}
            selection={selection}
            onClose={() => setSelection(null)}
            onRunExperiment={(id) => setExpRoom(id)}
          />
          <PlaybookPanel engine={engine} onOpenMission={() => setMissionOpen(true)} />
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
        {sheetOpen && <MasterSheet onClose={() => setSheetOpen(false)} onInject={injectRow} />}
        {!started && <IntroOverlay onStart={() => setStarted(true)} />}
        <GameOverOverlay engine={engine} />
      </div>
        </>
      )}
    </div>
  )
}
