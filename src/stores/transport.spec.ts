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
    expect(out.sent[0]).toEqual([[0x90, 36, 100], 0])
    await vi.advanceTimersByTimeAsync(600)
    // Each gate holds for its whole 125 ms step, minus the 2 ms gap before the next step.
    expect(out.sent.map((s) => s[1])).toEqual([0, 123, 500, 623])
    expect(transport.positionSeconds).toBeCloseTo(0.6, 1)
    expect(transport.currentStep).toBe(4)
    expect(transport.position?.sectionIndex).toBe(0)

    transport.stop()
    expect(transport.playing).toBe(false)
    expect(transport.positionSeconds).toBe(0)
    expect(transport.currentStep).toBe(-1)
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
    expect(out.sent.filter((s) => s[0][0] === 0x80)).toHaveLength(64)
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
