import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OUTPUT_STORAGE_KEY, useMidiStore, type MidiAccessLike, type MidiOutputLike } from './midi'

function fakeOutput(id: string, name = id): MidiOutputLike & { sent: Array<[number[], number | undefined]> } {
  const sent: Array<[number[], number | undefined]> = []
  return {
    id,
    name,
    manufacturer: 'Fake',
    state: 'connected',
    sent,
    send: (data, ts) => sent.push([[...data], ts]),
  }
}

function fakeAccess(outputs: MidiOutputLike[]): MidiAccessLike {
  return { outputs: new Map(outputs.map((o) => [o.id, o])), onstatechange: null }
}

describe('useMidiStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('reports unsupported when navigator has no requestMIDIAccess (jsdom)', () => {
    const store = useMidiStore()
    expect(store.supported).toBe(false)
    expect(store.status).toBe('unsupported')
  })

  it('refuses to request without a provider when unsupported', async () => {
    const store = useMidiStore()
    expect(await store.requestAccess()).toBe(false)
    expect(store.status).toBe('unsupported')
  })

  it('lists outputs and auto-selects a single one', async () => {
    const store = useMidiStore()
    const out = fakeOutput('o1', 'Conway Interface')
    expect(await store.requestAccess(async () => fakeAccess([out]))).toBe(true)
    expect(store.status).toBe('ready')
    expect(store.outputs).toEqual([{ id: 'o1', name: 'Conway Interface', manufacturer: 'Fake', state: 'connected' }])
    expect(store.selectedOutputId).toBe('o1')
    expect(store.isConnected).toBe(true)
  })

  it('does not auto-select when several outputs exist', async () => {
    const store = useMidiStore()
    await store.requestAccess(async () => fakeAccess([fakeOutput('a'), fakeOutput('b')]))
    expect(store.selectedOutputId).toBeNull()
    expect(store.isConnected).toBe(false)
    store.selectOutput('b')
    expect(store.selectedOutput?.id).toBe('b')
    expect(localStorage.getItem(OUTPUT_STORAGE_KEY)).toBe('b')
    store.selectOutput(null)
    expect(localStorage.getItem(OUTPUT_STORAGE_KEY)).toBeNull()
  })

  it('restores the previously selected output from storage', async () => {
    localStorage.setItem(OUTPUT_STORAGE_KEY, 'b')
    setActivePinia(createPinia())
    const store = useMidiStore()
    await store.requestAccess(async () => fakeAccess([fakeOutput('a'), fakeOutput('b')]))
    expect(store.selectedOutput?.id).toBe('b')
  })

  it('keeps the preference when the device disappears and re-lists on statechange', async () => {
    const store = useMidiStore()
    const access = fakeAccess([fakeOutput('a'), fakeOutput('b')])
    await store.requestAccess(async () => access)
    store.selectOutput('b')
    access.outputs.delete('b')
    access.onstatechange?.({})
    expect(store.outputs.map((o) => o.id)).toEqual(['a'])
    expect(store.selectedOutputId).toBe('b')
    expect(store.isConnected).toBe(false)
    access.outputs.set('b', fakeOutput('b'))
    access.onstatechange?.({})
    expect(store.isConnected).toBe(true)
  })

  it('sends to the selected output with timestamps and counts messages', async () => {
    const store = useMidiStore()
    const out = fakeOutput('o1')
    await store.requestAccess(async () => fakeAccess([out]))
    expect(store.send([0x90, 36, 100], 123)).toBe(true)
    expect(out.sent).toEqual([[[0x90, 36, 100], 123]])
    expect(store.sentCount).toBe(1)
  })

  it('returns false when sending without an output or when the port throws', async () => {
    const store = useMidiStore()
    expect(store.send([0x90, 36, 100])).toBe(false)
    const bad = fakeOutput('o1')
    bad.send = () => {
      throw new Error('closed')
    }
    await store.requestAccess(async () => fakeAccess([bad]))
    expect(store.send([0x90, 36, 100])).toBe(false)
  })

  it('maps permission errors to denied and other failures to error', async () => {
    const store = useMidiStore()
    expect(await store.requestAccess(async () => Promise.reject(new DOMException('x', 'NotAllowedError')))).toBe(false)
    expect(store.status).toBe('denied')
    await store.requestAccess(async () => Promise.reject(new Error('device busy')))
    expect(store.status).toBe('error')
    await store.requestAccess(async () => Promise.reject(new Error('Permission denied')))
    expect(store.status).toBe('denied')
    expect(store.error).toBe('Permission denied')
    await store.requestAccess(async () => Promise.reject('boom'))
    expect(store.status).toBe('error')
    expect(store.error).toBe('boom')
  })

  it('panic sends note-off for all outputs and the play gate', async () => {
    const store = useMidiStore()
    const out = fakeOutput('o1')
    await store.requestAccess(async () => fakeAccess([out]))
    store.panic(1, 36)
    expect(out.sent).toHaveLength(65)
    expect(out.sent[62]![0]).toEqual([0x80, 98, 0])
    expect(out.sent[63]![0]).toEqual([0x80, 99, 0])
    expect(out.sent[64]![0]).toEqual([0xb0, 123, 0])
  })

  it('reset forgets everything', async () => {
    const store = useMidiStore()
    await store.requestAccess(async () => fakeAccess([fakeOutput('o1')]))
    store.reset()
    expect(store.status).toBe('unsupported')
    expect(store.outputs).toEqual([])
    expect(store.send([0x90, 1, 1])).toBe(false)
  })

  it('uses navigator.requestMIDIAccess when available', async () => {
    const out = fakeOutput('native')
    const request = vi.fn(async () => fakeAccess([out]))
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: request, configurable: true })
    try {
      setActivePinia(createPinia())
      const store = useMidiStore()
      expect(store.supported).toBe(true)
      expect(store.status).toBe('idle')
      await store.requestAccess()
      expect(request).toHaveBeenCalledWith({ sysex: false })
      expect(store.outputs[0]!.id).toBe('native')
    } finally {
      delete (navigator as unknown as Record<string, unknown>).requestMIDIAccess
    }
  })
})
