import { describe, expect, it } from 'vitest'
import { MIN_GAP_SECONDS } from './compile'
import { CLOCK_NOTE } from './midi'
import { MODULE_COLUMNS, MODULE_OUTPUTS, MODULE_ROWS, highNotes, moduleLayout, outputForNote } from './module'
import { createSong, type Song } from './song'
import { buildTimeline } from './timing'

function songWithGate(steps: number[], channelIndex = 0): Song {
  const song = createSong()
  song.sections[0]!.steps[song.channels[channelIndex]!.id] = steps
  return song
}

describe('module layout', () => {
  it('is an 8x8 field of 64 outputs following consecutive notes from the base note', () => {
    expect(MODULE_OUTPUTS).toBe(64)
    expect(MODULE_COLUMNS * MODULE_ROWS).toBe(MODULE_OUTPUTS)
    const { outputs, offPanel } = moduleLayout(createSong())
    expect(outputs).toHaveLength(64)
    expect(outputs.map((o) => o.note)).toEqual(Array.from({ length: 64 }, (_, i) => 36 + i))
    expect(outputs.map((o) => o.index)).toEqual(Array.from({ length: 64 }, (_, i) => i))
    expect(offPanel).toEqual([])
  })

  it('places every channel, the clock and the play gate on their outputs', () => {
    const song = createSong()
    song.channels[2]!.name = 'Hat'
    song.channels[2]!.output = 9
    const { outputs } = moduleLayout(song)
    expect(outputs[0]!.sources).toEqual([{ role: 'channel', name: 'Out 1', note: 36, channelId: song.channels[0]!.id, channelIndex: 0 }])
    // Output 3 (index 2) is unused now that the third channel moved to output 10.
    expect(outputs[2]!.sources).toEqual([])
    expect(outputs[9]!.sources).toMatchObject([{ role: 'channel', name: 'Hat', channelIndex: 2 }])
    expect(outputs[62]!.sources).toEqual([{ role: 'clock', name: 'x16 clock', note: CLOCK_NOTE }])
    expect(outputs[63]!.sources).toEqual([{ role: 'play', name: 'Play gate', note: 99 }])
    expect(outputs.filter((o) => o.sources.length).length).toBe(10)
  })

  it('follows the base note and shows the clock sharing an output with a channel', () => {
    const song = createSong()
    song.settings.baseNote = 48
    song.channels[0]!.output = 50 // note 98: the clock's note
    const { outputs, offPanel } = moduleLayout(song)
    expect(outputs[0]!.note).toBe(48)
    expect(outputs[50]!.sources.map((s) => s.role)).toEqual(['channel', 'clock'])
    // The play gate (99) is output 52 here; nothing is off the panel.
    expect(outputs[51]!.sources.map((s) => s.role)).toEqual(['play'])
    expect(offPanel).toEqual([])
  })

  it('reports the clock and gate when the base note moves them off the panel', () => {
    const song = createSong()
    song.settings.baseNote = 20 // window 20..83
    const { outputs, offPanel } = moduleLayout(song)
    expect(offPanel.map((s) => [s.role, s.note])).toEqual([
      ['clock', 98],
      ['play', 99],
    ])
    expect(outputs.every((o) => o.sources.every((s) => s.role === 'channel'))).toBe(true)
    expect(outputForNote(98, 20)).toBeNull()
    expect(outputForNote(20, 20)).toBe(0)
    expect(outputForNote(83, 20)).toBe(63)
    expect(outputForNote(84, 20)).toBeNull()
    expect(outputForNote(19, 20)).toBeNull()
  })

  it('keeps the play gate on the panel wherever it is set', () => {
    const song = createSong()
    song.settings.playGateNote = 36 // on top of channel 1
    const { outputs } = moduleLayout(song)
    expect(outputs[0]!.sources.map((s) => s.role)).toEqual(['channel', 'play'])
    expect(outputs[63]!.sources).toEqual([])
  })
})

