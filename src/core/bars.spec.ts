import { describe, expect, it } from 'vitest'
import { clampBarRange, deleteBars, insertBars, readBars, type BarClip } from './bars'
import { createChannel, createSection, createSong, type Song } from './song'
import { resolveTempos } from './timing'

/** A song of two channels and the given sections (4/4, 4 steps per beat unless overridden). */
function song(...sections: Parameters<typeof createSection>[0][]): Song {
  const s = createSong()
  s.channels = [createChannel(0, { id: 'a' }), createChannel(1, { id: 'b' })]
  s.sections = sections.map((overrides) => createSection(overrides))
  return s
}

function bars(s: Song): number[] {
  return s.sections.map((section) => section.bars)
}

describe('clampBarRange', () => {
  it('trims to the song and drops an empty range', () => {
    expect(clampBarRange({ start: -2, end: 3 }, 8)).toEqual({ start: 0, end: 3 })
    expect(clampBarRange({ start: 6, end: 20 }, 8)).toEqual({ start: 6, end: 8 })
    expect(clampBarRange({ start: 8, end: 9 }, 8)).toBeNull()
    expect(clampBarRange({ start: 3, end: 3 }, 8)).toBeNull()
  })
})

describe('readBars', () => {
  it('lifts the bars, with their gates counted from each bar and the section they came from', () => {
    const s = song(
      { name: 'A', tempo: 120, bars: 2, steps: { a: [0, 15, 16, 31], b: [17] } },
      { name: 'B', tempo: null, bars: 1, subdivision: 2, timeSignature: { beats: 3, unit: 4 }, steps: { b: [5] } },
    )
    const clip = readBars(s, { start: 1, end: 3 })!
    expect(clip.channels).toBe(2)
    expect(clip.bars).toHaveLength(2)
    expect(clip.bars[0]).toEqual({
      name: 'A',
      tempo: 120,
      timeSignature: { beats: 4, unit: 4 },
      subdivision: 4,
      rows: [[0, 15], [1]],
      divisions: [{}, {}],
    })
    expect(clip.bars[1]).toEqual({
      name: 'B',
      tempo: 120,
      timeSignature: { beats: 3, unit: 4 },
      subdivision: 2,
      rows: [[], [5]],
      divisions: [{}, {}],
    })
    // The clip holds copies: editing the song afterwards does not reach it.
    s.sections[0]!.timeSignature.beats = 7
    expect(clip.bars[0]!.timeSignature.beats).toBe(4)
  })

  it('is null for a range outside the song', () => {
    expect(readBars(song({ bars: 2 }), { start: 2, end: 4 })).toBeNull()
  })
})

describe('deleteBars', () => {
  it('takes bars out of the middle of a section and moves the later gates up', () => {
    const s = song({ bars: 4, steps: { a: [0, 16, 20, 32, 48, 63], b: [17] } })
    expect(deleteBars(s, { start: 1, end: 3 })).toEqual({ start: 1, end: 3 })
    expect(bars(s)).toEqual([2])
    expect(s.sections[0]!.steps).toEqual({ a: [0, 16, 31] })
  })

  it('takes bars across sections and removes a section left with none', () => {
    const s = song(
      { name: 'A', bars: 2, steps: { a: [0, 16] } },
      { name: 'B', bars: 1, steps: { a: [3] } },
      { name: 'C', bars: 2, steps: { a: [0, 16] } },
    )
    expect(deleteBars(s, { start: 1, end: 4 })).toEqual({ start: 1, end: 4 })
    expect(s.sections.map((x) => x.name)).toEqual(['A', 'C'])
    expect(bars(s)).toEqual([1, 1])
    expect(s.sections[0]!.steps).toEqual({ a: [0] })
    expect(s.sections[1]!.steps).toEqual({ a: [0] })
  })

  it('can empty the song, and clamps the range to it', () => {
    const s = song({ bars: 2 }, { bars: 2 })
    expect(deleteBars(s, { start: 2, end: 10 })).toEqual({ start: 2, end: 4 })
    expect(bars(s)).toEqual([2])
    expect(deleteBars(s, { start: 5, end: 10 })).toBeNull()
    expect(deleteBars(s, { start: 0, end: 2 })).toEqual({ start: 0, end: 2 })
    expect(s.sections).toEqual([])
  })

  it('keeps a section at its tempo when the one it inherited from goes', () => {
    const s = song({ name: 'A', tempo: 100, bars: 1 }, { name: 'B', tempo: 150, bars: 1 }, { name: 'C', tempo: null, bars: 1 })
    deleteBars(s, { start: 1, end: 2 })
    expect(s.sections.map((x) => x.name)).toEqual(['A', 'C'])
    expect(s.sections[1]!.tempo).toBe(150)
    expect(resolveTempos(s.sections)).toEqual([100, 150])
  })
})

