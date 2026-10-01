/**
 * Core song model for Conway's Sequencer.
 *
 * Everything in this module is plain data and pure functions so it can be
 * unit-tested without a DOM, a browser, or Web MIDI.
 */

/** The Conway's Game module exposes 64 trigger/gate outputs. */
export const MAX_CHANNELS = 64
export const MIN_TEMPO = 20
export const MAX_TEMPO = 400
export const DEFAULT_TEMPO = 120
export const MIN_BARS = 1
export const MAX_BARS = 256
export const SUBDIVISIONS = [1, 2, 3, 4, 6, 8] as const
export const TIME_SIGNATURE_UNITS = [2, 4, 8, 16] as const
/** The module responds to MIDI notes starting at C2 (36); output 1 = note 36. */
export const DEFAULT_BASE_NOTE = 36
export const SONG_VERSION = 1 as const

export type Subdivision = (typeof SUBDIVISIONS)[number]
export type TimeSignatureUnit = (typeof TIME_SIGNATURE_UNITS)[number]

export interface TimeSignature {
  /** Numerator: beats per bar. */
  beats: number
  /** Denominator: which note value gets one beat. */
  unit: TimeSignatureUnit
}

export interface Section {
  id: string
  name: string
  /** Beats per minute (quarter-note based). `null` means "inherit from the previous section". */
  tempo: number | null
  timeSignature: TimeSignature
  bars: number
  /** Steps per beat; 4 means sixteenth-note resolution in x/4 time. */
  subdivision: Subdivision
  /** channelId -> sorted, de-duplicated list of "on" step indices within this section. */
  steps: Record<string, number[]>
}

export interface Channel {
  id: string
  name: string
  /** 0-based module output (0..63). MIDI note = settings.baseNote + output. */
  output: number
  muted: boolean
  /** Solo: while any channel is soloed, every channel that is not soloed is silenced. */
  solo: boolean
}

export interface SongSettings {
  /** MIDI channel 1..16. */
  midiChannel: number
  /** MIDI note number sent for output 0. */
  baseNote: number
  /** Note-on velocity 1..127. */
  velocity: number
  loop: boolean
}

export interface Song {
  version: typeof SONG_VERSION
  name: string
  channels: Channel[]
  sections: Section[]
  settings: SongSettings
}

let idCounter = 0
/** Small, collision-safe-enough id generator (time + counter + random). */
export function generateId(prefix = 'id'): string {
  idCounter = (idCounter + 1) % 1_000_000
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${rand}`
}

export function defaultSettings(): SongSettings {
  return { midiChannel: 1, baseNote: DEFAULT_BASE_NOTE, velocity: 100, loop: true }
}

export function createChannel(output: number, overrides: Partial<Channel> = {}): Channel {
  return {
    id: generateId('ch'),
    name: `Out ${output + 1}`,
    output,
    muted: false,
    solo: false,
    ...overrides,
  }
}

export function createSection(overrides: Partial<Section> = {}): Section {
  return {
    id: generateId('sec'),
    name: 'Section',
    tempo: null,
    timeSignature: { beats: 4, unit: 4 },
    bars: 4,
    subdivision: 4,
    steps: {},
    ...overrides,
  }
}

/** A fresh song: 8 channels (the first row of the module) and one 4-bar section at 120 BPM. */
export function createSong(name = 'Untitled'): Song {
  const channels = Array.from({ length: 8 }, (_, i) => createChannel(i))
  const first = createSection({ name: 'A', tempo: DEFAULT_TEMPO })
  return { version: SONG_VERSION, name, channels, sections: [first], settings: defaultSettings() }
}

export function stepsPerBar(section: Pick<Section, 'timeSignature' | 'subdivision'>): number {
  return section.timeSignature.beats * section.subdivision
}

export function stepCount(section: Pick<Section, 'timeSignature' | 'subdivision' | 'bars'>): number {
  return stepsPerBar(section) * section.bars
}

export function isStepOn(section: Section, channelId: string, step: number): boolean {
  const list = section.steps[channelId]
  return list !== undefined && list.includes(step)
}

/** Returns a new sorted step list with `step` added or removed. Does not mutate. */
export function withStepToggled(list: readonly number[] | undefined, step: number): number[] {
  const current = list ?? []
  if (current.includes(step)) return current.filter((s) => s !== step)
  return [...current, step].sort((a, b) => a - b)
}

/** Returns a new sorted step list with `step` set to `on`. Does not mutate. */
export function withStepSet(list: readonly number[] | undefined, step: number, on: boolean): number[] {
  const current = list ?? []
  const has = current.includes(step)
  if (on === has) return [...current]
  return withStepToggled(current, step)
}

/** Drop step indices that no longer fit after a section is shortened. */
export function clampStepsToLength(steps: Record<string, number[]>, length: number): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const [channelId, list] of Object.entries(steps)) {
    const kept = list.filter((s) => s >= 0 && s < length)
    if (kept.length > 0) out[channelId] = kept
  }
  return out
}

/**
 * Group a list of on-steps into inclusive [start, end] runs of consecutive steps.
 * Each run becomes one gate: it goes high at the first step and stays high until the
 * next off-step.
 */
export function groupRuns(steps: readonly number[]): Array<[number, number]> {
  const sorted = [...new Set(steps)].sort((a, b) => a - b)
  const runs: Array<[number, number]> = []
  for (const s of sorted) {
    const last = runs[runs.length - 1]
    if (last && last[1] === s - 1) last[1] = s
    else runs.push([s, s])
  }
  return runs
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** True when at least one channel is soloed, which implicitly mutes every other channel. */
export function anySoloed(channels: readonly Pick<Channel, 'solo'>[]): boolean {
  return channels.some((c) => c.solo)
}

/**
 * Whether a channel produces no gates right now: either it is muted outright, or another
 * channel is soloed and this one is not. An explicit mute always wins, even on a soloed channel.
 */
export function isChannelSilenced(
  channel: Pick<Channel, 'muted' | 'solo'>,
  channels: readonly Pick<Channel, 'solo'>[],
): boolean {
  return channel.muted || (!channel.solo && anySoloed(channels))
}

/** Outputs already claimed by channels, so a new channel can pick the lowest free one. */
export function nextFreeOutput(channels: readonly Channel[]): number | null {
  const used = new Set(channels.map((c) => c.output))
  for (let i = 0; i < MAX_CHANNELS; i++) if (!used.has(i)) return i
  return null
}
