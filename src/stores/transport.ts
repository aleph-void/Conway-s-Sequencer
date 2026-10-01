import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { compileSong } from '../core/compile'
import { noteOff, noteOn } from '../core/midi'
import { Scheduler } from '../core/scheduler'
import { locate, type Position } from '../core/timing'
import { useMidiStore } from './midi'
import { useSongStore } from './song'

export interface TransportDeps {
  now?: () => number
  requestFrame?: (cb: () => void) => unknown
  cancelFrame?: (handle: unknown) => void
}

/**
 * Transport states:
 *  - stopped: nothing runs and the cursor sits at the start.
 *  - playing: the scheduler runs and the play gate is high.
 *  - paused: nothing runs, the gate is low, but the cursor keeps its position so playback
 *    can resume from there.
 */
export const useTransportStore = defineStore('transport', () => {
  const songStore = useSongStore()
  const midi = useMidiStore()

  const playing = ref(false)
  const paused = ref(false)
  const positionSeconds = ref(0)
  const position = computed<Position | null>(() => locate(songStore.timeline, positionSeconds.value))
  /** Global step under the cursor while playing or paused, or -1 when stopped. */
  const currentStep = computed(() =>
    playing.value || paused.value ? (position.value?.globalStep ?? -1) : -1,
  )

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  /**
   * The play gate: the song's `playGateNote` is held on for the whole time the song is playing.
   * The pending note-off is remembered so the gate is released on the channel and note it was
   * raised on, even if the settings change mid-song.
   */
  let gateOff: number[] | null = null

  function raiseGate() {
    if (gateOff) return
    const { midiChannel, velocity, playGateNote } = songStore.song.settings
    gateOff = noteOff(midiChannel, playGateNote)
    midi.send(noteOn(midiChannel, playGateNote, velocity), now())
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
    // The scheduler stops by itself when a non-looping song reaches its end.
    onStop: () => halt(0),
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

  /** Stop the scheduler and the gate, leaving the cursor at `at` (stopped when 0, paused otherwise). */
  function halt(at: number) {
    scheduler.stop(false)
    releaseGate()
    stopFrames()
    playing.value = false
    positionSeconds.value = at
    paused.value = at > 0
  }

  /** Start playing from `fromSeconds`: the paused position by default, the start when stopped. */
  function play(fromSeconds = positionSeconds.value) {
    if (songStore.duration <= 0) return
    reload()
    // A cursor past the end (the song shrank while paused) starts over.
    const from = fromSeconds > 0 && fromSeconds < songStore.duration ? fromSeconds : 0
    // The gate goes high before the first step so the module sees "playing" first.
    raiseGate()
    scheduler.start(from)
    playing.value = scheduler.isRunning
    if (playing.value) {
      paused.value = false
      positionSeconds.value = from
      stopFrames()
      pump()
    } else {
      releaseGate()
    }
  }

  /** Stop where the cursor is, so `resume()` carries on from the same step. */
  function pause() {
    if (!playing.value) return
    halt(scheduler.position())
  }

  /** Continue from the paused position (or start from the top when stopped). */
  function resume() {
    if (playing.value) return
    play()
  }

  /** Return the cursor to the start. Playback, if running, restarts from there and keeps going. */
  function reset() {
    if (playing.value) {
      scheduler.start(0)
      positionSeconds.value = 0
      return
    }
    positionSeconds.value = 0
    paused.value = false
  }

  /** Stop and return the cursor to the start. */
  function stop() {
    halt(0)
  }

  /** Play/pause, the Space key behaviour. */
  function toggle() {
    if (playing.value) pause()
    else play()
  }

  function panic() {
    stop()
    const { midiChannel, baseNote, playGateNote } = songStore.song.settings
    midi.panic(midiChannel, baseNote, playGateNote)
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

  return { playing, paused, positionSeconds, position, currentStep, play, pause, resume, reset, stop, toggle, panic }
})
