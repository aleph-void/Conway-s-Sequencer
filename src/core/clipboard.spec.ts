import { describe, expect, it } from 'vitest'
import {
  clampRange,
  clearRange,
  divideRange,
  emptyBlock,
  rangeDivisions,
  rangeContains,
  rangeFromCorners,
  readBlock,
  writeBlock,
  type Block,
} from './clipboard'
import { createChannel, createSection, createSong, type Song } from './song'
import { buildTimeline } from './timing'

/** Three channels; section A has 8 steps (1 bar of 2/4 × 4), section B has 4 (1 bar of 2/4 × 2). */
function song(): Song {
  const base = createSong()
  base.channels = [createChannel(0, { id: 'c0' }), createChannel(1, { id: 'c1' }), createChannel(2, { id: 'c2' })]
  base.sections = [
    createSection({ id: 'a', tempo: 120, bars: 1, timeSignature: { beats: 2, unit: 4 }, subdivision: 4 }),
    createSection({ id: 'b', bars: 1, timeSignature: { beats: 2, unit: 4 }, subdivision: 2 }),
  ]
  return base
}

describe('rangeFromCorners', () => {
  it('covers both cells whichever order they come in', () => {
    const range = { channelStart: 1, channelEnd: 4, stepStart: 2, stepEnd: 8 }
    expect(rangeFromCorners({ channel: 1, step: 2 }, { channel: 3, step: 7 })).toEqual(range)
    expect(rangeFromCorners({ channel: 3, step: 7 }, { channel: 1, step: 2 })).toEqual(range)
    expect(rangeFromCorners({ channel: 2, step: 5 }, { channel: 2, step: 5 })).toEqual({
      channelStart: 2,
      channelEnd: 3,
      stepStart: 5,
      stepEnd: 6,
    })
  })
})

describe('clampRange', () => {
  it('trims a range to the song and drops one with nothing left', () => {
    const range = { channelStart: -1, channelEnd: 5, stepStart: 10, stepEnd: 40 }
    expect(clampRange(range, 3, 20)).toEqual({ channelStart: 0, channelEnd: 3, stepStart: 10, stepEnd: 20 })
    expect(clampRange(range, 3, 10)).toBeNull()
    expect(clampRange(range, 0, 20)).toBeNull()
    expect(clampRange({ channelStart: 4, channelEnd: 6, stepStart: 0, stepEnd: 4 }, 3, 20)).toBeNull()
  })

  it('tells which cells are inside', () => {
    const range = { channelStart: 1, channelEnd: 3, stepStart: 4, stepEnd: 8 }
    expect(rangeContains(range, 1, 4)).toBe(true)
    expect(rangeContains(range, 2, 7)).toBe(true)
    expect(rangeContains(range, 3, 5)).toBe(false)
    expect(rangeContains(range, 0, 5)).toBe(false)
    expect(rangeContains(range, 1, 8)).toBe(false)
    expect(rangeContains(range, 1, 3)).toBe(false)
  })
})

describe('readBlock', () => {
  it('lifts the gates inside the range, relative to its corner, across sections', () => {
    const s = song()
    s.sections[0]!.steps = { c0: [0, 5, 7], c1: [6] }
    s.sections[1]!.steps = { c1: [0, 3], c2: [1] }
    const tl = buildTimeline(s)
    // Channels 0–1, steps 5–9: the last three of A and the first two of B.
    const block = readBlock(s, tl, { channelStart: 0, channelEnd: 2, stepStart: 5, stepEnd: 10 })
    expect(block).toEqual({ channels: 2, steps: 5, rows: [[0, 2], [1, 3]], divisions: [{}, {}] })
  })

  it('leaves rows empty beyond the song and the channel list', () => {
    const s = song()
    s.sections[1]!.steps = { c2: [3] }
    const tl = buildTimeline(s)
    const block = readBlock(s, tl, { channelStart: 2, channelEnd: 5, stepStart: 10, stepEnd: 14 })
    expect(block).toEqual({ channels: 3, steps: 4, rows: [[1], [], []], divisions: [{}, {}, {}] })
  })

  it('makes an empty block', () => {
    expect(emptyBlock(2, 3)).toEqual({ channels: 2, steps: 3, rows: [[], []], divisions: [{}, {}] })
    expect(emptyBlock(0, 0)).toEqual({ channels: 0, steps: 0, rows: [], divisions: [] })
  })
})

