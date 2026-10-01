import { describe, expect, it } from 'vitest'
import { MIN_GAP_SECONDS, compileSong } from './compile'
import { createChannel, createSection, createSong, type Song } from './song'

function song(overrides: Partial<Song> = {}): Song {
  const base = createSong()
  base.channels = [createChannel(0, { id: 'c0' }), createChannel(5, { id: 'c5' })]
  base.sections = [createSection({ id: 's1', tempo: 120, bars: 1 })] // 16 steps × 0.125 s
  return { ...base, ...overrides }
}

describe('compileSong', () => {
  it('produces no events for an empty grid', () => {
    const c = compileSong(song())
    expect(c.events).toEqual([])
    expect(c.duration).toBe(2)
  })

  it('emits note-on/off pairs for retrigger steps at the right times', () => {
    const s = song()
    s.sections[0]!.steps = { c0: [0, 4] }
    const { events } = compileSong(s)
    expect(events).toHaveLength(4)
    expect(events[0]).toMatchObject({ time: 0, kind: 'on', note: 36, data: [0x90, 36, 100] })
    expect(events[1]).toMatchObject({ kind: 'off', note: 36, data: [0x80, 36, 0] })
    expect(events[1]!.time).toBeCloseTo(0.0625) // 50% of 0.125
    expect(events[2]!.time).toBeCloseTo(0.5)
    expect(events[3]!.time).toBeCloseTo(0.5625)
  })

  it('uses the base note, MIDI channel and velocity from settings', () => {
    const s = song()
    s.settings = { ...s.settings, baseNote: 48, midiChannel: 3, velocity: 64 }
    s.sections[0]!.steps = { c5: [1] }
    const { events } = compileSong(s)
    expect(events[0]!.data).toEqual([0x92, 53, 64])
    expect(events[1]!.data).toEqual([0x82, 53, 0])
  })

  it('merges consecutive steps into one gate in tie mode', () => {
    const s = song()
    s.channels[0]!.gateMode = 'tie'
    s.sections[0]!.steps = { c0: [0, 1, 2, 8] }
    const { events } = compileSong(s)
    expect(events.map((e) => e.kind)).toEqual(['on', 'off', 'on', 'off'])
    expect(events[0]!.time).toBe(0)
    expect(events[1]!.time).toBeCloseTo(0.375 - MIN_GAP_SECONDS)
    expect(events[2]!.time).toBeCloseTo(1)
    expect(events[3]!.time).toBeCloseTo(1.125 - MIN_GAP_SECONDS)
  })

  it('respects gate length and never lets a gate touch the next step', () => {
    const s = song()
    s.settings.gateLength = 1
    s.sections[0]!.steps = { c0: [0, 1] }
    const { events } = compileSong(s)
    expect(events[1]!.time).toBeCloseTo(0.125 - MIN_GAP_SECONDS)
    expect(events[1]!.time).toBeLessThan(events[2]!.time)
    expect(events[1]!.kind).toBe('off')
    expect(events[2]!.kind).toBe('on')
  })

  it('skips muted channels', () => {
    const s = song()
    s.channels[0]!.muted = true
    s.sections[0]!.steps = { c0: [0], c5: [0] }
    const { events } = compileSong(s)
    expect(events.map((e) => e.note)).toEqual([41, 41])
  })

  it('ignores steps outside the section length', () => {
    const s = song()
    s.sections[0]!.steps = { c0: [15, 16, 99, -1] }
    expect(compileSong(s).events).toHaveLength(2)
  })

  it('offsets events in later sections by the earlier sections duration', () => {
    const s = song()
    s.sections.push(createSection({ id: 's2', tempo: null, bars: 1 }))
    s.sections[1]!.steps = { c0: [0] }
    const { events, timeline } = compileSong(s)
    expect(timeline[1]!.startTime).toBe(2)
    expect(events[0]!.time).toBe(2)
  })

  it('sorts events by time with note-offs before note-ons at equal times', () => {
    const s = song()
    s.channels[0]!.gateMode = 'tie'
    s.sections[0]!.steps = { c0: [0], c5: [0] }
    s.settings.gateLength = 1
    const { events } = compileSong(s)
    expect(events.map((e) => [e.kind, e.note])).toEqual([
      ['on', 36],
      ['on', 41],
      ['off', 36],
      ['off', 41],
    ])
  })

  it('is deterministic', () => {
    const s = song()
    s.sections[0]!.steps = { c0: [0, 3, 7], c5: [1, 2] }
    expect(compileSong(s)).toEqual(compileSong(s))
  })
})
