import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { allOutputsOff, isWebMidiSupported } from '../core/midi'

export type MidiStatus = 'unsupported' | 'idle' | 'requesting' | 'ready' | 'denied' | 'error'

export interface OutputInfo {
  id: string
  name: string
  manufacturer: string
  state: string
}

export const OUTPUT_STORAGE_KEY = 'conways-sequencer:output'

/** Minimal subset of MIDIAccess we need, so tests can pass a fake. */
export interface MidiAccessLike {
  outputs: Map<string, MidiOutputLike>
  onstatechange: ((event: unknown) => void) | null
}

export interface MidiOutputLike {
  id: string
  name?: string | null
  manufacturer?: string | null
  state?: string
  send: (data: number[] | Uint8Array, timestamp?: number) => void
  open?: () => Promise<unknown>
}

export type RequestMidiAccess = () => Promise<MidiAccessLike>

export const useMidiStore = defineStore('midi', () => {
  const supported = isWebMidiSupported()
  const status = ref<MidiStatus>(supported ? 'idle' : 'unsupported')
  const error = ref<string | null>(null)
  const outputs = ref<OutputInfo[]>([])
  const selectedOutputId = ref<string | null>(readStoredOutput())
  /** Count of messages handed to the output; handy for tests and a tiny activity indicator. */
  const sentCount = ref(0)

  // The native MIDIAccess object is kept out of Vue reactivity on purpose.
  let access: MidiAccessLike | null = null

  const selectedOutput = computed(() => outputs.value.find((o) => o.id === selectedOutputId.value) ?? null)
  const isConnected = computed(() => status.value === 'ready' && selectedOutput.value !== null)

  function readStoredOutput(): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(OUTPUT_STORAGE_KEY)
    } catch {
      return null
    }
  }

  function refreshOutputs() {
    if (!access) {
      outputs.value = []
      return
    }
    outputs.value = [...access.outputs.values()].map((o) => ({
      id: o.id,
      name: o.name ?? o.id,
      manufacturer: o.manufacturer ?? '',
      state: o.state ?? 'connected',
    }))
    if (selectedOutputId.value && !outputs.value.some((o) => o.id === selectedOutputId.value)) {
      // Keep the preference so the device is re-selected when it comes back.
      return
    }
    if (!selectedOutputId.value && outputs.value.length === 1) selectedOutputId.value = outputs.value[0]!.id
  }

  /**
   * Request Web MIDI access. `request` can be injected for tests; by default it
   * uses navigator.requestMIDIAccess without sysex (we never need it).
   */
  async function requestAccess(request?: RequestMidiAccess): Promise<boolean> {
    const fn: RequestMidiAccess | null =
      request ?? (supported ? () => navigator.requestMIDIAccess({ sysex: false }) as unknown as Promise<MidiAccessLike> : null)
    if (!fn) {
      status.value = 'unsupported'
      return false
    }
    status.value = 'requesting'
    error.value = null
    try {
      access = await fn()
      access.onstatechange = () => refreshOutputs()
      refreshOutputs()
      status.value = 'ready'
      return true
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const name = e instanceof Error ? e.name : ''
      status.value = /denied|permission|NotAllowed|SecurityError/i.test(`${name} ${message}`) ? 'denied' : 'error'
      error.value = message
      access = null
      outputs.value = []
      return false
    }
  }

  function selectOutput(id: string | null) {
    selectedOutputId.value = id
    try {
      if (typeof localStorage !== 'undefined') {
        if (id) localStorage.setItem(OUTPUT_STORAGE_KEY, id)
        else localStorage.removeItem(OUTPUT_STORAGE_KEY)
      }
    } catch {
      // ignore
    }
  }

  function rawOutput(): MidiOutputLike | null {
    if (!access || !selectedOutputId.value) return null
    return access.outputs.get(selectedOutputId.value) ?? null
  }

  /** Send a message at an absolute DOMHighResTimeStamp (ms). Silently no-ops without an output. */
  function send(data: number[], timestamp?: number) {
    const out = rawOutput()
    if (!out) return false
    try {
      out.send(data, timestamp)
      sentCount.value += 1
      return true
    } catch {
      return false
    }
  }

  /** Note-off for every possible output on the module, then All Notes Off. */
  function panic(midiChannel: number, baseNote: number) {
    for (const msg of allOutputsOff(midiChannel, baseNote)) send(msg)
  }

  /** Test hook / teardown: forget the access object. */
  function reset() {
    access = null
    outputs.value = []
    status.value = supported ? 'idle' : 'unsupported'
    error.value = null
    sentCount.value = 0
  }

  return {
    supported,
    status,
    error,
    outputs,
    selectedOutputId,
    selectedOutput,
    isConnected,
    sentCount,
    requestAccess,
    refreshOutputs,
    selectOutput,
    send,
    panic,
    reset,
  }
})
