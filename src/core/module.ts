/**
 * A model of the Conway's Game module's front panel, for the module view.
 *
 * The module has 64 trigger/gate outputs under an 8x8 LED matrix. In MIDI mode every output
 * follows one note, counting up from the base note (output 1 = `baseNote`, output 64 =
 * `baseNote + 63`), so the panel is a window of 64 consecutive notes. A sequenced channel,
 * the x16 clock and the play gate each drive one note; `moduleLayout` says which output
 * each of them lands on and `highNotes` says which notes are high at a moment of playback.
 * Both are pure, so the view is just a rendering of their results.
 */
import { CLOCK_NOTE } from './midi'
import { MIN_GAP_SECONDS, clockPeriod, clockPulseWidth } from './compile'
import { isChannelSilenced, isStepOn, type Song } from './song'
import { locate, stepOffsetSeconds, type SectionTiming } from './timing'

/** The module's outputs, laid out MODULE_ROWS by MODULE_COLUMNS, numbered row by row. */
export const MODULE_OUTPUTS = 64
export const MODULE_COLUMNS = 8
export const MODULE_ROWS = MODULE_OUTPUTS / MODULE_COLUMNS

export type OutputRole = 'channel' | 'clock' | 'play'

/** Something in the song that drives a note: a channel, the x16 clock or the play gate. */
export interface OutputSource {
  role: OutputRole
  /** What to call it on the panel: the channel's name, or the clock's / gate's. */
  name: string
  note: number
  /** For a channel: its id and row position (the row position picks its colour). */
  channelId?: string
  channelIndex?: number
}

export interface ModuleOutput {
  /** 0-based position on the panel, row by row; the panel label is `index + 1`. */
  index: number
  /** The MIDI note this output follows. Can leave 0..127 for an extreme base note. */
  note: number
  /** Everything in the song that drives this output; empty for an unused output. */
  sources: OutputSource[]
}

export interface ModuleLayout {
  outputs: ModuleOutput[]
  /** Sources whose note falls outside the panel's 64-note window, so no output shows them. */
  offPanel: OutputSource[]
}

/** Which output (0..63) a note lands on for the given base note, or null when it is off the panel. */
export function outputForNote(note: number, baseNote: number): number | null {
  const index = note - baseNote
  return Number.isInteger(index) && index >= 0 && index < MODULE_OUTPUTS ? index : null
}

/** Map every channel, the clock and the play gate onto the module's 64 outputs. */
export function moduleLayout(song: Song): ModuleLayout {
  const { baseNote, playGateNote } = song.settings
  const sources: OutputSource[] = song.channels.map((channel, channelIndex) => ({
    role: 'channel',
    name: channel.name,
    note: baseNote + channel.output,
    channelId: channel.id,
    channelIndex,
  }))
  sources.push({ role: 'clock', name: 'x16 clock', note: CLOCK_NOTE })
  sources.push({ role: 'play', name: 'Play gate', note: playGateNote })

  const outputs: ModuleOutput[] = Array.from({ length: MODULE_OUTPUTS }, (_, index) => ({
    index,
    note: baseNote + index,
    sources: [],
  }))
  const offPanel: OutputSource[] = []
  for (const source of sources) {
    const index = outputForNote(source.note, baseNote)
    if (index === null) offPanel.push(source)
    else outputs[index]!.sources.push(source)
  }
  return { outputs, offPanel }
}

/**
 * The notes that are high `positionSeconds` into the song while it is `playing`: the play
 * gate, the x16 clock during the high half of its pulse, and every unsilenced channel whose
 * step under the cursor is on. Nothing is high while stopped or paused, when every gate has
 * been released. Mirrors what `compileSong` sends, including a gate dropping MIN_GAP_SECONDS
 * before the step after its run.
 */
export function highNotes(
  song: Song,
  timeline: readonly SectionTiming[],
  positionSeconds: number,
  playing: boolean,
): Set<number> {
  const notes = new Set<number>()
  if (!playing) return notes
  const { baseNote, playGateNote } = song.settings
  notes.add(playGateNote)

  const pos = locate(timeline, positionSeconds)
  const timing = pos ? timeline[pos.sectionIndex] : undefined
  const section = pos ? song.sections[pos.sectionIndex] : undefined
  if (!pos || !timing || !section) return notes

  const period = clockPeriod(timing, section)
  const phase = (positionSeconds - timing.startTime) % period
  if (phase < clockPulseWidth(period)) notes.add(CLOCK_NOTE)

  const EPS = 1e-9
  const step = pos.stepInSection
  // Swing moves step starts, so measure against the next step's real start, not a straight one.
  const timeToNextStep = timing.startTime + stepOffsetSeconds(timing, step + 1) - positionSeconds
  for (const channel of song.channels) {
    if (isChannelSilenced(channel, song.channels)) continue
    if (!isStepOn(section, channel.id, step)) continue
    const lastOfRun = step === timing.stepCount - 1 || !isStepOn(section, channel.id, step + 1)
    if (lastOfRun && timeToNextStep <= MIN_GAP_SECONDS + EPS) continue
    const note = baseNote + channel.output
    if (note >= 0 && note <= 127) notes.add(note)
  }
  return notes
}
