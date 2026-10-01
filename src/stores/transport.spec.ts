import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMidiStore, type MidiAccessLike, type MidiOutputLike } from './midi'
import { useSongStore } from './song'
import { useTransportStore } from './transport'

function fakeOutput(): MidiOutputLike & { sent: Array<[number[], number | undefined]> } {
  const sent: Array<[number[], number | undefined]> = []
  return { id: 'o', name: 'o', manufacturer: '', state: 'connected', sent, send: (d, t) => sent.push([[...d], t]) }
}

describe('useTransportStore', () => {
  let out: ReturnType<typeof fakeOutput>

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    localStorage.clear()
    setActivePinia(createPinia())
    out = fakeOutput()
    const access: MidiAccessLike = { outputs: new Map([['o', out]]), onstatechange: null }
    await useMidiStore().requestAccess(async () => access)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('plays the compiled song through the MIDI store and tracks position', async () => {
    const song = useSongStore()
    const transport = useTransportStore()
    const sec = song.song.sections[0]!
    const ch = song.song.channels[0]!.id
    song.toggleStep(sec.id, ch, 0)
    song.toggleStep(sec.id, ch, 4)

    transport.play()
    expect(transport.playing).toBe(true)
    // The play gate goes high first, then the first step's note-on.
    expect(out.sent[0]).toEqual([[0x90, 99, 100], 0])
    expect(out.sent[1]).toEqual([[0x90, 36, 100], 0])
    await vi.advanceTimersByTimeAsync(600)
    // Each gate holds for its whole 125 ms step, minus the 2 ms gap before the next step.
    expect(out.sent.filter((s) => s[0][1] === 36).map((s) => s[1])).toEqual([0, 123, 500, 623])
    expect(transport.positionSeconds).toBeCloseTo(0.6, 1)
    expect(transport.currentStep).toBe(4)
    expect(transport.position?.sectionIndex).toBe(0)

    transport.stop()
    expect(transport.playing).toBe(false)
    expect(transport.positionSeconds).toBe(0)
    expect(transport.currentStep).toBe(-1)
    expect(out.sent.at(-1)).toEqual([[0x80, 99, 0], 600])
  })

  it('pulses the x16 clock on note 98 sixteen times per beat while playing', async () => {
    const transport = useTransportStore()
    transport.play()
    await vi.advanceTimersByTimeAsync(1000)
    const ons = out.sent.filter((s) => s[0][0] === 0x90 && s[0][1] === 98).map((s) => s[1]!)
    const offs = out.sent.filter((s) => s[0][0] === 0x80 && s[0][1] === 98).map((s) => s[1]!)
    // 120 BPM: a beat is 500 ms, so a pulse every 31.25 ms, high for half of that.
    expect(ons.filter((t) => t < 500)).toHaveLength(16)
    expect(ons.slice(0, 3)).toEqual([0, 31.25, 62.5])
    expect(ons[16]).toBe(500)
    expect(offs.slice(0, 2)).toEqual([15.625, 46.875])
    expect(out.sent[0]).toEqual([[0x90, 99, 100], 0]) // the play gate still goes first
    transport.stop()
    // Nothing on the clock note is sent after stop, apart from releasing a pulse that was high.
    const after = out.sent.slice(out.sent.findIndex((s) => s[0][1] === 99 && s[0][0] === 0x80))
    expect(after.filter((s) => s[0][1] === 98 && s[0][0] === 0x90)).toHaveLength(0)
  })

  it('holds the play gate on note 99 while playing and releases it on stop', () => {
    const transport = useTransportStore()
    const gate = () => out.sent.filter((s) => s[0][1] === 99).map((s) => s[0])
    transport.play()
    expect(gate()).toEqual([[0x90, 99, 100]])
    transport.stop()
    expect(gate()).toEqual([[0x90, 99, 100], [0x80, 99, 0]])
    transport.stop() // a second stop does not release the gate twice
    expect(gate()).toHaveLength(2)
  })

  it('sends the play gate on the configured channel with the configured velocity', () => {
    const song = useSongStore()
    song.updateSettings({ midiChannel: 5, velocity: 64 })
    const transport = useTransportStore()
    transport.play()
    expect(out.sent[0]![0]).toEqual([0x94, 99, 64])
    // The gate is released on the channel it was raised on, even if the setting changed meanwhile.
    song.updateSettings({ midiChannel: 2 })
    transport.stop()
    expect(out.sent.at(-1)![0]).toEqual([0x84, 99, 0])
  })

  it('releases the play gate when a non-looping song reaches its end', async () => {
    const song = useSongStore()
    song.updateSettings({ loop: false })
    const transport = useTransportStore()
    transport.play()
    expect(out.sent.filter((s) => s[0][1] === 99)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(8100)
    expect(transport.playing).toBe(false)
    expect(out.sent.filter((s) => s[0][1] === 99).map((s) => s[0])).toEqual([[0x90, 99, 100], [0x80, 99, 0]])
  })

  it('does not raise the play gate for a song that cannot play', () => {
    const song = useSongStore()
    song.removeSection(song.song.sections[0]!.id)
    const transport = useTransportStore()
    transport.play()
    expect(out.sent).toHaveLength(0)
  })

  it('toggle starts and stops', () => {
    const transport = useTransportStore()
    transport.toggle()
    expect(transport.playing).toBe(true)
    transport.toggle()
    expect(transport.playing).toBe(false)
  })

  it('does nothing for a song with no sections', () => {
    const song = useSongStore()
    song.removeSection(song.song.sections[0]!.id)
    const transport = useTransportStore()
    transport.play()
    expect(transport.playing).toBe(false)
  })

  it('recompiles live when the grid changes while playing', async () => {
    const song = useSongStore()
    const transport = useTransportStore()
    const sec = song.song.sections[0]!
    const ch = song.song.channels[1]!.id
    transport.play()
    await vi.advanceTimersByTimeAsync(100)
    song.toggleStep(sec.id, ch, 8) // 1.0 s into the song
    await vi.advanceTimersByTimeAsync(1000)
    expect(out.sent.some((s) => s[0][1] === 37 && s[1] === 1000)).toBe(true)
    expect(transport.playing).toBe(true)
  })

  it('stops at the end when loop is off and resets', async () => {
    const song = useSongStore()
    song.updateSettings({ loop: false })
    const transport = useTransportStore()
    transport.play()
    await vi.advanceTimersByTimeAsync(8100)
    expect(transport.playing).toBe(false)
    expect(transport.positionSeconds).toBe(0)
  })

  it('panic stops and floods note-offs', () => {
    const transport = useTransportStore()
    transport.play()
    transport.panic()
    expect(transport.playing).toBe(false)
    // Stop releases the play gate, then the flood covers 62 outputs, the clock and the play gate again.
    const flood = out.sent.slice(-65).map((s) => s[0])
    expect(out.sent.at(-66)![0]).toEqual([0x80, 99, 0])
    expect(flood[0]).toEqual([0x80, 36, 0])
    expect(flood[61]).toEqual([0x80, 97, 0])
    expect(flood[62]).toEqual([0x80, 98, 0])
    expect(flood[63]).toEqual([0x80, 99, 0])
    expect(flood[64]).toEqual([0xb0, 123, 0])
  })

  it('reacts to loop setting changes while playing', async () => {
    const song = useSongStore()
    const transport = useTransportStore()
    transport.play()
    song.updateSettings({ loop: false })
    await vi.advanceTimersByTimeAsync(8100)
    expect(transport.playing).toBe(false)
  })
})
