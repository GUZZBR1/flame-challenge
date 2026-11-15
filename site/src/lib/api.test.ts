import { describe, expect, it } from 'vitest'
import { synthesizeLocalSiResponse, type SiChamberState } from './api'

const flex2: SiChamberState = {
  investigationId: 'flex-2',
  materialId: 'heptane',
  o2Pct: 21,
  flowCms: 0.5,
  gravity: 'microgravity',
}

describe('synthesizeLocalSiResponse — offline fallback parsing', () => {
  it('keeps the active rig for ordinary "same" usage', () => {
    const res = synthesizeLocalSiResponse('Use the same conditions at 18% oxygen.', flex2)
    expect(res.ui_command?.load_preset).toBe('flex-2')
    expect(res.ui_command?.set_o2_percent).toBe(18)
  })

  it('does not select BASS-II for the word "atmosphere"', () => {
    const res = synthesizeLocalSiResponse('Change the atmosphere to 18% oxygen', flex2)
    expect(res.ui_command?.load_preset).toBe('flex-2')
  })

  it('still resolves explicit SAME and BASS-II requests', () => {
    expect(
      synthesizeLocalSiResponse('Load the same-r rig', flex2).ui_command?.load_preset,
    ).toBe('same')
    expect(
      synthesizeLocalSiResponse('Switch to teflon for the SAME run', flex2).ui_command?.load_preset,
    ).toBe('same')
    expect(
      synthesizeLocalSiResponse('Run a bass sphere test', flex2).ui_command?.load_preset,
    ).toBe('bass-ii')
  })

  it('maps a bare PMMA mention to the flat-slab rig', () => {
    const res = synthesizeLocalSiResponse('What changes if oxygen drops to 14% on PMMA?', flex2)
    expect(res.ui_command?.load_preset).toBe('sofie-gel')
    expect(res.ui_command?.set_o2_percent).toBe(14)
    expect(res.evidence[0].fuel).toBe('pmma')
  })

  it('prefers pmma-sphere when the query names a sphere', () => {
    const res = synthesizeLocalSiResponse('Run the pmma sphere case', flex2)
    expect(res.ui_command?.load_preset).toBe('bass-ii')
    expect(res.evidence[0].fuel).toBe('pmma-sphere')
  })

  it('keeps a qualitative airflow shutdown at zero', () => {
    const res = synthesizeLocalSiResponse('Stop airflow on heptane', flex2)
    expect(res.ui_command?.load_preset).toBe('flex-2')
    expect(res.ui_command?.set_airflow_cm_s).toBe(0)
    expect(res.simulation_commands?.set_airflow_cm_s).toBe(0)
  })

  it('parses a target airflow over the mission default', () => {
    const res = synthesizeLocalSiResponse('Reduce airflow to 0 cm/s on cotton', flex2)
    expect(res.ui_command?.load_preset).toBe('saffire')
    expect(res.ui_command?.set_airflow_cm_s).toBe(0)
  })
})
