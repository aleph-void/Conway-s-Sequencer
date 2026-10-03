import { describe, expect, it } from 'vitest'
import {
  CLOCK_NOTE,
  DEFAULT_PLAY_GATE_NOTE,
  allNotesOff,
  allOutputsOff,
  isWebMidiSupported,
  noteName,
  noteOff,
  noteOffFor,
  noteOn,
  outputToNote,
  statusByte,
} from './midi'

describe('MIDI message builders', () => {
  it('builds note-on with the 1-based channel in the low nibble', () => {
    expect(noteOn(1, 36, 100)).toEqual([0x90, 36, 100])
    expect(noteOn(16, 60, 127)).toEqual([0x9f, 60, 127])
  })

  it('builds note-off', () => {
    expect(noteOff(1, 36)).toEqual([0x80, 36, 0])
    expect(noteOff(10, 99)).toEqual([0x89, 99, 0])
  })

  it('clamps out-of-range values', () => {
    expect(noteOn(0, -5, 300)).toEqual([0x90, 0, 127])
    expect(noteOn(99, 200, 0)).toEqual([0x9f, 127, 1])
    expect(statusByte(0x90, 1.4)).toBe(0x90)
  })

  it('builds the note-off that releases a note-on, on the same channel', () => {
    expect(noteOffFor([0x95, 36, 100])).toEqual([0x85, 36, 0])
    expect(noteOffFor(noteOn(1, 60, 100))).toEqual(noteOff(1, 60))
  })

  it('builds all-notes-off CC', () => {
    expect(allNotesOff(1)).toEqual([0xb0, 123, 0])
  })
})

describe('outputToNote', () => {
  it('maps output 0 to the base note', () => {
    expect(outputToNote(0, 36)).toBe(36)
    expect(outputToNote(61, 36)).toBe(97)
  })

  it('rejects invalid outputs and notes', () => {
    expect(() => outputToNote(62, 36)).toThrow(RangeError)
    expect(() => outputToNote(-1, 36)).toThrow(RangeError)
    expect(() => outputToNote(1.5, 36)).toThrow(RangeError)
    expect(() => outputToNote(61, 100)).toThrow(RangeError)
  })
})

describe('noteName', () => {
  it('uses the C4 = 60 convention', () => {
    expect(noteName(60)).toBe('C4')
    expect(noteName(36)).toBe('C2')
    expect(noteName(99)).toBe('D#7')
    expect(noteName(0)).toBe('C-1')
  })
})

describe('allOutputsOff', () => {
  it('sends a note-off for all 62 outputs, the clock, the play gate, then all-notes-off', () => {
    const msgs = allOutputsOff(1, 36)
    expect(msgs).toHaveLength(65)
    expect(msgs[0]).toEqual([0x80, 36, 0])
    expect(msgs[61]).toEqual([0x80, 97, 0])
    expect(msgs[62]).toEqual([0x80, CLOCK_NOTE, 0])
    expect(DEFAULT_PLAY_GATE_NOTE).toBe(99)
    expect(msgs[63]).toEqual([0x80, 99, 0])
    expect(msgs[64]).toEqual([0xb0, 123, 0])
  })

  it('releases the play gate on the configured note', () => {
    const msgs = allOutputsOff(1, 36, 100)
    expect(msgs[63]).toEqual([0x80, 100, 0])
  })

  it('skips notes above 127', () => {
    const msgs = allOutputsOff(1, 100)
    expect(msgs).toHaveLength(28 + 1 + 1 + 1)
  })
})

describe('isWebMidiSupported', () => {
  it('detects requestMIDIAccess', () => {
    expect(isWebMidiSupported(undefined)).toBe(false)
    expect(isWebMidiSupported({} as Navigator)).toBe(false)
    expect(isWebMidiSupported({ requestMIDIAccess: () => Promise.reject() } as unknown as Navigator)).toBe(true)
  })
})