describe('highNotes', () => {
  const song = songWithGate([0, 1, 4]) // steps 0-1 are one held gate, step 4 another; 125 ms steps
  const timeline = buildTimeline(song)

  it('is empty while stopped or paused', () => {
    expect(highNotes(song, timeline, 0, false).size).toBe(0)
    expect(highNotes(song, timeline, 0.5, false).size).toBe(0)
  })

  it('raises the play gate, the clock and the drawn gate at the start', () => {
    expect([...highNotes(song, timeline, 0, true)].sort((a, b) => a - b)).toEqual([36, 98, 99])
  })

  it('pulses the clock for half of each 31.25 ms period', () => {
    const at = (t: number) => highNotes(song, timeline, t, true).has(CLOCK_NOTE)
    expect(at(0)).toBe(true)
    expect(at(0.01)).toBe(true)
    expect(at(0.0157)).toBe(false) // just past the 15.625 ms pulse width
    expect(at(0.03)).toBe(false)
    expect(at(0.03125)).toBe(true) // the next pulse starts
    expect(at(0.5)).toBe(true) // the first pulse of beat 2
  })

  it('holds a gate through every step it is drawn on and drops it only at the next empty step', () => {
    const gate = (t: number) => highNotes(song, timeline, t, true).has(36)
    expect(gate(0.1)).toBe(true)
    expect(gate(0.125)).toBe(true) // step 1 is tied to step 0
    expect(gate(0.2)).toBe(true)
    expect(gate(0.25)).toBe(false) // step 2 is empty
    expect(gate(0.4)).toBe(false)
    expect(gate(0.5)).toBe(true) // step 4
    expect(gate(0.6)).toBe(true)
    expect(gate(0.625)).toBe(false)
  })

  it('drops a gate just before the step after its run, as the compiled note-off does', () => {
    const gate = (t: number) => highNotes(song, timeline, t, true).has(36)
    expect(gate(0.25 - MIN_GAP_SECONDS - 0.0001)).toBe(true)
    expect(gate(0.25 - MIN_GAP_SECONDS)).toBe(false)
    // Within a run the gap does not apply: step 0 flows into step 1.
    expect(gate(0.125 - MIN_GAP_SECONDS)).toBe(true)
  })

  it('follows the swung step starts', () => {
    const s = songWithGate([0, 2, 3]) // 75 %: step 1 starts at 187.5 ms, step 3 at 437.5 ms
    s.sections[0]!.swing = 75
    const t = buildTimeline(s)
    const gate = (at: number) => highNotes(s, t, at, true).has(36)
    // Step 0 holds on until step 1 actually starts, minus the gap before the next gate.
    expect(gate(0.15)).toBe(true)
    expect(gate(0.1875 - MIN_GAP_SECONDS - 0.0001)).toBe(true)
    expect(gate(0.1875 - MIN_GAP_SECONDS)).toBe(false)
    expect(gate(0.2)).toBe(false)
    // Steps 2 and 3 are one gate from 250 ms to the start of step 4 at 500 ms.
    expect(gate(0.3)).toBe(true)
    expect(gate(0.45)).toBe(true)
    expect(gate(0.5 - MIN_GAP_SECONDS)).toBe(false)
  })

  it('lights the gates of a divided step in turn, each dropping before the next', () => {
    const song = songWithGate([3, 4, 5])
    song.sections[0]!.divisions[song.channels[0]!.id] = { 4: 4 }
    const tl = buildTimeline(song)
    const high = (t: number) => highNotes(song, tl, t, true).has(36)
    // Step 3 (0.375–0.5 s) is a plain gate, but it drops before step 4, which is divided.
    expect(high(0.4)).toBe(true)
    expect(high(0.5 - MIN_GAP_SECONDS / 2)).toBe(false)
    // Step 4's four gates are 31.25 ms each, each off for the last 2 ms.
    expect(high(0.5)).toBe(true)
    expect(high(0.5 + 0.03125 - MIN_GAP_SECONDS / 2)).toBe(false)
    expect(high(0.5 + 0.03125)).toBe(true)
    expect(high(0.5 + 3 * 0.03125 + 0.01)).toBe(true)
    expect(high(0.625 - MIN_GAP_SECONDS / 2)).toBe(false)
    // Step 5 starts afresh and holds to the end of the run.
    expect(high(0.625)).toBe(true)
    expect(high(0.7)).toBe(true)
  })

  it('respects mute and solo', () => {
    const s = songWithGate([0])
    const t = buildTimeline(s)
    s.channels[0]!.muted = true
    expect(highNotes(s, t, 0, true).has(36)).toBe(false)
    s.channels[0]!.muted = false
    s.channels[1]!.solo = true
    expect(highNotes(s, t, 0, true).has(36)).toBe(false)
    s.channels[0]!.solo = true
    expect(highNotes(s, t, 0, true).has(36)).toBe(true)
  })

  it('follows the base note, the output number and the play gate note', () => {
    const s = songWithGate([0], 3)
    s.settings.baseNote = 48
    s.settings.playGateNote = 100
    s.channels[3]!.output = 10
    const notes = highNotes(s, buildTimeline(s), 0, true)
    expect(notes.has(58)).toBe(true)
    expect(notes.has(100)).toBe(true)
    expect(notes.has(99)).toBe(false)
  })

  it('keeps only the play gate for a cursor beyond the song', () => {
    expect([...highNotes(song, timeline, 100, true)]).toEqual([99])
    expect([...highNotes(song, [], 0, true)]).toEqual([99])
  })

  it('lights the gates of a later section at its own tempo', () => {
    const s = songWithGate([])
    const second = { ...s.sections[0]!, id: 'sec_b', tempo: 60, bars: 1, steps: { [s.channels[1]!.id]: [1] } }
    s.sections.push(second)
    const t = buildTimeline(s)
    // Section A lasts 8 s; in B at 60 BPM a step is 250 ms, so step 1 spans 8.25-8.5 s.
    expect(highNotes(s, t, 8.3, true).has(37)).toBe(true)
    expect(highNotes(s, t, 8.1, true).has(37)).toBe(false)
    // The clock runs at B's 62.5 ms period: 8.3 s is 50 ms in, past the 31.25 ms width.
    expect(highNotes(s, t, 8.3, true).has(CLOCK_NOTE)).toBe(false)
    expect(highNotes(s, t, 8.26, true).has(CLOCK_NOTE)).toBe(true)
  })

  it('skips a channel whose note lies beyond MIDI under an extreme base note', () => {
    const extreme = songWithGate([0], 7) // output 7
    extreme.settings.baseNote = 121 // note 128
    const notes = highNotes(extreme, buildTimeline(extreme), 0, true)
    expect(notes.has(128)).toBe(false)
    expect(notes.has(99)).toBe(true)
  })
})
