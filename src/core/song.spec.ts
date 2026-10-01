import { describe, expect, it } from 'vitest'
import {
  MAX_CHANNELS,
  clampStepsToLength,
  createChannel,
  createSection,
  createSong,
  generateId,
  groupRuns,
  isStepOn,
  nextFreeOutput,
  stepCount,
  stepsPerBar,
  withStepSet,
  withStepToggled,
} from './song'

describe('song factories', () => {
  it('creates a default song with 8 channels and one section at 120 BPM', () => {
    const song = createSong('Test')
    expect(song.name).toBe('Test')
    expect(song.channels).toHaveLength(8)
    expect(song.channels.map((c) => c.output)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(song.sections).toHaveLength(1)
    expect(song.sections[0]?.tempo).toBe(120)
    expect(song.settings.baseNote).toBe(36)
    expect(song.settings.midiChannel).toBe(1)
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateId()))
    expect(ids.size).toBe(500)
  })

  it('createChannel names channels after their 1-based output', () => {
    expect(createChannel(0).name).toBe('Out 1')
    expect(createChannel(62).name).toBe('Out 63')
    expect(createChannel(3, { name: 'Kick', muted: true }).muted).toBe(true)
  })

  it('createSection applies overrides', () => {
    const s = createSection({ bars: 2, tempo: 90, timeSignature: { beats: 7, unit: 8 } })
    expect(s.bars).toBe(2)
    expect(s.tempo).toBe(90)
    expect(s.timeSignature).toEqual({ beats: 7, unit: 8 })
    expect(s.subdivision).toBe(4)
  })
})

describe('step arithmetic', () => {
  it('computes steps per bar from time signature and subdivision', () => {
    expect(stepsPerBar({ timeSignature: { beats: 4, unit: 4 }, subdivision: 4 })).toBe(16)
    expect(stepsPerBar({ timeSignature: { beats: 7, unit: 8 }, subdivision: 2 })).toBe(14)
    expect(stepsPerBar({ timeSignature: { beats: 3, unit: 4 }, subdivision: 1 })).toBe(3)
  })

  it('computes total step count', () => {
    expect(stepCount({ timeSignature: { beats: 4, unit: 4 }, subdivision: 4, bars: 4 })).toBe(64)
  })

  it('toggles steps immutably and keeps lists sorted', () => {
    const a = withStepToggled(undefined, 5)
    expect(a).toEqual([5])
    const b = withStepToggled(a, 2)
    expect(b).toEqual([2, 5])
    expect(a).toEqual([5])
    expect(withStepToggled(b, 5)).toEqual([2])
  })

  it('sets steps idempotently', () => {
    expect(withStepSet([1], 1, true)).toEqual([1])
    expect(withStepSet([1], 1, false)).toEqual([])
    expect(withStepSet([], 3, true)).toEqual([3])
    expect(withStepSet(undefined, 3, false)).toEqual([])
  })

  it('isStepOn reads the section grid', () => {
    const s = createSection({ steps: { ch1: [0, 4] } })
    expect(isStepOn(s, 'ch1', 4)).toBe(true)
    expect(isStepOn(s, 'ch1', 3)).toBe(false)
    expect(isStepOn(s, 'missing', 0)).toBe(false)
  })

  it('clamps steps that fall outside the new section length', () => {
    expect(clampStepsToLength({ a: [0, 15, 16, 40], b: [99] }, 16)).toEqual({ a: [0, 15] })
  })

  it('groups consecutive steps into runs', () => {
    expect(groupRuns([])).toEqual([])
    expect(groupRuns([3])).toEqual([[3, 3]])
    expect(groupRuns([0, 1, 2, 5, 6, 9])).toEqual([
      [0, 2],
      [5, 6],
      [9, 9],
    ])
    expect(groupRuns([2, 1, 1, 0])).toEqual([[0, 2]])
  })
})

describe('nextFreeOutput', () => {
  it('returns the lowest unused output', () => {
    expect(nextFreeOutput([])).toBe(0)
    expect(nextFreeOutput([createChannel(0), createChannel(2)])).toBe(1)
  })

  it('returns null when all 63 outputs are used', () => {
    const all = Array.from({ length: MAX_CHANNELS }, (_, i) => createChannel(i))
    expect(nextFreeOutput(all)).toBeNull()
  })
})
