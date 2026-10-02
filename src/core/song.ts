/**
 * Core song model for Conway's Sequencer.
 *
 * Everything in this module is plain data and pure functions so it can be
 * unit-tested without a DOM, a browser, or Web MIDI.
 */

/**
/**
 * The Conway's Game module exposes 64 trigger/gate outputs. The last two are reserved for
 * the x16 clock (CLOCK_NOTE in core/midi.ts) and the play gate (DEFAULT_PLAY_GATE_NOTE
 * below), so songs get 62 sequenced channels.
 */
export const MAX_CHANNELS = 62
export const MIN_TEMPO = 20
export const MAX_TEMPO = 400
export const DEFAULT_TEMPO = 120
export const MIN_BARS = 1
export const MAX_BARS = 256
export const SUBDIVISIONS = [1, 2, 3, 4, 6, 8] as const
export const TIME_SIGNATURE_UNITS = [2, 4, 8, 16] as const
/** The module responds to MIDI notes starting at C2 (36); output 1 = note 36. */
export const DEFAULT_BASE_NOTE = 36
/**
 * Default note for the play gate: the module's 64th output. Its 64 outputs follow MIDI notes
 * from the base note upwards, so with the default base note (36) the last one is note 99
 * (the 63rd, note 98, carries the x16 clock).
 */
export const DEFAULT_PLAY_GATE_NOTE = DEFAULT_BASE_NOTE + MAX_CHANNELS + 1
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
  /** 0-based module output (0..61). MIDI note = settings.baseNote + output. */
  output: number
  muted: boolean
  /** Solo: while any channel is soloed, every channel that is not soloed is silenced. */
  solo: boolean
}

/**
 * Loop points: a range of bars, counted across the whole song, that playback stays inside.
 * `start` is the first bar of the range and `end` the bar after its last one (so a range
 * covering bars 5 to 8 as shown in the GUI is `{ start: 4, end: 8 }`).
 */
export interface LoopRange {
  start: number
  end: number
}

export interface SongSettings {
  /** MIDI channel 1..16. */
  midiChannel: number
  /** MIDI note number sent for output 0. */
  baseNote: number
  /** Note-on velocity 1..127. */
  velocity: number
  /** MIDI note held on while the song is playing (0..127). */
  playGateNote: number
  /** Whether playback repeats (the loop range when one is set, otherwise the whole song). */
  loop: boolean
  /** Loop points, or null to play the whole song. */
  loopRange: LoopRange | null
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
  return {
    midiChannel: 1,
    baseNote: DEFAULT_BASE_NOTE,
    velocity: 100,
    playGateNote: DEFAULT_PLAY_GATE_NOTE,
    loop: true,
    loopRange: null,
  }
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

/** Bars in the whole song: the bar axis the loop points are counted on. */
export function totalBars(sections: readonly Pick<Section, 'bars'>[]): number {
  return sections.reduce((sum, s) => sum + s.bars, 0)
}

/**
 * Bring a loop range into the song: whole bars, `start` before `end`, both inside the song.
 * A reversed range is turned the right way round; one that does not cover at least one bar
 * once clamped, or whose numbers make no sense, becomes null (play the whole song).
 */
export function normalizeLoopRange(range: unknown, bars: number): LoopRange | null {
  if (typeof range !== 'object' || range === null) return null
  const { start, end } = range as { start?: unknown; end?: unknown }
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) {
    return null
  }
  const lo = clamp(Math.round(Math.min(start, end)), 0, bars)
  const hi = clamp(Math.round(Math.max(start, end)), 0, bars)
  return hi > lo ? { start: lo, end: hi } : null
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
