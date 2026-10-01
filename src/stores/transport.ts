import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { compileSong } from '../core/compile'
import { PLAY_GATE_NOTE, noteOff, noteOn } from '../core/midi'
import { Scheduler } from '../core/scheduler'
import { locate, type Position } from '../core/timing'
import { useMidiStore } from './midi'
import { useSongStore } from './song'

export interface TransportDeps {
  now?: () => number
  requestFrame?: (cb: () => void) => unknown
  cancelFrame?: (handle: unknown) => void
}

export const useTransportStore = defineStore('transport', () => {
  const songStore = useSongStore()
  const midi = useMidiStore()

  const playing = ref(false)
  const positionSeconds = ref(0)
  const position = computed<Position | null>(() => locate(songStore.timeline, positionSeconds.value))
  /** Global step under the playhead, or -1 when stopped. */
  const currentStep = computed(() => (playing.value ? (position.value?.globalStep ?? -1) : -1))

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  /**
   * The play gate: note PLAY_GATE_NOTE is held on for the whole time the song is playing.
   * The pending note-off is remembered so the gate is released on the channel it was
   * raised on, even if the MIDI channel setting changes mid-song.
   */
  let gateOff: number[] | null = null

  function raiseGate() {
    if (gateOff) return
    const { midiChannel, velocity } = songStore.song.settings
    gateOff = noteOff(midiChannel, PLAY_GATE_NOTE)
    midi.send(noteOn(midiChannel, PLAY_GATE_NOTE, velocity), now())
  }

  function releaseGate() {
    if (!gateOff) return
    midi.send(gateOff, now())
    gateOff = null
  }

  const scheduler = new Scheduler({
    send: (data, at) => midi.send(data, at),
    now,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    onStop: () => {
      releaseGate()
      playing.value = false
      positionSeconds.value = 0
      stopFrames()
    },
  })

  let frame: unknown = null
  const raf: (cb: () => void) => unknown =
    typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(cb, 16)
  const caf: (h: unknown) => void =
    typeof cancelAnimationFrame === 'function'
      ? (h) => cancelAnimationFrame(h as number)
      : (h) => clearTimeout(h as ReturnType<typeof setTimeout>)

  function pump() {
    if (!scheduler.isRunning) return
    positionSeconds.value = scheduler.position()
    frame = raf(pump)
  }

  function stopFrames() {
    if (frame !== null) caf(frame)
    frame = null
  }

  function reload() {
    const compiled = compileSong(songStore.song)
    scheduler.load(compiled.events, compiled.duration, songStore.song.settings.loop)
  }

  function play(fromSeconds = 0) {
    if (songStore.duration <= 0) return
    reload()
    // The gate goes high before the first step so the module sees "playing" first.
    raiseGate()
    scheduler.start(fromSeconds)
    playing.value = scheduler.isRunning
    if (playing.value) {
      stopFrames()
      pump()
    } else {
      releaseGate()
    }
  }

  function stop() {
    scheduler.stop()
    releaseGate()
    playing.value = false
    positionSeconds.value = 0
    stopFrames()
  }

  function toggle() {
    if (playing.value) stop()
    else play()
  }

  function panic() {
    stop()
    midi.panic(songStore.song.settings.midiChannel, songStore.song.settings.baseNote)
  }

  // Live-edit: recompile while playing so grid edits are heard on the next pass.
  watch(
    () => songStore.revision,
    () => {
      if (playing.value) reload()
    },
  )

  watch(
    () => songStore.song.settings.loop,
    (loop) => scheduler.setLoop(loop),
  )

  return { playing, positionSeconds, position, currentStep, play, stop, toggle, panic }
})
