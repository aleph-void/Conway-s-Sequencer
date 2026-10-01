import { describe, expect, it } from 'vitest'
import {
  LEGACY_SONG_KEY,
  LIBRARY_KEY,
  emptyIndex,
  loadLibrary,
  readIndex,
  readSong,
  removeFromLibrary,
  saveToLibrary,
  songKey,
  sortEntries,
  writeIndex,
  type LibraryEntry,
} from './library'
import { serializeSong } from './serialization'
import { createSong } from './song'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  }
}

function entry(id: string, updatedAt: number, patch: Partial<LibraryEntry> = {}): LibraryEntry {
  return { id, name: id, channels: 8, sections: 1, createdAt: updatedAt, updatedAt, ...patch }
}

describe('library index', () => {
  it('reads an empty index when nothing, junk or a non-index is stored', () => {
    const storage = memoryStorage()
    expect(readIndex(storage)).toEqual(emptyIndex())
    storage.setItem(LIBRARY_KEY, '{broken')
    expect(readIndex(storage)).toEqual(emptyIndex())
    storage.setItem(LIBRARY_KEY, '[]')
    expect(readIndex(storage)).toEqual(emptyIndex())
    storage.setItem(LIBRARY_KEY, JSON.stringify({ entries: 'nope' }))
    expect(readIndex(storage)).toEqual(emptyIndex())
  })

  it('normalises entries, drops duplicates and junk, and validates currentId', () => {
    const storage = memoryStorage()
    storage.setItem(
      LIBRARY_KEY,
      JSON.stringify({
        version: 1,
        currentId: 'ghost',
        entries: [
          { id: 'a', name: 'A', channels: 3, sections: 2, createdAt: 10, updatedAt: 20 },
          { id: 'a', name: 'dupe' },
          { id: '', name: 'no id' },
          'junk',
          { id: 'b', channels: -4, sections: 'x', createdAt: 99, updatedAt: 50 },
          { id: 'c' },
        ],
      }),
    )
    const index = readIndex(storage)
    expect(index.currentId).toBeNull()
    expect(index.entries).toEqual([
      { id: 'a', name: 'A', channels: 3, sections: 2, createdAt: 10, updatedAt: 20 },
      { id: 'b', name: 'Untitled', channels: 0, sections: 0, createdAt: 50, updatedAt: 50 },
      { id: 'c', name: 'Untitled', channels: 0, sections: 0, createdAt: 0, updatedAt: 0 },
    ])
    storage.setItem(LIBRARY_KEY, JSON.stringify({ currentId: 'b', entries: [entry('b', 1)] }))
    expect(readIndex(storage).currentId).toBe('b')
  })

  it('round-trips through writeIndex', () => {
    const storage = memoryStorage()
    const index = { version: 1, currentId: 'a', entries: [entry('a', 5)] }
    writeIndex(storage, index)
    expect(readIndex(storage)).toEqual(index)
  })

  it('sorts most recently edited first, newest-created first on ties', () => {
    const sorted = sortEntries([entry('old', 1), entry('tie1', 5), entry('new', 9), entry('tie2', 5)])
    expect(sorted.map((e) => e.id)).toEqual(['new', 'tie2', 'tie1', 'old'])
  })
})

