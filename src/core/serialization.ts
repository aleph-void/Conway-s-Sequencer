import {
  MAX_BARS,
  MAX_CHANNELS,
  MAX_TEMPO,
  MIN_BARS,
  MIN_TEMPO,
  SONG_VERSION,
  SUBDIVISIONS,
  TIME_SIGNATURE_UNITS,
  clamp,
  clampStepsToLength,
  defaultSettings,
  generateId,
  stepCount,
  type Channel,
  type Section,
  type Song,
  type SongSettings,
  type Subdivision,
  type TimeSignatureUnit,
} from './song'

export class SongValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SongValidationError'
  }
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeSettings(raw: unknown): SongSettings {
  const d = defaultSettings()
  if (!isObject(raw)) return d
  return {
    midiChannel: clamp(Math.round(asNumber(raw.midiChannel, d.midiChannel)), 1, 16),
    baseNote: clamp(Math.round(asNumber(raw.baseNote, d.baseNote)), 0, 127 - (MAX_CHANNELS - 1)),
    velocity: clamp(Math.round(asNumber(raw.velocity, d.velocity)), 1, 127),
    loop: typeof raw.loop === 'boolean' ? raw.loop : d.loop,
  }
}

function normalizeChannel(raw: unknown, index: number, seenIds: Set<string>): Channel {
  if (!isObject(raw)) throw new SongValidationError(`channel ${index} is not an object`)
  const output = Math.round(asNumber(raw.output, index))
  if (output < 0 || output >= MAX_CHANNELS) {
    throw new SongValidationError(`channel ${index} output ${output} is outside 0..${MAX_CHANNELS - 1}`)
  }
  let id = asString(raw.id, '')
  if (!id || seenIds.has(id)) id = generateId('ch')
  seenIds.add(id)
  return {
    id,
    name: asString(raw.name, `Out ${output + 1}`),
    output,
    muted: raw.muted === true,
    solo: raw.solo === true,
  }
}

function normalizeSection(raw: unknown, index: number, seenIds: Set<string>, channelIds: Set<string>): Section {
  if (!isObject(raw)) throw new SongValidationError(`section ${index} is not an object`)
  let id = asString(raw.id, '')
  if (!id || seenIds.has(id)) id = generateId('sec')
  seenIds.add(id)

  let tempo: number | null = null
  if (raw.tempo !== null && raw.tempo !== undefined) {
    const t = asNumber(raw.tempo, NaN)
    if (!Number.isFinite(t)) throw new SongValidationError(`section ${index} tempo must be a number or null`)
    tempo = clamp(t, MIN_TEMPO, MAX_TEMPO)
  }

  const tsRaw = isObject(raw.timeSignature) ? raw.timeSignature : {}
  const beats = clamp(Math.round(asNumber(tsRaw.beats, 4)), 1, 32)
  const unitNum = Math.round(asNumber(tsRaw.unit, 4))
  const unit: TimeSignatureUnit = (TIME_SIGNATURE_UNITS as readonly number[]).includes(unitNum)
    ? (unitNum as TimeSignatureUnit)
    : 4

  const bars = clamp(Math.round(asNumber(raw.bars, 4)), MIN_BARS, MAX_BARS)
  const subNum = Math.round(asNumber(raw.subdivision, 4))
  const subdivision: Subdivision = (SUBDIVISIONS as readonly number[]).includes(subNum) ? (subNum as Subdivision) : 4

  const section: Section = {
    id,
    name: asString(raw.name, `Section ${index + 1}`),
    tempo,
    timeSignature: { beats, unit },
    bars,
    subdivision,
    steps: {},
  }

  const stepsRaw = isObject(raw.steps) ? raw.steps : {}
  const steps: Record<string, number[]> = {}
  for (const [channelId, list] of Object.entries(stepsRaw)) {
    if (!channelIds.has(channelId) || !Array.isArray(list)) continue
    const cleaned = [...new Set(list.filter((n): n is number => Number.isInteger(n)))].sort((a, b) => a - b)
    if (cleaned.length) steps[channelId] = cleaned
  }
  section.steps = clampStepsToLength(steps, stepCount(section))
  return section
}

/**
 * Validate and normalise an unknown JSON value into a Song.
 * Unknown fields are dropped; bad numbers are clamped; structural errors throw.
 */
export function normalizeSong(raw: unknown): Song {
  if (!isObject(raw)) throw new SongValidationError('song must be an object')
  const version = asNumber(raw.version, SONG_VERSION)
  if (version > SONG_VERSION) throw new SongValidationError(`unsupported song version ${version}`)
  if (!Array.isArray(raw.channels)) throw new SongValidationError('song.channels must be an array')
  if (!Array.isArray(raw.sections)) throw new SongValidationError('song.sections must be an array')
  if (raw.channels.length > MAX_CHANNELS) {
    throw new SongValidationError(`a song may have at most ${MAX_CHANNELS} channels`)
  }

  const channelIds = new Set<string>()
  const channels = raw.channels.map((c, i) => normalizeChannel(c, i, channelIds))
  const sectionIds = new Set<string>()
  const sections = raw.sections.map((s, i) => normalizeSection(s, i, sectionIds, channelIds))

  return {
    version: SONG_VERSION,
    name: asString(raw.name, 'Untitled'),
    channels,
    sections,
    settings: normalizeSettings(raw.settings),
  }
}

export function serializeSong(song: Song): string {
  return JSON.stringify(song, null, 2)
}

export function parseSong(json: string): Song {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new SongValidationError('file is not valid JSON')
  }
  return normalizeSong(parsed)
}

/** File name used for JSON downloads. */
export function songFileName(song: Pick<Song, 'name'>): string {
  const slug = song.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song'
  return `${slug}.conway-seq.json`
}
