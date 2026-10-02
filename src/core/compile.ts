import { CLOCK_NOTE, CLOCK_PULSES_PER_BEAT, noteOff, noteOn, outputToNote } from './midi'
import { groupRuns, isChannelSilenced, type Section, type Song } from './song'
import { buildTimeline, totalDuration, type SectionTiming } from './timing'

export interface MidiEvent {
  /** Seconds from song start. */
  time: number
  kind: 'on' | 'off'
  note: number
  /** The sequenced channel the event belongs to, or CLOCK_CHANNEL_ID for the x16 clock. */
  channelId: string
  data: number[]
}

/** Pseudo channel id carried by the clock's events; no real channel ever has this id. */
export const CLOCK_CHANNEL_ID = 'clock'

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
 * On top of the drawn gates, the x16 clock on CLOCK_NOTE pulses CLOCK_PULSES_PER_BEAT times
 * per beat of every section, following each section's tempo and time signature. Mute and
 * solo never touch it.
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
    pushClock(events, timing, section, midiChannel, velocity)
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

  sortEvents(events)
  return { events, duration: totalDuration(timeline), timeline }
}

/** Sort by time; at equal times send note-offs before note-ons so a new gate on the same note works. */
export function sortEvents(events: MidiEvent[]): MidiEvent[] {
  return events.sort((a, b) => a.time - b.time || rank(a) - rank(b) || a.note - b.note)
}

/**
 * Cut a compiled, time-sorted event list down to the window [start, end) seconds and re-base
 * it so the window starts at 0, which is what playing between loop points comes down to.
 *
 * Gates are kept whole at the edges, exactly as if the window were the entire song: a gate
 * that is already high when the window starts gets a note-on at 0, and one still high when
 * it ends gets a note-off just before the end (MIN_GAP_SECONDS early, like every gate
 * before a following step), so that looping the window re-triggers it cleanly and nothing
 * is left hanging. The x16 clock is cut the same way.
 */
export function windowEvents(events: readonly MidiEvent[], start: number, end: number): MidiEvent[] {
  const duration = end - start
  if (!(duration > 0)) return []
  const EPS = 1e-9
  const out: MidiEvent[] = []
  /** Note -> the note-on that left it high, for notes high at `start` and then inside the window. */
  const high = new Map<number, MidiEvent>()
  let inside = false
  for (const event of events) {
    if (event.time >= end - EPS) break
    if (!inside && event.time >= start - EPS) {
      // Entering the window: whatever is still high from before it goes high again at 0.
      inside = true
      for (const on of high.values()) out.push({ ...on, time: 0 })
    }
    if (inside) out.push({ ...event, time: Math.max(0, event.time - start) })
    if (event.kind === 'on') high.set(event.note, event)
    else high.delete(event.note)
  }
  if (!inside) for (const on of high.values()) out.push({ ...on, time: 0 })
  // Whatever is still high at the end is released just before the window ends.
  const release = Math.max(MIN_GAP_SECONDS, duration - MIN_GAP_SECONDS)
  for (const on of high.values()) {
    const at = Math.max(release, Math.max(0, on.time - start))
    out.push({ time: at, kind: 'off', note: on.note, channelId: on.channelId, data: offFor(on) })
  }
  return sortEvents(out)
}

function offFor(on: MidiEvent): number[] {
  return noteOff(((on.data[0] ?? 0x90) & 0x0f) + 1, on.note)
}

/**
 * Emit the clock pulses for one section: CLOCK_PULSES_PER_BEAT evenly spaced note-on/off pairs
 * per beat. A pulse is high for half its period (a 50 % duty cycle), but never shorter than
 * MIN_GAP_SECONDS and always off before the next pulse starts.
 */
function pushClock(events: MidiEvent[], timing: SectionTiming, section: Section, midiChannel: number, velocity: number) {
  const beatDuration = timing.stepDuration * section.subdivision
  const beats = section.timeSignature.beats * section.bars
  const period = beatDuration / CLOCK_PULSES_PER_BEAT
  const width = Math.max(MIN_GAP_SECONDS, Math.min(period / 2, period - MIN_GAP_SECONDS))
  const on = noteOn(midiChannel, CLOCK_NOTE, velocity)
  const off = noteOff(midiChannel, CLOCK_NOTE)
  for (let pulse = 0; pulse < beats * CLOCK_PULSES_PER_BEAT; pulse++) {
    const start = timing.startTime + pulse * period
    events.push({ time: start, kind: 'on', note: CLOCK_NOTE, channelId: CLOCK_CHANNEL_ID, data: on })
    events.push({ time: start + width, kind: 'off', note: CLOCK_NOTE, channelId: CLOCK_CHANNEL_ID, data: off })
  }
}

function rank(e: MidiEvent): number {
  return e.kind === 'off' ? 0 : 1
}
