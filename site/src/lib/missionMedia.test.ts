import { describe, expect, it } from 'vitest'
import { missionMedia } from './missionMedia'

describe('missionMedia', () => {
  it('matches the seed reports to their NASA footage', () => {
    expect(missionMedia('flare', 'Lunar 0.16g').src).toContain('apollo11')
    expect(missionMedia('flex-2', 'Microgravity (0g)').src).toContain('sofie')
    expect(missionMedia('saffire', 'Microgravity (0g)').src).toContain('saffire5')
  })

  it('is case-insensitive on the investigation id', () => {
    expect(missionMedia('SAFFIRE', 'x').src).toContain('saffire5')
  })

  it('falls back on the gravity regime for unknown investigations', () => {
    expect(missionMedia('unknown', 'lunar').src).toContain('apollo11')
    expect(missionMedia('unknown', 'Earth 1g').src).toContain('acme')
    expect(missionMedia('unknown', 'Microgravity (0g)').src).toContain('skylab')
  })
})
