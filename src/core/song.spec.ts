import { describe, expect, it } from 'vitest'
import {
  anySoloed,
  clampStepsToLength,
  createChannel,
  createSection,
  createSong,
  generateId,
  groupRuns,
  isChannelSilenced,
  isStepOn,
  MAX_CHANNELS,
  nextFreeOutput,
  normalizeLoopRange,
  stepCount,
  totalBars,
  stepsPerBar,
  withStepSet,
  withStepToggled,
  MIN_DIVISION,
  MAX_DIVISION,
  cellDivision,
  clampDivision,
  gatesOf,
  mapDivisionSteps,
  pruneDivisions,
  withDivisionSet,
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
    expect(createChannel(61).name).toBe('Out 62')
    expect(createChannel(3, { name: 'Kick', muted: true }).muted).toBe(true)
    expect(createChannel(3).solo).toBe(false)
  })

  it('isChannelSilenced: mute always silences, solo silences every other channel', () => {
    const a = createChannel(0)
    const b = createChannel(1)
    const c = createChannel(2)
    const all = [a, b, c]
    expect(anySoloed(all)).toBe(false)
    expect(all.map((ch) => isChannelSilenced(ch, all))).toEqual([false, false, false])

    a.solo = true
    expect(anySoloed(all)).toBe(true)
    expect(all.map((ch) => isChannelSilenced(ch, all))).toEqual([false, true, true])

    // A second solo joins the first instead of replacing it.
    b.solo = true
    expect(all.map((ch) => isChannelSilenced(ch, all))).toEqual([false, false, true])

    // An explicit mute wins even on a soloed channel.
    a.muted = true
    expect(isChannelSilenced(a, all)).toBe(true)
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

  it('returns null when all 62 outputs are used', () => {
    const all = Array.from({ length: MAX_CHANNELS }, (_, i) => createChannel(i))
    expect(nextFreeOutput(all)).toBeNull()
  })
})

describe('loop points', () => {
  it('counts the bars of the whole song', () => {
    expect(totalBars([])).toBe(0)
    expect(totalBars([{ bars: 4 }, { bars: 2 }, { bars: 1 }])).toBe(7)
  })

  it('keeps a sane range as it is', () => {
    expect(normalizeLoopRange({ start: 2, end: 5 }, 8)).toEqual({ start: 2, end: 5 })
    expect(normalizeLoopRange({ start: 0, end: 8 }, 8)).toEqual({ start: 0, end: 8 })
  })

  it('turns a reversed range the right way round and rounds to whole bars', () => {
    expect(normalizeLoopRange({ start: 5, end: 2 }, 8)).toEqual({ start: 2, end: 5 })
    expect(normalizeLoopRange({ start: 1.4, end: 3.6 }, 8)).toEqual({ start: 1, end: 4 })
  })

  it('clamps a range to the song and drops one that no longer covers a bar', () => {
    expect(normalizeLoopRange({ start: 6, end: 20 }, 8)).toEqual({ start: 6, end: 8 })
    expect(normalizeLoopRange({ start: -3, end: 2 }, 8)).toEqual({ start: 0, end: 2 })
    expect(normalizeLoopRange({ start: 8, end: 12 }, 8)).toBeNull()
    expect(normalizeLoopRange({ start: 3, end: 3 }, 8)).toBeNull()
    expect(normalizeLoopRange({ start: 0, end: 1 }, 0)).toBeNull()
  })

  it('rejects anything that is not a pair of finite numbers', () => {
    expect(normalizeLoopRange(null, 8)).toBeNull()
    expect(normalizeLoopRange(undefined, 8)).toBeNull()
    expect(normalizeLoopRange('1-4', 8)).toBeNull()
    expect(normalizeLoopRange({ start: '1', end: 4 }, 8)).toBeNull()
    expect(normalizeLoopRange({ start: 1 }, 8)).toBeNull()
    expect(normalizeLoopRange({ start: 1, end: Number.NaN }, 8)).toBeNull()
    expect(normalizeLoopRange({ start: 1, end: Number.POSITIVE_INFINITY }, 8)).toBeNull()
  })
})

describe('divided steps', () => {
  it('clamps a division to a whole number from 1 to 8', () => {
    expect(MIN_DIVISION).toBe(1)
    expect(MAX_DIVISION).toBe(8)
    expect(clampDivision(3)).toBe(3)
    expect(clampDivision(2.6)).toBe(3)
    expect(clampDivision(0)).toBe(1)
    expect(clampDivision(12)).toBe(8)
    expect(clampDivision(NaN)).toBe(1)
  })

  it('sets and clears divisions immutably, dropping empty channels', () => {
    const one = withDivisionSet({}, 'a', 3, 4)
    expect(one).toEqual({ a: { 3: 4 } })
    const two = withDivisionSet(one, 'a', 5, 2)
    expect(two).toEqual({ a: { 3: 4, 5: 2 } })
    expect(one).toEqual({ a: { 3: 4 } })
    expect(withDivisionSet(two, 'a', 3, 1)).toEqual({ a: { 5: 2 } })
    expect(withDivisionSet(withDivisionSet(two, 'a', 3, 1), 'a', 5, 0)).toEqual({})
    expect(withDivisionSet({}, 'a', 0, 1)).toEqual({})
    expect(withDivisionSet({}, 'a', 0, 99)).toEqual({ a: { 0: 8 } })
  })

  it('reads a cell\'s division only while the step is on', () => {
    const section = createSection({ steps: { a: [2] }, divisions: { a: { 2: 3, 4: 5 } } })
    expect(cellDivision(section, 'a', 2)).toBe(3)
    expect(cellDivision(section, 'a', 4)).toBe(1)
    expect(cellDivision(section, 'a', 0)).toBe(1)
    expect(cellDivision(section, 'b', 2)).toBe(1)
  })

  it('prunes divisions of steps that are off, out of range or plain', () => {
    const pruned = pruneDivisions({ a: { 1: 3, 2: 4, 7: 1 }, b: { 0: 2 }, c: { 0: 9 } }, { a: [1, 7], c: [0] })
    expect(pruned).toEqual({ a: { 1: 3 }, c: { 0: 8 } })
  })

  it('moves divisions with their steps and drops the ones sent nowhere', () => {
    const moved = mapDivisionSteps({ a: { 1: 3, 5: 2 }, b: { 2: 4 } }, (s) => (s < 2 ? s : s < 4 ? null : s - 2))
    expect(moved).toEqual({ a: { 1: 3, 3: 2 } })
  })

  it('turns on-steps into gates: runs of plain steps, and a divided step\'s own gates', () => {
    const divisions: Record<number, number> = { 2: 3, 6: 2 }
    const gates = gatesOf([0, 1, 2, 3, 4, 6, 9], (s) => divisions[s] ?? 1)
    expect(gates).toEqual([
      { start: 0, end: 1, division: 1, slot: 0 },
      { start: 2, end: 2, division: 3, slot: 0 },
      { start: 2, end: 2, division: 3, slot: 1 },
      { start: 2, end: 2, division: 3, slot: 2 },
      { start: 3, end: 4, division: 1, slot: 0 },
      { start: 6, end: 6, division: 2, slot: 0 },
      { start: 6, end: 6, division: 2, slot: 1 },
      { start: 9, end: 9, division: 1, slot: 0 },
    ])
    expect(gatesOf([], () => 4)).toEqual([])
  })
})
