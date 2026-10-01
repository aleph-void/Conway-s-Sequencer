import { noteOff, noteOn, outputToNote } from './midi'
import { groupRuns, type Song } from './song'
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
 * Pure: the same song always yields the same events.
 */
export function compileSong(song: Song): CompiledSong {
  const timeline = buildTimeline(song)
  const events: MidiEvent[] = []
  const { midiChannel, baseNote, velocity, gateLength } = song.settings
  const gateFraction = Math.min(1, Math.max(0.05, gateLength))

  for (const timing of timeline) {
    const section = song.sections[timing.index]
    if (!section) continue
    for (const channel of song.channels) {
      if (channel.muted) continue
      const steps = section.steps[channel.id]
      if (!steps || steps.length === 0) continue
      const note = outputToNote(channel.output, baseNote)
      const on = noteOn(midiChannel, note, velocity)
      const off = noteOff(midiChannel, note)
      const push = (startStep: number, endStepExclusive: number, retrigger: boolean) => {
        const start = timing.startTime + startStep * timing.stepDuration
        const fullLength = (endStepExclusive - startStep) * timing.stepDuration
        const length = retrigger
          ? Math.max(MIN_GAP_SECONDS, Math.min(fullLength * gateFraction, fullLength - MIN_GAP_SECONDS))
          : Math.max(MIN_GAP_SECONDS, fullLength - MIN_GAP_SECONDS)
        events.push({ time: start, kind: 'on', note, channelId: channel.id, data: on })
        events.push({ time: start + length, kind: 'off', note, channelId: channel.id, data: off })
      }
      const valid = steps.filter((s) => s >= 0 && s < timing.stepCount)
      if (channel.gateMode === 'tie') {
        for (const [a, b] of groupRuns(valid)) push(a, b + 1, false)
      } else {
        for (const s of valid) push(s, s + 1, true)
      }
    }
  }

  // Sort by time; at equal times send note-offs before note-ons so a retrigger of the same note works.
  events.sort((a, b) => a.time - b.time || rank(a) - rank(b) || a.note - b.note)
  return { events, duration: totalDuration(timeline), timeline }
}

function rank(e: MidiEvent): number {
  return e.kind === 'off' ? 0 : 1
}
