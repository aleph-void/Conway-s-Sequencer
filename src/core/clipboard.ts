/**
 * Rectangular blocks of gates: a range of channels by a range of steps, read out of a song
 * and written back somewhere else. Everything here is plain data and pure functions, like
 * the rest of `core`; the stores decide where the ranges come from (the selection, the
 * cursor) and bump their revisions.
 */
import type { Song } from './song'
import { locateStep, totalSteps, type SectionTiming } from './timing'

/** A cell of the grid: a channel by its position in the list and a step on the whole-song axis. */
export interface Cell {
  channel: number
  step: number
}

/**
 * A rectangle of cells. Both axes are half-open: `channelStart` up to but not including
 * `channelEnd` (positions in the channel list), `stepStart` up to but not including
 * `stepEnd` (steps on the whole-song step axis, across sections).
 */
export interface CellRange {
  channelStart: number
  channelEnd: number
  stepStart: number
  stepEnd: number
}

/**
 * A block of gates lifted out of the grid: `rows[r]` holds the on-steps of the block's
 * r-th channel, counted from the block's first step, so the block can be put down on any
 * channel at any step.
 */
export interface Block {
  channels: number
  steps: number
  rows: number[][]
}

/** The smallest range covering two cells, in whichever order they were picked. */
export function rangeFromCorners(a: Cell, b: Cell): CellRange {
  return {
    channelStart: Math.min(a.channel, b.channel),
    channelEnd: Math.max(a.channel, b.channel) + 1,
    stepStart: Math.min(a.step, b.step),
    stepEnd: Math.max(a.step, b.step) + 1,
  }
}

/**
 * Trim a range to a song of `channels` channels and `steps` steps (a channel may have been
 * removed or a section shortened since it was picked). Null when nothing of it is left.
 */
export function clampRange(range: CellRange, channels: number, steps: number): CellRange | null {
  const clamped: CellRange = {
    channelStart: Math.max(0, range.channelStart),
    channelEnd: Math.min(channels, range.channelEnd),
    stepStart: Math.max(0, range.stepStart),
    stepEnd: Math.min(steps, range.stepEnd),
  }
  if (clamped.channelEnd <= clamped.channelStart || clamped.stepEnd <= clamped.stepStart) return null
  return clamped
}

export function rangeContains(range: CellRange, channel: number, step: number): boolean {
  return (
    channel >= range.channelStart && channel < range.channelEnd && step >= range.stepStart && step < range.stepEnd
  )
}

export function emptyBlock(channels: number, steps: number): Block {
  return { channels, steps, rows: Array.from({ length: channels }, () => []) }
}

/**
 * Copy the gates inside `range` out of the song. Steps beyond the song, and channels beyond
 * the list, come out empty, so the block keeps the range's size.
 */
export function readBlock(song: Song, timeline: readonly SectionTiming[], range: CellRange): Block {
  const block = emptyBlock(range.channelEnd - range.channelStart, range.stepEnd - range.stepStart)
  for (let r = 0; r < block.channels; r++) {
    const channel = song.channels[range.channelStart + r]
    if (!channel) continue
    for (let s = 0; s < block.steps; s++) {
      const at = locateStep(timeline, range.stepStart + s)
      if (!at) break
      const list = song.sections[at.sectionIndex]?.steps[channel.id]
      if (list?.includes(at.stepInSection)) block.rows[r]!.push(s)
    }
  }
  return block
}

/**
 * Put a block down with its first channel on channel `channelStart` and its first step on
 * step `stepStart`, replacing whatever the cells it covers held (its off-steps clear them).
 * What falls beyond the last channel or the end of the song is dropped. Mutates the song's
 * sections and returns the range actually written, or null when nothing was.
 */
export function writeBlock(
  song: Song,
  timeline: readonly SectionTiming[],
  block: Block,
  channelStart: number,
  stepStart: number,
): CellRange | null {
  const range = clampRange(
    { channelStart, channelEnd: channelStart + block.channels, stepStart, stepEnd: stepStart + block.steps },
    song.channels.length,
    totalSteps(timeline),
  )
  if (!range) return null
  for (let r = 0; r < block.channels; r++) {
    const channel = song.channels[channelStart + r]
    if (!channel) break
    const on = new Set(block.rows[r] ?? [])
    for (let s = 0; s < block.steps; s++) {
      const at = locateStep(timeline, stepStart + s)
      if (!at) break
      const section = song.sections[at.sectionIndex]!
      const list = section.steps[channel.id] ?? []
      const has = list.includes(at.stepInSection)
      const want = on.has(s)
      if (has === want) continue
      const next = want
        ? [...list, at.stepInSection].sort((a, b) => a - b)
        : list.filter((step) => step !== at.stepInSection)
      if (next.length) section.steps[channel.id] = next
      else delete section.steps[channel.id]
    }
  }
  return range
}

/** Clear every gate inside `range`; see `writeBlock` for what is returned. */
export function clearRange(song: Song, timeline: readonly SectionTiming[], range: CellRange): CellRange | null {
  const block = emptyBlock(range.channelEnd - range.channelStart, range.stepEnd - range.stepStart)
  return writeBlock(song, timeline, block, range.channelStart, range.stepStart)
}