describe('writeBlock', () => {
  const block: Block = { channels: 2, steps: 3, rows: [[0, 2], [1]], divisions: [{}, {}] }

  it('puts the block down at a corner, replacing what the cells held, and reports the range', () => {
    const s = song()
    s.sections[0]!.steps = { c1: [1, 2, 3], c2: [0, 1, 2, 3] }
    const tl = buildTimeline(s)
    expect(writeBlock(s, tl, block, 1, 1)).toEqual({ channelStart: 1, channelEnd: 3, stepStart: 1, stepEnd: 4 })
    // Row 0 of the block lands on c1: steps 1 and 3 on, 2 cleared. Row 1 on c2: only step 2 inside the block.
    expect(s.sections[0]!.steps).toEqual({ c1: [1, 3], c2: [0, 2] })
  })

  it('spans sections and drops what falls past the end of the song or the last channel', () => {
    const s = song()
    const tl = buildTimeline(s)
    // Corner on the last channel at step 7: the second row and the third step are dropped.
    expect(writeBlock(s, tl, block, 2, 7)).toEqual({ channelStart: 2, channelEnd: 3, stepStart: 7, stepEnd: 10 })
    expect(s.sections[0]!.steps).toEqual({ c2: [7] })
    expect(s.sections[1]!.steps).toEqual({ c2: [1] })
    expect(writeBlock(s, tl, block, 1, 11)).toEqual({ channelStart: 1, channelEnd: 3, stepStart: 11, stepEnd: 12 })
    expect(s.sections[1]!.steps).toEqual({ c1: [3], c2: [1] })
  })

  it('writes nothing when the block lies outside the song', () => {
    const s = song()
    const tl = buildTimeline(s)
    expect(writeBlock(s, tl, block, 3, 0)).toBeNull()
    expect(writeBlock(s, tl, block, 0, 12)).toBeNull()
    expect(writeBlock(s, tl, emptyBlock(0, 0), 0, 0)).toBeNull()
    expect(s.sections[0]!.steps).toEqual({})
  })

  it('drops a channel whose last gate is cleared', () => {
    const s = song()
    s.sections[0]!.steps = { c0: [1] }
    const tl = buildTimeline(s)
    writeBlock(s, tl, emptyBlock(1, 2), 0, 0)
    expect(s.sections[0]!.steps).toEqual({})
  })
})

describe('clearRange', () => {
  it('clears every gate inside the range and nothing outside it', () => {
    const s = song()
    s.sections[0]!.steps = { c0: [0, 4, 7], c1: [4, 5], c2: [4] }
    s.sections[1]!.steps = { c0: [0, 1], c1: [1] }
    const tl = buildTimeline(s)
    expect(clearRange(s, tl, { channelStart: 0, channelEnd: 2, stepStart: 4, stepEnd: 9 })).toEqual({
      channelStart: 0,
      channelEnd: 2,
      stepStart: 4,
      stepEnd: 9,
    })
    expect(s.sections[0]!.steps).toEqual({ c0: [0], c2: [4] })
    expect(s.sections[1]!.steps).toEqual({ c0: [1], c1: [1] })
    expect(clearRange(s, tl, { channelStart: 0, channelEnd: 1, stepStart: 20, stepEnd: 30 })).toBeNull()
  })
})

describe('divisions in blocks', () => {
  it('lifts divisions with the gates and puts them down again, plain where the block says so', () => {
    const s = song()
    s.sections[0]!.steps = { c0: [5, 7], c1: [6] }
    s.sections[0]!.divisions = { c0: { 7: 3 }, c1: { 6: 2 } }
    const tl = buildTimeline(s)
    const block = readBlock(s, tl, { channelStart: 0, channelEnd: 2, stepStart: 5, stepEnd: 8 })
    expect(block).toEqual({ channels: 2, steps: 3, rows: [[0, 2], [1]], divisions: [{ 2: 3 }, { 1: 2 }] })

    // Pasting over a divided gate with a plain one makes it plain; over an empty cell it is written whole.
    s.sections[1]!.steps = { c0: [1] }
    s.sections[1]!.divisions = { c0: { 1: 5 } }
    writeBlock(s, tl, block, 0, 9)
    expect(s.sections[1]!.steps).toEqual({ c0: [1, 3], c1: [2] })
    expect(s.sections[1]!.divisions).toEqual({ c0: { 3: 3 }, c1: { 2: 2 } })
    clearRange(s, tl, { channelStart: 0, channelEnd: 2, stepStart: 9, stepEnd: 12 })
    expect(s.sections[1]!.divisions).toEqual({})
  })

  it('divides the gates inside a range, not its empty cells, and lists the divisions it holds', () => {
    const s = song()
    s.sections[0]!.steps = { c0: [7], c1: [6] }
    s.sections[1]!.steps = { c0: [0] }
    const tl = buildTimeline(s)
    const range = { channelStart: 0, channelEnd: 2, stepStart: 6, stepEnd: 10 }
    expect(rangeDivisions(s, tl, range)).toEqual([1])
    expect(divideRange(s, tl, range, 4)).toEqual(range)
    expect(s.sections[0]!.divisions).toEqual({ c0: { 7: 4 }, c1: { 6: 4 } })
    expect(s.sections[1]!.divisions).toEqual({ c0: { 0: 4 } })
    expect(s.sections[0]!.steps).toEqual({ c0: [7], c1: [6] })
    s.sections[1]!.divisions = { c0: { 0: 2 } }
    expect(rangeDivisions(s, tl, range)).toEqual([2, 4])
    expect(rangeDivisions(s, tl, { channelStart: 2, channelEnd: 3, stepStart: 0, stepEnd: 4 })).toEqual([])
    expect(divideRange(s, tl, { channelStart: 5, channelEnd: 6, stepStart: 0, stepEnd: 1 }, 2)).toBeNull()
    // Clipped to the song, like a paste.
    expect(divideRange(s, tl, { channelStart: 1, channelEnd: 9, stepStart: 6, stepEnd: 99 }, 1)).toEqual({
      channelStart: 1,
      channelEnd: 3,
      stepStart: 6,
      stepEnd: 12,
    })
    expect(s.sections[0]!.divisions).toEqual({ c0: { 7: 4 } })
  })
})
