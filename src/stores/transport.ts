import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { compileSong } from '../core/compile'
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
  const scheduler = new Scheduler({
    send: (data, at) => midi.send(data, at),
    now,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    onStop: () => {
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
    scheduler.start(fromSeconds)
    playing.value = scheduler.isRunning
    if (playing.value) {
      stopFrames()
      pump()
    }
  }

  function stop() {
    scheduler.stop()
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
