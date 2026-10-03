/**
 * Whole bars lifted out of the song and put back somewhere else, time included. A block
 * (`clipboard.ts`) is painted over cells that already exist; bars change the length of the
 * song instead: deleting them shortens it and everything after them moves up, inserting
 * them lengthens it and everything after the point moves along. Plain data and pure
 * functions, like the rest of `core`; the stores decide which bars (the loop points) and
 * where (the cursor) and bump their revisions.
 */
import {
  MAX_BARS,
  MIN_DIVISION,
  cellDivision,
  createSection,
  mapDivisionSteps,
  pruneDivisions,
  stepsPerBar,
  totalBars,
  type LoopRange,
  type Section,
  type Song,
  type Subdivision,
  type TimeSignature,
} from './song'
import { resolveTempos } from './timing'

/** A range of bars on the whole-song bar axis, `start` inclusive and `end` exclusive, like the loop points. */
export type BarRange = LoopRange

/**
 * One bar lifted out of the song: its gates, and the name, tempo and meter of the section
 * it came from, which is how it plays when it cannot join the section it lands in.
 * `rows[r]` holds the on-steps of the r-th channel, counted from the bar's first step, and
 * `divisions[r]` how many ways each divided one of them is split (see `Section.divisions`).
 */
export interface BarSlice {
  name: string
  tempo: number
  timeSignature: TimeSignature
  subdivision: Subdivision
  rows: number[][]
  divisions: Array<Record<number, number>>
}

/** A run of bars lifted out of the grid, across every channel of the song (by position). */
export interface BarClip {
  channels: number
  bars: BarSlice[]
}

/** Trim a range to a song of `bars` bars. Null when nothing of it is left. */
export function clampBarRange(range: BarRange, bars: number): BarRange | null {
  const start = Math.max(0, range.start)
  const end = Math.min(bars, range.end)
  return end > start ? { start, end } : null
}

interface Placed {
  section: Section
  index: number
  startBar: number
}

function placeSections(sections: readonly Section[]): Placed[] {
  let startBar = 0
  return sections.map((section, index) => {
    const placed = { section, index, startBar }
    startBar += section.bars
    return placed
  })
}

function sameMeter(
  a: Pick<Section, 'timeSignature' | 'subdivision'>,
  b: Pick<Section, 'timeSignature' | 'subdivision'>,
): boolean {
  return (
    a.timeSignature.beats === b.timeSignature.beats &&
    a.timeSignature.unit === b.timeSignature.unit &&
    a.subdivision === b.subdivision
  )
}

/**
 * Tempos resolved before an edit, by section id. A section without a tempo of its own
 * follows the one before it, so taking sections out or putting new ones in would change how
 * it plays; `pinTempos` gives such a section its old tempo outright when that happens.
 */
function tempoMap(sections: readonly Section[]): Map<string, number> {
  const tempos = resolveTempos(sections)
  return new Map(sections.map((section, i) => [section.id, tempos[i]!]))
}

function pinTempos(sections: readonly Section[], before: Map<string, number>) {
  const after = resolveTempos(sections)
  sections.forEach((section, i) => {
    const was = before.get(section.id)
    if (section.tempo === null && was !== undefined && after[i] !== was) section.tempo = was
  })
}

/** Lift the bars inside `range` out of the song. Null when the range covers none of it. */
export function readBars(song: Song, range: BarRange): BarClip | null {
  const clamped = clampBarRange(range, totalBars(song.sections))
  if (!clamped) return null
  const tempos = resolveTempos(song.sections)
  const bars: BarSlice[] = []
  for (const { section, index, startBar } of placeSections(song.sections)) {
    const lo = Math.max(clamped.start, startBar) - startBar
    const hi = Math.min(clamped.end, startBar + section.bars) - startBar
    const perBar = stepsPerBar(section)
    for (let bar = lo; bar < hi; bar++) {
      const first = bar * perBar
      const rows = song.channels.map((channel) =>
        (section.steps[channel.id] ?? []).filter((s) => s >= first && s < first + perBar).map((s) => s - first),
      )
      bars.push({
        name: section.name,
        tempo: tempos[index]!,
        timeSignature: { ...section.timeSignature },
        subdivision: section.subdivision,
        rows,
        divisions: song.channels.map((channel, r) => {
          const divided: Record<number, number> = {}
          for (const s of rows[r]!) {
            const division = cellDivision(section, channel.id, first + s)
            if (division > MIN_DIVISION) divided[s] = division
          }
          return divided
        }),
      })
    }
  }
  return { channels: song.channels.length, bars }
}

/**
 * Take the bars inside `range` out of the song: their gates go with them, the bars after
 * them move up, and a section left with no bars is removed. Mutates the song and returns
 * the range taken out, or null when the range covered none of it.
 */
export function deleteBars(song: Song, range: BarRange): BarRange | null {
  const clamped = clampBarRange(range, totalBars(song.sections))
  if (!clamped) return null
  const before = tempoMap(song.sections)
  // From the end, so taking a section out does not move the ones still to be looked at.
  for (const { section, index, startBar } of placeSections(song.sections).reverse()) {
    const lo = Math.max(clamped.start, startBar) - startBar
    const hi = Math.min(clamped.end, startBar + section.bars) - startBar
    if (hi <= lo) continue
    if (hi - lo >= section.bars) {
      song.sections.splice(index, 1)
      continue
    }
    const perBar = stepsPerBar(section)
    const from = lo * perBar
    const to = hi * perBar
    for (const [channelId, list] of Object.entries(section.steps)) {
      const kept = list.filter((s) => s < from || s >= to).map((s) => (s >= to ? s - (to - from) : s))
      if (kept.length) section.steps[channelId] = kept
      else delete section.steps[channelId]
    }
    section.divisions = mapDivisionSteps(section.divisions, (s) => (s < from ? s : s >= to ? s - (to - from) : null))
    section.bars -= hi - lo
  }
  pinTempos(song.sections, before)
  return clamped
}

