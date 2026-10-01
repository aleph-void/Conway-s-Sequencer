/**
 * The song library: every song saved in this browser.
 *
 * Layout in storage:
 * - `conways-sequencer:library` is the index: which song is open, plus one
 *   {@link LibraryEntry} per saved song with the metadata the Song browser lists.
 * - `conways-sequencer:song:<id>` holds each song's JSON.
 * - `conways-sequencer:song` was the single-slot autosave used before the
 *   library existed; {@link loadLibrary} migrates it into the library.
 *
 * Everything here is a pure function over a Storage-like object so it can be
 * unit-tested without a browser.
 */
import { createSong, generateId, type Song } from './song'
import { parseSong, serializeSong } from './serialization'

export const LIBRARY_KEY = 'conways-sequencer:library'
export const SONG_KEY_PREFIX = 'conways-sequencer:song:'
export const LEGACY_SONG_KEY = 'conways-sequencer:song'
export const LIBRARY_VERSION = 1 as const

export type LibraryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** What the Song browser shows for one saved song. */
export interface LibraryEntry {
  id: string
  name: string
  channels: number
  sections: number
  /** Epoch milliseconds when the song was first saved in this browser. */
  createdAt: number
  /** Epoch milliseconds of the last save that changed the song. */
  updatedAt: number
}

export interface LibraryIndex {
  version: number
  /** The song that is open, or null when nothing has been saved yet. */
  currentId: string | null
  entries: LibraryEntry[]
}

export interface LoadedLibrary {
  index: LibraryIndex
  /** The id of the song to open. */
  id: string
  song: Song
  /** True when `song` is not in the library yet and needs its first write. */
  fresh: boolean
  /** True when `song` came from the pre-library autosave slot. */
  migrated: boolean
  /** True when `index` differs from what is in storage and should be written back. */
  indexChanged: boolean
}

export function songKey(id: string): string {
  return SONG_KEY_PREFIX + id
}

export function emptyIndex(): LibraryIndex {
  return { version: LIBRARY_VERSION, currentId: null, entries: [] }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

function normalizeEntry(raw: unknown): LibraryEntry | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id) return null
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? Math.min(raw.createdAt, updatedAt) : updatedAt
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : 'Untitled',
    channels: asCount(raw.channels),
    sections: asCount(raw.sections),
    createdAt,
    updatedAt,
  }
}

/** Read the index, tolerating a missing or corrupt one (which reads as empty). */
export function readIndex(storage: LibraryStorage): LibraryIndex {
  let parsed: unknown
  try {
    const raw = storage.getItem(LIBRARY_KEY)
    if (!raw) return emptyIndex()
    parsed = JSON.parse(raw)
  } catch {
    return emptyIndex()
  }
  if (!isObject(parsed) || !Array.isArray(parsed.entries)) return emptyIndex()
  const seen = new Set<string>()
  const entries: LibraryEntry[] = []
  for (const item of parsed.entries) {
    const entry = normalizeEntry(item)
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    entries.push(entry)
  }
  const currentId = typeof parsed.currentId === 'string' && seen.has(parsed.currentId) ? parsed.currentId : null
  return { version: LIBRARY_VERSION, currentId, entries }
}

/** Persist the index. Throws when storage rejects the write. */
export function writeIndex(storage: LibraryStorage, index: LibraryIndex): void {
  storage.setItem(LIBRARY_KEY, JSON.stringify({ ...index, version: LIBRARY_VERSION }))
}

/** Read one saved song, or null when it is missing or corrupt. */
export function readSong(storage: LibraryStorage, id: string): Song | null {
  try {
    const raw = storage.getItem(songKey(id))
    return raw ? parseSong(raw) : null
  } catch {
    return null
  }
}

/**
 * Most recently edited first. Entries are appended in creation order, so on a
 * tie (two songs saved in the same millisecond) the newer song comes first.
 */
export function sortEntries(entries: readonly LibraryEntry[]): LibraryEntry[] {
  return entries
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => b.entry.updatedAt - a.entry.updatedAt || b.order - a.order)
    .map(({ entry }) => entry)
}

/**
 * Write `song` under `id`, refresh its entry in `index` (which is mutated) and
 * persist the index. Returns whether the song's content changed since the
 * last write, so opening a song does not count as editing it.
 * Throws when storage rejects a write.
 */
export function saveToLibrary(
  storage: LibraryStorage,
  index: LibraryIndex,
  id: string,
  song: Song,
  now = Date.now(),
): boolean {
  const key = songKey(id)
  const json = serializeSong(song)
  const changed = storage.getItem(key) !== json
  if (changed) storage.setItem(key, json)

  const position = index.entries.findIndex((e) => e.id === id)
  const previous = index.entries[position]
  const entry: LibraryEntry = {
    id,
    name: song.name,
    channels: song.channels.length,
    sections: song.sections.length,
    createdAt: previous?.createdAt ?? now,
    updatedAt: changed || !previous ? now : previous.updatedAt,
  }
  if (position >= 0) index.entries[position] = entry
  else index.entries.push(entry)
  index.currentId = id
  writeIndex(storage, index)
  return changed
}

/** Remove a song and its entry. `index` is mutated; the index is persisted. */
export function removeFromLibrary(storage: LibraryStorage, index: LibraryIndex, id: string): void {
  storage.removeItem(songKey(id))
  index.entries = index.entries.filter((e) => e.id !== id)
  if (index.currentId === id) index.currentId = null
  writeIndex(storage, index)
}

/**
 * Work out which song to open on start-up: the one that was open last, else
 * the most recently edited one, else the pre-library autosave, else a fresh
 * song. Nothing is written; the caller saves a `fresh` song.
 */
export function loadLibrary(storage: LibraryStorage | null): LoadedLibrary {
  const index = emptyIndex()
  const fresh = (song: Song, migrated: boolean): LoadedLibrary => ({
    index,
    id: generateId('song'),
    song,
    fresh: true,
    migrated,
    indexChanged: true,
  })
  if (!storage) return fresh(createSong(), false)

  const stored = readIndex(storage)
  index.entries = stored.entries
  const candidates = [stored.currentId, ...sortEntries(stored.entries).map((e) => e.id)]
  for (const id of candidates) {
    if (!id) continue
    const song = readSong(storage, id)
    if (song) {
      index.currentId = id
      return { index, id, song, fresh: false, migrated: false, indexChanged: id !== stored.currentId }
    }
  }

  // Drop entries whose song is gone or unreadable; none of them could be opened.
  index.entries = []
  try {
    const legacy = storage.getItem(LEGACY_SONG_KEY)
    if (legacy) return fresh(parseSong(legacy), true)
  } catch {
    // Corrupt pre-library autosave; start fresh.
  }
  return fresh(createSong(), false)
}
