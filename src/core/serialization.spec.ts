import { describe, expect, it } from 'vitest'
import { SongValidationError, normalizeSong, parseSong, serializeSong, songFileName } from './serialization'
import { createChannel, createSection, createSong } from './song'

describe('serialization round trip', () => {
  it('serializes and parses a song unchanged', () => {
    const song = createSong('Round Trip')
    song.sections[0]!.steps = { [song.channels[0]!.id]: [0, 4, 8, 12] }
    expect(parseSong(serializeSong(song))).toEqual(song)
  })

  it('rejects invalid JSON', () => {
    expect(() => parseSong('{nope')).toThrow(SongValidationError)
  })
})

describe('normalizeSong', () => {
  it('rejects non-objects and missing arrays', () => {
    expect(() => normalizeSong(null)).toThrow(SongValidationError)
    expect(() => normalizeSong([])).toThrow(SongValidationError)
    expect(() => normalizeSong({ channels: [], sections: {} })).toThrow(/sections/)
    expect(() => normalizeSong({ channels: 'x', sections: [] })).toThrow(/channels/)
  })

  it('rejects future versions and more than 62 channels', () => {
    expect(() => normalizeSong({ version: 99, channels: [], sections: [] })).toThrow(/version/)
    const channels = Array.from({ length: 63 }, (_, i) => ({ output: i % 62 }))
    expect(() => normalizeSong({ channels, sections: [] })).toThrow(/62/)
  })

  it('fills defaults for missing fields', () => {
    const song = normalizeSong({ channels: [{}], sections: [{}] })
    expect(song.name).toBe('Untitled')
    expect(song.channels[0]).toMatchObject({ output: 0, name: 'Out 1', muted: false, solo: false })
    expect(song.sections[0]).toMatchObject({
      tempo: null,
      timeSignature: { beats: 4, unit: 4 },
      bars: 4,
      subdivision: 4,
      steps: {},
    })
    expect(song.settings).toEqual({ midiChannel: 1, baseNote: 36, velocity: 100, playGateNote: 99, loop: true })
  })

  it('clamps numeric ranges', () => {
    const song = normalizeSong({
      channels: [],
      sections: [{ tempo: 9999, bars: 0, timeSignature: { beats: 99, unit: 5 }, subdivision: 7 }],
      settings: { midiChannel: 42, baseNote: 120, velocity: 0 },
    })
    expect(song.sections[0]).toMatchObject({ tempo: 400, bars: 1, timeSignature: { beats: 32, unit: 4 }, subdivision: 4 })
    expect(song.settings).toMatchObject({ midiChannel: 16, baseNote: 66, velocity: 1 })
  })

  it('rejects channel outputs outside the module range', () => {
    expect(() => normalizeSong({ channels: [{ output: 62 }], sections: [] })).toThrow(/output/)
  })

  it('rejects a non-numeric tempo', () => {
    expect(() => normalizeSong({ channels: [], sections: [{ tempo: 'fast' }] })).toThrow(/tempo/)
  })

  it('drops steps for unknown channels, de-duplicates and clamps to section length', () => {
    const song = normalizeSong({
      channels: [{ id: 'a', output: 0 }],
      sections: [{ id: 's', bars: 1, steps: { a: [3, 3, 1, 16, 'x', 2.5], ghost: [0] } }],
    })
    expect(song.sections[0]!.steps).toEqual({ a: [1, 3] })
  })

  it('regenerates duplicate or missing ids', () => {
    const song = normalizeSong({
      channels: [{ id: 'dup', output: 0 }, { id: 'dup', output: 1 }, { output: 2 }],
      sections: [{ id: 'x' }, { id: 'x' }],
    })
    const ids = new Set(song.channels.map((c) => c.id))
    expect(ids.size).toBe(3)
    expect(song.sections[0]!.id).not.toBe(song.sections[1]!.id)
  })

  it('keeps the muted flag and drops the legacy gateMode and gateLength fields', () => {
    const song = normalizeSong({
      channels: [{ output: 1, gateMode: 'tie', muted: true }],
      sections: [],
      settings: { gateLength: 0.25 },
    })
    expect(song.channels[0]).toMatchObject({ muted: true })
    expect(song.channels[0]).not.toHaveProperty('gateMode')
    expect(song.settings).not.toHaveProperty('gateLength')
  })

  it('keeps the solo flag and defaults it to false for older files', () => {
    const song = normalizeSong({
      channels: [{ output: 0, solo: true }, { output: 1 }, { output: 2, solo: 'yes' }],
      sections: [],
    })
    expect(song.channels.map((c) => c.solo)).toEqual([true, false, false])
  })
})

describe('songFileName', () => {
  it('slugifies the song name', () => {
    expect(songFileName({ name: 'My Great Song!' })).toBe('my-great-song.conway-seq.json')
    expect(songFileName({ name: '   ' })).toBe('song.conway-seq.json')
  })
})

describe('fixtures', () => {
  it('handles a hand-written legacy-looking file', () => {
    const raw = {
      name: 'Legacy',
      channels: [createChannel(0, { id: 'k' }), createChannel(1, { id: 's' })],
      sections: [createSection({ id: 'a', tempo: 100, steps: { k: [0, 8], s: [4, 12] } })],
    }
    const song = normalizeSong(JSON.parse(JSON.stringify(raw)))
    expect(song.version).toBe(1)
    expect(song.sections[0]!.steps).toEqual({ k: [0, 8], s: [4, 12] })
  })
})