describe('insertBars', () => {
  const slice = (rows: number[][], extra: Partial<BarClip['bars'][number]> = {}) => ({
    name: 'X',
    tempo: 90,
    timeSignature: { beats: 4 as const, unit: 4 as const },
    subdivision: 4 as const,
    rows,
    divisions: rows.map(() => ({})),
    ...extra,
  })

  it('splices bars that keep the same time into the section, pushing later gates along', () => {
    const s = song({ tempo: 120, bars: 2, steps: { a: [0, 16], b: [31] } })
    const clip: BarClip = { channels: 2, bars: [slice([[1], [2]]), slice([[], [3]])] }
    expect(insertBars(s, clip, 1)).toEqual({ start: 1, end: 3 })
    expect(bars(s)).toEqual([4])
    expect(s.sections[0]!.tempo).toBe(120)
    expect(s.sections[0]!.steps).toEqual({ a: [0, 17, 48], b: [18, 35, 63] })
  })

  it('appends after the last bar and lands at the start', () => {
    const s = song({ bars: 1, steps: { a: [0] } })
    const clip: BarClip = { channels: 1, bars: [slice([[4]])] }
    expect(insertBars(s, clip, 1)).toEqual({ start: 1, end: 2 })
    expect(s.sections[0]!.steps).toEqual({ a: [0, 20] })
    expect(insertBars(s, clip, 0)).toEqual({ start: 0, end: 1 })
    expect(bars(s)).toEqual([3])
    expect(s.sections[0]!.steps).toEqual({ a: [4, 16, 36] })
    // Past the end lands at the end; rows past the last channel are dropped.
    const wide: BarClip = { channels: 3, bars: [slice([[], [1], [2]])] }
    expect(insertBars(s, wide, 99)).toEqual({ start: 3, end: 4 })
    expect(s.sections[0]!.steps).toEqual({ a: [4, 16, 36], b: [49] })
  })

  it('makes a section of bars that keep time differently, splitting the one they land in', () => {
    const s = song({ name: 'A', tempo: 120, bars: 2, steps: { a: [0, 15, 16, 31] } })
    const waltz = slice([[0, 5]], { name: 'W', tempo: 90, timeSignature: { beats: 3, unit: 4 }, subdivision: 2 })
    expect(insertBars(s, { channels: 1, bars: [waltz, waltz] }, 1)).toEqual({ start: 1, end: 3 })
    expect(s.sections.map((x) => [x.name, x.bars, x.tempo])).toEqual([
      ['A', 1, 120],
      ['W', 2, 90],
      ['A', 1, 120],
    ])
    expect(s.sections[0]!.steps).toEqual({ a: [0, 15] })
    expect(s.sections[1]!.steps).toEqual({ a: [0, 5, 6, 11] })
    expect(s.sections[1]!.timeSignature).toEqual({ beats: 3, unit: 4 })
    expect(s.sections[1]!.subdivision).toBe(2)
    expect(s.sections[2]!.steps).toEqual({ a: [0, 15] })
    expect(s.sections[1]!.id).not.toBe(s.sections[2]!.id)
    expect(s.sections[0]!.id).not.toBe(s.sections[2]!.id)
  })

  it('puts a differently timed run before or after a section without splitting it', () => {
    const s = song({ name: 'A', bars: 1 }, { name: 'B', bars: 1 })
    const half = slice([[]], { name: 'H', subdivision: 8 })
    expect(insertBars(s, { channels: 1, bars: [half] }, 1)).toEqual({ start: 1, end: 2 })
    expect(s.sections.map((x) => x.name)).toEqual(['A', 'H', 'B'])
    expect(insertBars(s, { channels: 1, bars: [half] }, 3)).toEqual({ start: 3, end: 4 })
    expect(s.sections.map((x) => x.name)).toEqual(['A', 'H', 'B', 'H'])
  })

  it('mixes runs: bars that fit join the section, the rest get their own, in order', () => {
    const s = song({ name: 'A', tempo: 120, bars: 2 })
    const clip: BarClip = {
      channels: 1,
      bars: [slice([[0]]), slice([[1]], { subdivision: 1, name: 'Q' }), slice([[2]])],
    }
    expect(insertBars(s, clip, 1)).toEqual({ start: 1, end: 4 })
    expect(s.sections.map((x) => [x.name, x.bars])).toEqual([
      ['A', 2],
      ['Q', 1],
      ['A', 2],
    ])
    expect(s.sections[0]!.steps).toEqual({ a: [16] })
    expect(s.sections[1]!.steps).toEqual({ a: [1] })
    expect(s.sections[2]!.steps).toEqual({ a: [2] })
  })

  it('keeps a section at its tempo when a faster one is put in front of it', () => {
    const s = song({ name: 'A', tempo: 120, bars: 1 }, { name: 'B', tempo: null, bars: 1 })
    const fast = slice([[]], { name: 'F', tempo: 200, subdivision: 8 })
    insertBars(s, { channels: 1, bars: [fast] }, 1)
    expect(s.sections.map((x) => x.name)).toEqual(['A', 'F', 'B'])
    expect(resolveTempos(s.sections)).toEqual([120, 200, 120])
  })

  it('does nothing with an empty clip, and fills an empty song', () => {
    const s = song()
    expect(insertBars(s, { channels: 2, bars: [] }, 0)).toBeNull()
    expect(insertBars(s, { channels: 2, bars: [slice([[0], [1]])] }, 0)).toEqual({ start: 0, end: 1 })
    expect(s.sections.map((x) => [x.name, x.bars, x.tempo])).toEqual([['X', 1, 90]])
    expect(s.sections[0]!.steps).toEqual({ a: [0], b: [1] })
  })
})