describe('saving and removing songs', () => {
  it('writes the song, adds an entry and reports changes', () => {
    const storage = memoryStorage()
    const index = emptyIndex()
    const song = createSong('Mine')
    expect(saveToLibrary(storage, index, 's1', song, 1000)).toBe(true)
    expect(storage.getItem(songKey('s1'))).toBe(serializeSong(song))
    expect(index.currentId).toBe('s1')
    expect(index.entries).toEqual([{ id: 's1', name: 'Mine', channels: 8, sections: 1, createdAt: 1000, updatedAt: 1000 }])
    expect(readIndex(storage)).toEqual(index)

    // Unchanged content keeps updatedAt; a rename bumps it but keeps createdAt.
    expect(saveToLibrary(storage, index, 's1', song, 2000)).toBe(false)
    expect(index.entries[0]!.updatedAt).toBe(1000)
    song.name = 'Renamed'
    expect(saveToLibrary(storage, index, 's1', song, 3000)).toBe(true)
    expect(index.entries[0]).toMatchObject({ name: 'Renamed', createdAt: 1000, updatedAt: 3000 })
    expect(index.entries).toHaveLength(1)

    // A second song gets its own entry and becomes current.
    saveToLibrary(storage, index, 's2', createSong('Other'), 4000)
    expect(index.currentId).toBe('s2')
    expect(index.entries.map((e) => e.id)).toEqual(['s1', 's2'])
  })

  it('reads songs back and treats missing or corrupt ones as null', () => {
    const storage = memoryStorage()
    const index = emptyIndex()
    saveToLibrary(storage, index, 's1', createSong('Mine'))
    expect(readSong(storage, 's1')?.name).toBe('Mine')
    expect(readSong(storage, 'nope')).toBeNull()
    storage.setItem(songKey('bad'), '{broken')
    expect(readSong(storage, 'bad')).toBeNull()
  })

  it('removes a song and clears currentId when it was open', () => {
    const storage = memoryStorage()
    const index = emptyIndex()
    saveToLibrary(storage, index, 's1', createSong('One'))
    saveToLibrary(storage, index, 's2', createSong('Two'))
    removeFromLibrary(storage, index, 's1')
    expect(storage.getItem(songKey('s1'))).toBeNull()
    expect(index.entries.map((e) => e.id)).toEqual(['s2'])
    expect(index.currentId).toBe('s2')
    removeFromLibrary(storage, index, 's2')
    expect(index.currentId).toBeNull()
    expect(readIndex(storage)).toEqual(emptyIndex())
    removeFromLibrary(storage, index, 'nope')
  })

  it('propagates storage failures', () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(() => saveToLibrary(storage, emptyIndex(), 's1', createSong())).toThrow('QuotaExceededError')
  })
})

describe('loadLibrary', () => {
  it('starts fresh without storage or with an empty library', () => {
    const none = loadLibrary(null)
    expect(none).toMatchObject({ fresh: true, migrated: false, indexChanged: true })
    expect(none.song.name).toBe('Untitled')
    expect(none.index).toEqual(emptyIndex())
    const empty = loadLibrary(memoryStorage())
    expect(empty).toMatchObject({ fresh: true, migrated: false })
    expect(empty.id).not.toBe(none.id)
  })

  it('opens the last open song', () => {
    const storage = memoryStorage()
    const index = emptyIndex()
    saveToLibrary(storage, index, 's1', createSong('One'), 1)
    saveToLibrary(storage, index, 's2', createSong('Two'), 2)
    index.currentId = 's1'
    writeIndex(storage, index)
    const loaded = loadLibrary(storage)
    expect(loaded).toMatchObject({ id: 's1', fresh: false, migrated: false, indexChanged: false })
    expect(loaded.song.name).toBe('One')
    expect(loaded.index.currentId).toBe('s1')
    expect(loaded.index.entries).toHaveLength(2)
  })

  it('falls back to the most recently edited readable song and flags the index', () => {
    const storage = memoryStorage()
    const index = emptyIndex()
    saveToLibrary(storage, index, 'old', createSong('Old'), 1)
    saveToLibrary(storage, index, 'new', createSong('New'), 3)
    saveToLibrary(storage, index, 'gone', createSong('Gone'), 5)
    storage.removeItem(songKey('gone'))
    index.currentId = null
    writeIndex(storage, index)
    const loaded = loadLibrary(storage)
    expect(loaded).toMatchObject({ id: 'new', fresh: false, indexChanged: true })
    expect(loaded.index.currentId).toBe('new')
  })

  it('migrates the pre-library autosave when no entry can be opened', () => {
    const storage = memoryStorage()
    storage.setItem(LEGACY_SONG_KEY, serializeSong(createSong('Legacy')))
    storage.setItem(LIBRARY_KEY, JSON.stringify({ currentId: 'x', entries: [entry('x', 1)] }))
    const loaded = loadLibrary(storage)
    expect(loaded).toMatchObject({ fresh: true, migrated: true, indexChanged: true })
    expect(loaded.song.name).toBe('Legacy')
    expect(loaded.index.entries).toEqual([])
    // The legacy slot is left in place until the caller has written the song.
    expect(storage.getItem(LEGACY_SONG_KEY)).not.toBeNull()
  })

  it('ignores a corrupt pre-library autosave', () => {
    const storage = memoryStorage()
    storage.setItem(LEGACY_SONG_KEY, '{broken')
    const loaded = loadLibrary(storage)
    expect(loaded).toMatchObject({ fresh: true, migrated: false })
    expect(loaded.song.name).toBe('Untitled')
  })
})
