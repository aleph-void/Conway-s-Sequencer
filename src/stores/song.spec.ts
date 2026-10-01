import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { MAX_CHANNELS, createSong } from '../core/song'
import { STORAGE_KEY, loadInitialSong, useSongStore } from './song'

describe('useSongStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with a default song', () => {
    const store = useSongStore()
    expect(store.song.channels).toHaveLength(8)
    expect(store.song.sections).toHaveLength(1)
    expect(store.stepTotal).toBe(64)
    expect(store.duration).toBe(8)
  })

  describe('channels', () => {
    it('adds channels on the next free output up to 64', () => {
      const store = useSongStore()
      const ch = store.addChannel()
      expect(ch?.output).toBe(8)
      expect(store.song.channels).toHaveLength(9)
      while (store.canAddChannel) store.addChannel()
      expect(store.song.channels).toHaveLength(MAX_CHANNELS)
      expect(store.addChannel()).toBeNull()
    })

    it('removes a channel and its steps everywhere', () => {
      const store = useSongStore()
      const id = store.song.channels[0]!.id
      const sectionId = store.song.sections[0]!.id
      store.toggleStep(sectionId, id, 0)
      store.removeChannel(id)
      expect(store.song.channels.find((c) => c.id === id)).toBeUndefined()
      expect(store.song.sections[0]!.steps[id]).toBeUndefined()
      store.removeChannel('nope')
      expect(store.song.channels).toHaveLength(7)
    })

    it('updates and clamps channel fields', () => {
      const store = useSongStore()
      const id = store.song.channels[0]!.id
      store.updateChannel(id, { name: 'Kick', output: 99, muted: true })
      expect(store.channelById(id)).toMatchObject({ name: 'Kick', output: 63, muted: true })
      store.updateChannel('missing', { name: 'x' })
    })

    it('moves channels', () => {
      const store = useSongStore()
      const [a, b] = store.song.channels.map((c) => c.id)
      store.moveChannel(a!, 1)
      expect(store.song.channels.map((c) => c.id).slice(0, 2)).toEqual([b, a])
      store.moveChannel(b!, -1)
      expect(store.song.channels[0]!.id).toBe(b)
      store.moveChannel('nope', 1)
    })
  })

  describe('sections', () => {
    it('adds a section inheriting the template meter and null tempo', () => {
      const store = useSongStore()
      store.updateSection(store.song.sections[0]!.id, { timeSignature: { beats: 7, unit: 8 }, bars: 2 })
      const s = store.addSection()
      expect(s.tempo).toBeNull()
      expect(s.timeSignature).toEqual({ beats: 7, unit: 8 })
      expect(s.bars).toBe(2)
      expect(store.song.sections).toHaveLength(2)
      expect(store.resolvedTempos).toEqual([120, 120])
    })

    it('inserts after a given section', () => {
      const store = useSongStore()
      const first = store.song.sections[0]!.id
      store.addSection({ name: 'C' })
      const b = store.addSection({ name: 'B' }, first)
      expect(store.song.sections.map((s) => s.name)).toEqual(['A', 'B', 'C'])
      expect(b.name).toBe('B')
    })

    it('duplicates a section including its steps', () => {
      const store = useSongStore()
      const sec = store.song.sections[0]!
      const ch = store.song.channels[0]!.id
      store.toggleStep(sec.id, ch, 3)
      const copy = store.duplicateSection(sec.id)
      expect(copy?.name).toBe('A copy')
      expect(copy?.steps[ch]).toEqual([3])
      expect(copy?.id).not.toBe(sec.id)
      store.toggleStep(sec.id, ch, 3)
      expect(copy?.steps[ch]).toEqual([3])
      expect(store.duplicateSection('nope')).toBeNull()
    })

    it('removes and moves sections', () => {
      const store = useSongStore()
      const a = store.song.sections[0]!.id
      const b = store.addSection({ name: 'B' }).id
      store.moveSection(b, -1)
      expect(store.song.sections.map((s) => s.id)).toEqual([b, a])
      store.moveSection(b, -1)
      expect(store.song.sections[0]!.id).toBe(b)
      store.removeSection(a)
      expect(store.song.sections.map((s) => s.id)).toEqual([b])
      store.removeSection('nope')
      expect(store.song.sections).toHaveLength(1)
    })

    it('clamps section edits and trims steps that no longer fit', () => {
      const store = useSongStore()
      const sec = store.song.sections[0]!
      const ch = store.song.channels[0]!.id
      store.toggleStep(sec.id, ch, 60)
      store.toggleStep(sec.id, ch, 2)
      store.updateSection(sec.id, { bars: 1, tempo: 9999 })
      expect(sec.bars).toBe(1)
      expect(sec.tempo).toBe(400)
      expect(sec.steps[ch]).toEqual([2])
      store.updateSection(sec.id, { tempo: Number.NaN, timeSignature: { beats: 0, unit: 4 } })
      expect(sec.tempo).toBeNull()
      expect(sec.timeSignature.beats).toBe(1)
      store.updateSection('nope', { bars: 2 })
    })

    it('resolves inherited tempos through the timeline', () => {
      const store = useSongStore()
      store.addSection({ tempo: null })
      store.addSection({ tempo: 90 })
      store.addSection({ tempo: null })
      expect(store.resolvedTempos).toEqual([120, 120, 90, 90])
      expect(store.timeline[3]!.tempo).toBe(90)
    })
  })

  describe('steps', () => {
    it('toggles and sets steps, dropping empty lists', () => {
      const store = useSongStore()
      const sec = store.song.sections[0]!
      const ch = store.song.channels[0]!.id
      store.toggleStep(sec.id, ch, 5)
      expect(sec.steps[ch]).toEqual([5])
      store.setStep(sec.id, ch, 1, true)
      expect(sec.steps[ch]).toEqual([1, 5])
      store.setStep(sec.id, ch, 5, false)
      store.toggleStep(sec.id, ch, 1)
      expect(sec.steps[ch]).toBeUndefined()
    })

    it('ignores out-of-range steps and unknown ids', () => {
      const store = useSongStore()
      const sec = store.song.sections[0]!
      const ch = store.song.channels[0]!.id
      const before = store.revision
      store.toggleStep(sec.id, ch, 64)
      store.toggleStep(sec.id, ch, -1)
      store.toggleStep('nope', ch, 0)
      store.toggleStep(sec.id, 'nope', 0)
      store.setStep(sec.id, ch, 64, true)
      store.setStep('nope', ch, 0, true)
      expect(sec.steps).toEqual({})
      expect(store.revision).toBe(before)
    })

    it('clears a section and a channel', () => {
      const store = useSongStore()
      const sec = store.song.sections[0]!
      const [a, b] = store.song.channels.map((c) => c.id)
      store.toggleStep(sec.id, a!, 0)
      store.toggleStep(sec.id, b!, 0)
      store.clearChannel(a!)
      expect(sec.steps).toEqual({ [b!]: [0] })
      store.clearSection(sec.id)
      expect(sec.steps).toEqual({})
      store.clearSection('nope')
    })
  })

  describe('settings and whole-song operations', () => {
    it('normalises settings patches', () => {
      const store = useSongStore()
      store.updateSettings({ midiChannel: 20, velocity: 50 })
      expect(store.song.settings.midiChannel).toBe(16)
      expect(store.song.settings.velocity).toBe(50)
    })

    it('renames, exports and imports', () => {
      const store = useSongStore()
      store.rename('Export me')
      const json = store.exportJson()
      store.newSong()
      expect(store.song.name).toBe('Untitled')
      store.importJson(json)
      expect(store.song.name).toBe('Export me')
      expect(() => store.importJson('nope')).toThrow()
    })

    it('loads and normalises a song object', () => {
      const store = useSongStore()
      const s = createSong('Loaded')
      s.settings.velocity = 999
      store.loadSong(s)
      expect(store.song.name).toBe('Loaded')
      expect(store.song.settings.velocity).toBe(127)
    })
  })

  describe('persistence', () => {
    it('autosaves to localStorage after a debounce', async () => {
      vi.useFakeTimers()
      const store = useSongStore()
      store.rename('Saved')
      await vi.advanceTimersByTimeAsync(300)
      const raw = localStorage.getItem(STORAGE_KEY)
      expect(raw).toContain('"Saved"')
    })

    it('flushes a pending autosave on pagehide', async () => {
      vi.useFakeTimers()
      const store = useSongStore()
      store.rename('Flushed')
      await nextTick()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      window.dispatchEvent(new Event('pagehide'))
      expect(localStorage.getItem(STORAGE_KEY)).toContain('"Flushed"')
      window.dispatchEvent(new Event('pagehide'))
      store.save()
    })

    it('loads the autosaved song and falls back when corrupt', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...createSong('From storage') }))
      expect(loadInitialSong(localStorage).name).toBe('From storage')
      localStorage.setItem(STORAGE_KEY, '{broken')
      expect(loadInitialSong(localStorage).name).toBe('Untitled')
      expect(loadInitialSong(null).name).toBe('Untitled')
    })
  })
})