describe('divisions in bars', () => {
  it('travel with their bars when bars are read, deleted and inserted', () => {
    const s = song({ name: 'A', tempo: 120, bars: 3, steps: { a: [0, 16, 17, 32], b: [20] } })
    s.sections[0]!.divisions = { a: { 16: 3, 32: 2 }, b: { 20: 4 } }
    const clip = readBars(s, { start: 1, end: 2 })!
    expect(clip.bars[0]!.rows).toEqual([[0, 1], [4]])
    expect(clip.bars[0]!.divisions).toEqual([{ 0: 3 }, { 4: 4 }])

    expect(deleteBars(s, { start: 1, end: 2 })).toEqual({ start: 1, end: 2 })
    expect(s.sections[0]!.steps).toEqual({ a: [0, 16] })
    expect(s.sections[0]!.divisions).toEqual({ a: { 16: 2 } })

    expect(insertBars(s, clip, 0)).toEqual({ start: 0, end: 1 })
    expect(s.sections[0]!.steps).toEqual({ a: [0, 1, 16, 32], b: [4] })
    expect(s.sections[0]!.divisions).toEqual({ a: { 0: 3, 32: 2 }, b: { 4: 4 } })
  })

  it('split a section around bars of another meter without losing their divisions', () => {
    const s = song({ name: 'A', tempo: 120, bars: 2, steps: { a: [3, 20] } })
    s.sections[0]!.divisions = { a: { 3: 2, 20: 5 } }
    const waltz: BarClip['bars'][number] = {
      name: 'W',
      tempo: 90,
      timeSignature: { beats: 3, unit: 4 },
      subdivision: 2,
      rows: [[1], []],
      divisions: [{ 1: 6 }, {}],
    }
    expect(insertBars(s, { channels: 2, bars: [waltz] }, 1)).toEqual({ start: 1, end: 2 })
    expect(s.sections.map((x) => x.name)).toEqual(['A', 'W', 'A'])
    expect(s.sections[0]!.divisions).toEqual({ a: { 3: 2 } })
    expect(s.sections[1]!.steps).toEqual({ a: [1] })
    expect(s.sections[1]!.divisions).toEqual({ a: { 1: 6 } })
    expect(s.sections[2]!.steps).toEqual({ a: [4] })
    expect(s.sections[2]!.divisions).toEqual({ a: { 4: 5 } })
  })
})