/** Write a run of slices into `section` so that the first lands on bar `atBar`, pushing later bars along. */
function spliceInto(song: Song, section: Section, atBar: number, slices: readonly BarSlice[]) {
  const perBar = stepsPerBar(section)
  const from = atBar * perBar
  const added = slices.length * perBar
  const next: Record<string, number[]> = {}
  for (const [channelId, list] of Object.entries(section.steps)) {
    next[channelId] = list.map((s) => (s >= from ? s + added : s))
  }
  const divisions = mapDivisionSteps(section.divisions, (s) => (s >= from ? s + added : s))
  song.channels.forEach((channel, r) => {
    const incoming: number[] = []
    const divided: Record<number, number> = {}
    slices.forEach((slice, j) => {
      for (const s of slice.rows[r] ?? []) {
        if (s < 0 || s >= perBar) continue
        incoming.push(from + j * perBar + s)
        const division = slice.divisions[r]?.[s]
        if (division !== undefined && division > MIN_DIVISION) divided[from + j * perBar + s] = division
      }
    })
    if (!incoming.length) return
    next[channel.id] = [...new Set([...(next[channel.id] ?? []), ...incoming])].sort((a, b) => a - b)
    if (Object.keys(divided).length) divisions[channel.id] = { ...(divisions[channel.id] ?? {}), ...divided }
  })
  for (const channelId of Object.keys(next)) if (!next[channelId]!.length) delete next[channelId]
  section.steps = next
  section.divisions = pruneDivisions(divisions, next)
  section.bars += slices.length
}

/** A new section holding a run of slices that all keep time the same way. */
function sectionFrom(song: Song, slices: readonly BarSlice[]): Section {
  const first = slices[0]!
  const section = createSection({
    name: first.name,
    tempo: first.tempo,
    timeSignature: { ...first.timeSignature },
    subdivision: first.subdivision,
    bars: 0,
  })
  spliceInto(song, section, 0, slices)
  return section
}

/**
 * Put a run of bars into the song so that the first one becomes bar `atBar` (the bar after
 * the last one appends them), pushing the bars from there on along. Bars that keep time
 * the way the section they land in does join it, at its tempo; bars with another time
 * signature or step resolution become a section of their own, named and at the tempo of
 * the section they came from, splitting the one they land inside. Gates land on channels
 * by position; rows past the last channel are dropped. Mutates the song and returns the
 * range the bars now occupy, or null when the clip holds none.
 */
export function insertBars(song: Song, clip: BarClip, atBar: number): BarRange | null {
  if (!clip.bars.length) return null
  const start = Math.min(Math.max(0, Math.floor(atBar)), totalBars(song.sections))
  const before = tempoMap(song.sections)

  // Where the next run goes: the section it lands in and the bar in it. The bar after the
  // last one is the end of the last section, so bars that fit can still join it.
  const placed = placeSections(song.sections).find((p) => start < p.startBar + p.section.bars)
  const last = song.sections[song.sections.length - 1]
  let index = placed?.index ?? Math.max(0, song.sections.length - 1)
  let bar = placed ? start - placed.startBar : (last?.bars ?? 0)

  // Runs of consecutive bars that keep time the same way.
  const runs: BarSlice[][] = []
  for (const slice of clip.bars) {
    const run = runs[runs.length - 1]
    if (run && sameMeter(run[0]!, slice)) run.push(slice)
    else runs.push([slice])
  }

  for (const run of runs) {
    const host = song.sections[index]
    if (host && sameMeter(host, run[0]!) && host.bars + run.length <= MAX_BARS) {
      spliceInto(song, host, bar, run)
      bar += run.length
      continue
    }
    if (host && bar > 0 && bar < host.bars) {
      // Landing inside the host: what follows the point becomes a section after the new ones.
      const perBar = stepsPerBar(host)
      const tail = createSection({
        name: host.name,
        tempo: before.get(host.id) ?? host.tempo,
        timeSignature: { ...host.timeSignature },
        subdivision: host.subdivision,
        bars: host.bars - bar,
        steps: {},
      })
      const cut = bar * perBar
      for (const [channelId, list] of Object.entries(host.steps)) {
        const kept = list.filter((s) => s < cut)
        const moved = list.filter((s) => s >= cut).map((s) => s - cut)
        if (kept.length) host.steps[channelId] = kept
        else delete host.steps[channelId]
        if (moved.length) tail.steps[channelId] = moved
      }
      tail.divisions = mapDivisionSteps(host.divisions, (s) => (s >= cut ? s - cut : null))
      host.divisions = mapDivisionSteps(host.divisions, (s) => (s < cut ? s : null))
      host.bars = bar
      song.sections.splice(index + 1, 0, tail)
    }
    if (host && bar > 0) {
      // Landing at the end of, or inside, the host: the new sections go after it.
      index += 1
      bar = 0
    }
    for (let i = 0; i < run.length; i += MAX_BARS) {
      song.sections.splice(index, 0, sectionFrom(song, run.slice(i, i + MAX_BARS)))
      index += 1
    }
  }
  pinTempos(song.sections, before)
  return { start, end: start + clip.bars.length }
}
