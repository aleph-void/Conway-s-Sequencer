import type { MidiEvent } from './compile'

export interface SchedulerDeps {
  /** Send a MIDI message at an absolute timestamp (ms, same clock as `now`). */
  send: (data: number[], timestampMs: number) => void
  /** Monotonic clock in ms (performance.now in the browser). */
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  /** How far ahead (ms) events are handed to the MIDI output. */
  lookaheadMs?: number
  /** How often (ms) the scheduler wakes up to fill the look-ahead window. */
  intervalMs?: number
  onStop?: () => void
}

/**
 * Look-ahead scheduler. Events are handed to the MIDI output slightly ahead of
 * time with precise timestamps, so JS timer jitter never reaches the module.
 * The scheduler owns no DOM or Vue state, so it is fully testable with fake timers.
 */
export class Scheduler {
  private events: MidiEvent[] = []
  private duration = 0
  private loop = false
  private index = 0
  private loopCount = 0
  private startMs = 0
  private timer: unknown = null
  private running = false
  private sounding = new Map<number, number[]>()
  /** Absolute timestamp (ms) of the last event handed to the output. */
  private lastSentAt = Number.NEGATIVE_INFINITY
  private readonly lookaheadMs: number
  private readonly intervalMs: number

  constructor(private readonly deps: SchedulerDeps) {
    this.lookaheadMs = deps.lookaheadMs ?? 120
    this.intervalMs = deps.intervalMs ?? 25
  }

  /**
   * Swap in new material. While running, playback continues seamlessly: events
   * that were already handed to the output are not re-sent, and the new list is
   * resumed right after the last event that went out.
   */
  load(events: MidiEvent[], duration: number, loop: boolean): void {
    if (!this.running) {
      this.events = events
      this.duration = duration
      this.loop = loop
      return
    }
    if (duration <= 0) {
      this.stop()
      this.events = events
      this.duration = duration
      this.loop = loop
      return
    }
    const now = this.deps.now()
    if (duration !== this.duration) {
      // The song length changed: re-anchor so the current position is preserved.
      const pos = this.position()
      this.startMs = now - pos * 1000
    }
    this.events = events
    this.duration = duration
    this.loop = loop

    // Song-time of the last sent event, expressed in the (possibly re-anchored) new timeline.
    // loopCount is recomputed from scratch: the tick may already have advanced it past the
    // last sent event while looking for the next one.
    this.loopCount = 0
    let target = (Math.max(this.lastSentAt, this.startMs - 1) - this.startMs) / 1000
    while (this.loop && target >= duration) {
      target -= duration
      this.loopCount += 1
    }
    this.index = this.events.findIndex((e) => e.time > target)
    if (this.index < 0) this.index = this.events.length

    // A note that is sounding keeps ringing only if the new material still ends it.
    for (const [note, off] of [...this.sounding]) {
      const next =
        this.events.find((e) => e.note === note && e.time > target) ??
        (this.loop ? this.events.find((e) => e.note === note) : undefined)
      if (!next || next.kind !== 'off') {
        this.deps.send(off, Math.max(now, this.lastSentAt))
        this.sounding.delete(note)
      }
    }
  }

  setLoop(loop: boolean): void {
    this.loop = loop
  }

  get isRunning(): boolean {
    return this.running
  }

  /** Current playback position in seconds, wrapped into [0, duration) when looping. */
  position(): number {
    if (!this.running || this.duration <= 0) return 0
    const elapsed = Math.max(0, (this.deps.now() - this.startMs) / 1000)
    if (this.loop) return elapsed % this.duration
    return Math.min(elapsed, this.duration)
  }

  start(fromSeconds = 0): void {
    if (this.running) this.stop(false)
    if (this.duration <= 0) return
    const from = Math.max(0, Math.min(fromSeconds, this.duration))
    this.running = true
    this.loopCount = 0
    this.startMs = this.deps.now() - from * 1000
    this.lastSentAt = Number.NEGATIVE_INFINITY
    this.index = this.events.findIndex((e) => e.time >= from)
    if (this.index < 0) this.index = this.events.length
    this.tick()
  }

  stop(notify = true): void {
    if (!this.running) return
    this.running = false
    if (this.timer !== null) {
      this.deps.clearTimeout(this.timer)
      this.timer = null
    }
    const now = this.deps.now()
    for (const data of this.sounding.values()) this.deps.send(data, now)
    this.sounding.clear()
    if (notify) this.deps.onStop?.()
  }

  private tick = (): void => {
    if (!this.running) return
    const now = this.deps.now()
    const horizon = now + this.lookaheadMs

    for (;;) {
      if (this.index >= this.events.length) {
        if (this.loop && this.events.length > 0) {
          this.loopCount += 1
          this.index = 0
          continue
        }
        break
      }
      const event = this.events[this.index]!
      const at = this.startMs + (event.time + this.loopCount * this.duration) * 1000
      if (at > horizon) break
      this.deps.send(event.data, at)
      this.lastSentAt = at
      if (event.kind === 'on') this.sounding.set(event.note, offFor(event))
      else this.sounding.delete(event.note)
      this.index += 1
    }

    if (!this.loop) {
      const endMs = this.startMs + this.duration * 1000
      if (this.index >= this.events.length && now >= endMs) {
        this.stop()
        return
      }
    }
    this.timer = this.deps.setTimeout(this.tick, this.intervalMs)
  }
}

function offFor(event: MidiEvent): number[] {
  const status = (event.data[0] ?? 0x90) & 0x0f
  return [0x80 | status, event.note, 0]
}
