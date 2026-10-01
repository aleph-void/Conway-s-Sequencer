import { noteOff, noteOn, outputToNote } from './midi'
import { groupRuns, isChannelSilenced, type Song } from './song'
import { buildTimeline, totalDuration, type SectionTiming } from './timing'

export interface MidiEvent {
  /** Seconds from song start. */
  time: number
  kind: 'on' | 'off'
  note: number
  channelId: string
  data: number[]
}

export interface CompiledSong {
  events: MidiEvent[]
  duration: number
  timeline: SectionTiming[]
}

/** Minimum gap between a gate's note-off and the next note-on of the same note, in seconds. */
export const MIN_GAP_SECONDS = 0.002

/**
 * Turn a song into a flat, time-sorted list of MIDI events.
 *
 * A gate goes high at the start of an on-step and stays high for the whole step. If the
 * following step is also on, the gate is held through it, so a run of consecutive on-steps
 * is one gate that only drops at the next off-step (or the end of the section).
 *
 * Pure: the same song always yields the same events.
 */
export function compileSong(song: Song): CompiledSong {
  const timeline = buildTimeline(song)
  const events: MidiEvent[] = []
  const { midiChannel, baseNote, velocity } = song.settings

  for (const timing of timeline) {
    const section = song.sections[timing.index]
    if (!section) continue
    for (const channel of song.channels) {
      if (isChannelSilenced(channel, song.channels)) continue
      const steps = section.steps[channel.id]
      if (!steps || steps.length === 0) continue
      const note = outputToNote(channel.output, baseNote)
      const on = noteOn(midiChannel, note, velocity)
      const off = noteOff(midiChannel, note)
      const valid = steps.filter((s) => s >= 0 && s < timing.stepCount)
      for (const [firstStep, lastStep] of groupRuns(valid)) {
        const start = timing.startTime + firstStep * timing.stepDuration
        const fullLength = (lastStep + 1 - firstStep) * timing.stepDuration
        // Drop just before the next step so a gate starting there is seen as a fresh note-on.
        const length = Math.max(MIN_GAP_SECONDS, fullLength - MIN_GAP_SECONDS)
        events.push({ time: start, kind: 'on', note, channelId: channel.id, data: on })
        events.push({ time: start + length, kind: 'off', note, channelId: channel.id, data: off })
      }
    }
  }

  // Sort by time; at equal times send note-offs before note-ons so a new gate on the same note works.
  events.sort((a, b) => a.time - b.time || rank(a) - rank(b) || a.note - b.note)
  return { events, duration: totalDuration(timeline), timeline }
}

function rank(e: MidiEvent): number {
  return e.kind === 'off' ? 0 : 1
}
