import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { LEGACY_SONG_KEY, LIBRARY_KEY, readIndex, songKey } from '../core/library'
import { MAX_CHANNELS, createSong } from '../core/song'
import { AUTOSAVE_DEBOUNCE_MS, useSongStore } from './song'

/** The open song's JSON as stored, or null. */
function storedSong(store: ReturnType<typeof useSongStore>): string | null {
  return localStorage.getItem(songKey(store.currentId))
}

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

  describe('blocks', () => {
    it('copies, pastes and clears rectangles of cells and bumps the revision', () => {
      const store = useSongStore()
      const section = store.song.sections[0]!
      const [c0, c1] = store.song.channels
      store.setStep(section.id, c0!.id, 1, true)
      store.setStep(section.id, c1!.id, 0, true)
      const range = { channelStart: 0, channelEnd: 2, stepStart: 0, stepEnd: 2 }
      const block = store.copyBlock(range)
      expect(block).toEqual({ channels: 2, steps: 2, rows: [[1], [0]], divisions: [{}, {}] })

      const before = store.revision
      expect(store.pasteBlock(block, 0, 8)).toEqual({ channelStart: 0, channelEnd: 2, stepStart: 8, stepEnd: 10 })
      expect(store.revision).toBe(before + 1)
      expect(section.steps[c0!.id]).toEqual([1, 9])
      expect(section.steps[c1!.id]).toEqual([0, 8])

      expect(store.clearBlock(range)).toEqual(range)
      expect(store.revision).toBe(before + 2)
      expect(section.steps[c0!.id]).toEqual([9])
      expect(section.steps[c1!.id]).toEqual([8])

      // Nothing to write leaves the revision alone.
      expect(store.pasteBlock(block, 0, 64)).toBeNull()
      expect(store.clearBlock({ channelStart: 9, channelEnd: 10, stepStart: 0, stepEnd: 1 })).toBeNull()
      expect(store.revision).toBe(before + 2)
    })
  })

  describe('divided steps', () => {
    it('divides a step, turning it on first, and drops the division when the step goes off', () => {
      const store = useSongStore()
      const section = store.song.sections[0]!
      const c0 = store.song.channels[0]!.id
      const before = store.revision
      store.setDivision(section.id, c0, 4, 3)
      expect(section.steps[c0]).toEqual([4])
      expect(section.divisions).toEqual({ [c0]: { 4: 3 } })
      expect(store.revision).toBe(before + 1)

      store.setDivision(section.id, c0, 4, 1)
      expect(section.steps[c0]).toEqual([4])
      expect(section.divisions).toEqual({})

      store.setDivision(section.id, c0, 4, 8)
      store.toggleStep(section.id, c0, 4)
      expect(section.steps[c0]).toBeUndefined()
      expect(section.divisions).toEqual({})

      store.setDivision(section.id, c0, 5, 2)
      store.setStep(section.id, c0, 5, false)
      expect(section.divisions).toEqual({})

      // Out of range or unknown: nothing happens.
      store.setDivision(section.id, c0, 64, 2)
      store.setDivision(section.id, 'nobody', 0, 2)
      store.setDivision('nowhere', c0, 0, 2)
      expect(section.divisions).toEqual({})
    })

    it('loses divisions with the steps, channels and sections they belong to', () => {
      const store = useSongStore()
      const section = store.song.sections[0]!
      const [c0, c1] = store.song.channels
      store.setDivision(section.id, c0!.id, 2, 2)
      store.setDivision(section.id, c0!.id, 40, 3)
      store.setDivision(section.id, c1!.id, 3, 4)

      store.updateSection(section.id, { bars: 2 })
      expect(section.divisions).toEqual({ [c0!.id]: { 2: 2 }, [c1!.id]: { 3: 4 } })
      store.clearChannel(c1!.id)
      expect(section.divisions).toEqual({ [c0!.id]: { 2: 2 } })
      store.setDivision(section.id, c1!.id, 3, 4)
      store.removeChannel(c1!.id)
      expect(section.divisions).toEqual({ [c0!.id]: { 2: 2 } })
      store.clearSection(section.id)
      expect(section.divisions).toEqual({})
    })

    it('divides the gates of a block, leaves its empty cells alone, and reports what it holds', () => {
      const store = useSongStore()
      const section = store.song.sections[0]!
      const [c0, c1] = store.song.channels
      store.setStep(section.id, c0!.id, 1, true)
      store.setStep(section.id, c1!.id, 0, true)
      store.setStep(section.id, c1!.id, 5, true) // outside the block
      const range = { channelStart: 0, channelEnd: 2, stepStart: 0, stepEnd: 3 }
      expect(store.blockDivisions(range)).toEqual([1])

      const before = store.revision
      expect(store.divideBlock(range, 3)).toEqual(range)
      expect(store.revision).toBe(before + 1)
      expect(section.steps[c0!.id]).toEqual([1])
      expect(section.steps[c1!.id]).toEqual([0, 5])
      expect(section.divisions).toEqual({ [c0!.id]: { 1: 3 }, [c1!.id]: { 0: 3 } })
      expect(store.blockDivisions(range)).toEqual([3])

      store.setDivision(section.id, c0!.id, 1, 2)
      expect(store.blockDivisions(range)).toEqual([2, 3])
      expect(store.blockDivisions({ channelStart: 0, channelEnd: 2, stepStart: 2, stepEnd: 3 })).toEqual([])
      expect(store.divideBlock({ channelStart: 9, channelEnd: 10, stepStart: 0, stepEnd: 1 }, 2)).toBeNull()

      // Copying carries the divisions, pasting puts them down, clearing drops them.
      const block = store.copyBlock(range)
      expect(block.divisions).toEqual([{ 1: 2 }, { 0: 3 }])
      store.pasteBlock(block, 0, 8)
      expect(section.divisions[c0!.id]).toEqual({ 1: 2, 9: 2 })
      expect(section.divisions[c1!.id]).toEqual({ 0: 3, 8: 3 })
      store.clearBlock(range)
      expect(section.divisions).toEqual({ [c0!.id]: { 9: 2 }, [c1!.id]: { 8: 3 } })
    })
  })

  describe('channels', () => {
    it('adds channels on the next free output up to 62', () => {
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
      expect(store.channelById(id)).toMatchObject({ name: 'Kick', output: 61, muted: true })
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

    it('moves a section to an absolute index, clamping out-of-range targets', () => {
      const store = useSongStore()
      const a = store.song.sections[0]!.id
      const b = store.addSection({ name: 'B' }).id
      const c = store.addSection({ name: 'C' }).id
      const d = store.addSection({ name: 'D' }).id
      const order = () => store.song.sections.map((s) => s.id)
      const before = store.revision

      store.moveSectionTo(a, 2)
      expect(order()).toEqual([b, c, a, d])
      store.moveSectionTo(d, 0)
      expect(order()).toEqual([d, b, c, a])
      store.moveSectionTo(b, 99)
      expect(order()).toEqual([d, c, a, b])
      store.moveSectionTo(c, -5)
      expect(order()).toEqual([c, d, a, b])
      expect(store.revision).toBe(before + 4)

      // No-ops never bump the revision.
      store.moveSectionTo(c, 0)
      store.moveSectionTo(c, Number.NaN)
      store.moveSectionTo('nope', 1)
      expect(order()).toEqual([c, d, a, b])
      expect(store.revision).toBe(before + 4)
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

    it('clamps swing, inherits it when cleared and resolves it through the timeline', () => {
      const store = useSongStore()
      const first = store.song.sections[0]!
      const second = store.addSection()
      expect(second.swing).toBeNull()
      store.updateSection(first.id, { swing: 99 })
      expect(first.swing).toBe(75)
      expect(store.resolvedSwings).toEqual([75, 75])
      expect(store.timeline.map((t) => t.swing)).toEqual([75, 75])
      store.updateSection(second.id, { swing: 10 })
      expect(second.swing).toBe(50)
      store.updateSection(first.id, { swing: Number.NaN })
      expect(first.swing).toBeNull()
      store.updateSection(second.id, { swing: null })
      expect(store.resolvedSwings).toEqual([50, 50])
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

  describe('loop points', () => {
    it('sets, normalises and clears the loop points', () => {
      const store = useSongStore()
      expect(store.barTotal).toBe(4)
      expect(store.loopSeconds).toBeNull()
      const before = store.revision
      store.setLoopRange(1, 3)
      expect(store.song.settings.loopRange).toEqual({ start: 1, end: 3 })
      expect(store.loopSeconds).toEqual({ start: 2, end: 6 })
      expect(store.revision).toBe(before + 1)
      // Reversed or oversized ranges are put right; an empty one clears the points.
      store.setLoopRange(3, 1)
      expect(store.song.settings.loopRange).toEqual({ start: 1, end: 3 })
      store.setLoopRange(2, 99)
      expect(store.song.settings.loopRange).toEqual({ start: 2, end: 4 })
      store.setLoopRange(2, 2)
      expect(store.song.settings.loopRange).toBeNull()
      store.setLoopBar(3)
      expect(store.song.settings.loopRange).toEqual({ start: 3, end: 4 })
      const revision = store.revision
      store.clearLoopRange()
      expect(store.song.settings.loopRange).toBeNull()
      expect(store.revision).toBe(revision + 1)
      store.clearLoopRange() // nothing to clear: not an edit
      expect(store.revision).toBe(revision + 1)
    })

    it('extends the loop points to cover another bar', () => {
      const store = useSongStore()
      store.extendLoopRange(2) // nothing set yet: just that bar
      expect(store.song.settings.loopRange).toEqual({ start: 2, end: 3 })
      store.extendLoopRange(0)
      expect(store.song.settings.loopRange).toEqual({ start: 0, end: 3 })
      store.extendLoopRange(3)
      expect(store.song.settings.loopRange).toEqual({ start: 0, end: 4 })
      store.extendLoopRange(1) // already inside: unchanged
      expect(store.song.settings.loopRange).toEqual({ start: 0, end: 4 })
    })

    it('normalises loop points set through updateSettings', () => {
      const store = useSongStore()
      store.updateSettings({ loopRange: { start: 3, end: 10 } })
      expect(store.song.settings.loopRange).toEqual({ start: 3, end: 4 })
      store.updateSettings({ loopRange: null })
      expect(store.song.settings.loopRange).toBeNull()
    })

    it('keeps the loop points inside the song when it loses bars', () => {
      const store = useSongStore()
      const second = store.addSection({ bars: 2 })
      expect(store.barTotal).toBe(6)
      store.setLoopRange(3, 6)
      store.updateSection(second.id, { bars: 1 })
      expect(store.song.settings.loopRange).toEqual({ start: 3, end: 5 })
      store.removeSection(second.id)
      expect(store.song.settings.loopRange).toEqual({ start: 3, end: 4 })
      store.updateSection(store.song.sections[0]!.id, { bars: 2 })
      expect(store.song.settings.loopRange).toBeNull()
    })

    it('counts bars across sections for the loop points', () => {
      const store = useSongStore()
      store.addSection({ bars: 2, tempo: 60 }) // 4 s per bar
      store.setLoopRange(4, 6)
      expect(store.loopSeconds).toEqual({ start: 8, end: 16 })
    })
  })

  describe('library', () => {
    it('lists the open song as the only entry on a first visit', () => {
      const store = useSongStore()
      expect(store.library).toHaveLength(1)
      expect(store.library[0]).toMatchObject({ id: store.currentId, name: 'Untitled', channels: 8, sections: 1 })
      expect(readIndex(localStorage).currentId).toBe(store.currentId)
      expect(storedSong(store)).toContain('"Untitled"')
    })

    it('adds new, imported and loaded songs as entries and keeps the old one', async () => {
      vi.useFakeTimers()
      const store = useSongStore()
      store.rename('First')
      const firstId = store.currentId
      store.newSong()
      expect(store.currentId).not.toBe(firstId)
      // The pending autosave of "First" is flushed before switching.
      expect(localStorage.getItem(songKey(firstId))).toContain('"First"')
      store.importJson(JSON.stringify(createSong('Imported')))
      store.loadSong(createSong('Loaded'))
      expect(store.library.map((e) => e.name)).toEqual(['Loaded', 'Imported', 'Untitled', 'First'])
      expect(storedSong(store)).toContain('"Loaded"')
      // Opening a song is not an edit: the autosave that follows leaves it idle.
      await vi.advanceTimersByTimeAsync(300)
      expect(store.saveState).toBe('idle')
    })

    it('selects a saved song, flushing the pending edit of the current one', async () => {
      vi.useFakeTimers()
      const store = useSongStore()
      store.rename('A')
      const a = store.currentId
      const sectionId = store.song.sections[0]!.id
      const channelId = store.song.channels[0]!.id
      store.toggleStep(sectionId, channelId, 2)
      await vi.advanceTimersByTimeAsync(300)
      store.newSong()
      store.rename('B')
      const b = store.currentId
      await nextTick()
      expect(store.selectSong(a)).toBe(true)
      expect(store.song.name).toBe('A')
      expect(store.song.sections[0]!.steps[channelId]).toEqual([2])
      expect(store.currentId).toBe(a)
      expect(readIndex(localStorage).currentId).toBe(a)
      expect(localStorage.getItem(songKey(b))).toContain('"B"')
      expect(store.library.map((e) => e.name)).toEqual(['B', 'A'])
      expect(store.selectSong(a)).toBe(true)
      const before = store.revision
      expect(store.selectSong('nope')).toBe(false)
      expect(store.revision).toBe(before)
    })

    it('drops an entry whose song is missing when it is selected', () => {
      const store = useSongStore()
      store.rename('A')
      const a = store.currentId
      store.newSong()
      localStorage.removeItem(songKey(a))
      expect(store.selectSong(a)).toBe(false)
      expect(store.library.map((e) => e.id)).toEqual([store.currentId])
      expect(readIndex(localStorage).entries.map((e) => e.id)).toEqual([store.currentId])
    })

    it('duplicates a song into a new entry named after it and opens the copy', async () => {
      vi.useFakeTimers()
      const store = useSongStore()
      store.rename('A')
      const a = store.currentId
      const sectionId = store.song.sections[0]!.id
      const channelId = store.song.channels[0]!.id
      store.toggleStep(sectionId, channelId, 3)

      // The open song's pending edit is both flushed to it and part of the copy.
      const copyId = store.duplicateSong(a)
      expect(copyId).toBe(store.currentId)
      expect(copyId).not.toBe(a)
      expect(store.song.name).toBe('A copy')
      expect(store.song.sections[0]!.steps[channelId]).toEqual([3])
      expect(store.library.map((e) => e.name)).toEqual(['A copy', 'A'])
      expect(localStorage.getItem(songKey(a))).toContain('"A"')
      expect(storedSong(store)).toContain('"A copy"')
      await vi.advanceTimersByTimeAsync(300)
      expect(store.saveState).toBe('idle')

      // The copy shares nothing with the original.
      store.toggleStep(sectionId, channelId, 5)
      expect(store.selectSong(a)).toBe(true)
      expect(store.song.sections[0]!.steps[channelId]).toEqual([3])

      // A song that is not open is copied from storage.
      expect(store.duplicateSong(copyId!)).toBe(store.currentId)
      expect(store.song.name).toBe('A copy copy')
      expect(store.song.sections[0]!.steps[channelId]).toEqual([3, 5])
      expect(store.library).toHaveLength(3)

      // A blank name copies as Untitled.
      store.rename('   ')
      store.duplicateSong(store.currentId)
      expect(store.song.name).toBe('Untitled copy')

      // A song that vanished is dropped from the library and nothing opens.
      localStorage.removeItem(songKey(a))
      const before = store.currentId
      expect(store.duplicateSong(a)).toBeNull()
      expect(store.currentId).toBe(before)
      expect(store.library.map((e) => e.id)).not.toContain(a)
      expect(store.library).toHaveLength(3)
    })

    it('deletes songs, opening the most recent remaining one or a fresh song', async () => {
      vi.useFakeTimers()
      const store = useSongStore()
      store.rename('A')
      const a = store.currentId
      await vi.advanceTimersByTimeAsync(300)
      store.newSong()
      store.rename('B')
      const b = store.currentId
      await vi.advanceTimersByTimeAsync(300)
      store.newSong()
      store.rename('C')
      const c = store.currentId
      await vi.advanceTimersByTimeAsync(300)

      store.deleteSong(b)
      expect(store.currentId).toBe(c)
      expect(localStorage.getItem(songKey(b))).toBeNull()
      expect(store.library.map((e) => e.name)).toEqual(['C', 'A'])

      store.rename('C edited')
      store.deleteSong(c)
      await vi.advanceTimersByTimeAsync(300)
      expect(store.currentId).toBe(a)
      expect(store.song.name).toBe('A')
      expect(localStorage.getItem(songKey(c))).toBeNull()
      expect(store.library.map((e) => e.name)).toEqual(['A'])

      store.deleteSong(a)
      expect(store.currentId).not.toBe(a)
      expect(store.song.name).toBe('Untitled')
      expect(store.library.map((e) => e.name)).toEqual(['Untitled'])
      expect(storedSong(store)).toContain('"Untitled"')
      store.deleteSong('nope')
      expect(store.library).toHaveLength(1)
    })

    it('migrates the pre-library autosave into the first entry', () => {
      localStorage.setItem(LEGACY_SONG_KEY, JSON.stringify(createSong('From storage')))
      const store = useSongStore()
      expect(store.song.name).toBe('From storage')
      expect(store.library.map((e) => e.name)).toEqual(['From storage'])
      expect(storedSong(store)).toContain('"From storage"')
      expect(localStorage.getItem(LEGACY_SONG_KEY)).toBeNull()
    })

    it('keeps the pre-library autosave when its first write fails', () => {
      localStorage.setItem(LEGACY_SONG_KEY, JSON.stringify(createSong('Stuck')))
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      const store = useSongStore()
      expect(store.song.name).toBe('Stuck')
      expect(store.saveState).toBe('error')
      expect(localStorage.getItem(LEGACY_SONG_KEY)).toContain('"Stuck"')
      setItem.mockRestore()
    })

    it('reopens the last open song, or the most recent one when that is gone', () => {
      let store = useSongStore()
      store.rename('A')
      store.save()
      const a = store.currentId
      store.newSong()
      store.rename('B')
      store.save()
      const b = store.currentId
      store.selectSong(a)

      setActivePinia(createPinia())
      store = useSongStore()
      expect(store.currentId).toBe(a)
      expect(store.song.name).toBe('A')

      localStorage.removeItem(songKey(a))
      setActivePinia(createPinia())
      store = useSongStore()
      expect(store.currentId).toBe(b)
      expect(store.song.name).toBe('B')
      expect(readIndex(localStorage).currentId).toBe(b)
    })

    it('starts fresh when the index is corrupt', () => {
      localStorage.setItem(LIBRARY_KEY, '{broken')
      const store = useSongStore()
      expect(store.song.name).toBe('Untitled')
      expect(store.library).toHaveLength(1)
    })

    it('reports storage errors from library writes', () => {
      const store = useSongStore()
      store.rename('A')
      store.save()
      const a = store.currentId
      store.newSong()
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      store.selectSong(a)
      expect(store.song.name).toBe('A')
      expect(store.saveState).toBe('error')
      store.deleteSong(a)
      expect(store.saveState).toBe('error')
      setItem.mockRestore()
    })

    it('works in memory only when storage is unavailable', () => {
      vi.stubGlobal('localStorage', undefined)
      const store = useSongStore()
      expect(store.saveState).toBe('unavailable')
      expect(store.library).toEqual([])
      store.rename('Nowhere')
      store.save()
      expect(store.duplicateSong('x')).toBeNull()
      expect(store.duplicateSong(store.currentId)).toBe(store.currentId)
      expect(store.song.name).toBe('Nowhere copy')
      store.newSong()
      expect(store.library).toEqual([])
      expect(store.selectSong('x')).toBe(false)
      store.deleteSong(store.currentId)
      expect(store.song.name).toBe('Untitled')
      vi.unstubAllGlobals()
    })
  })

  describe('persistence', () => {
    it('autosaves to localStorage after a debounce', async () => {
      vi.useFakeTimers()
      const store = useSongStore()
      store.rename('Saved')
      await vi.advanceTimersByTimeAsync(300)
      expect(storedSong(store)).toContain('"Saved"')
      expect(store.library[0]!.name).toBe('Saved')
    })

    it('flushes a pending autosave on pagehide', async () => {
      vi.useFakeTimers()
      const store = useSongStore()
      store.rename('Flushed')
      await nextTick()
      expect(storedSong(store)).not.toContain('"Flushed"')
      window.dispatchEvent(new Event('pagehide'))
      expect(storedSong(store)).toContain('"Flushed"')
      window.dispatchEvent(new Event('pagehide'))
      store.save()
    })

    it('reports pending, then saved with a timestamp, after a GUI edit', async () => {
      vi.useFakeTimers()
      const start = new Date('2026-10-01T12:34:56Z').getTime()
      vi.setSystemTime(start)
      const store = useSongStore()
      expect(store.saveState).toBe('idle')
      expect(store.lastSavedAt).toBeNull()
      const sectionId = store.song.sections[0]!.id
      const channelId = store.song.channels[0]!.id
      store.toggleStep(sectionId, channelId, 3)
      await nextTick()
      expect(store.saveState).toBe('pending')
      // Further edits inside the debounce window keep it pending and write once.
      store.toggleStep(sectionId, channelId, 4)
      await vi.advanceTimersByTimeAsync(100)
      expect(store.saveState).toBe('pending')
      expect(JSON.parse(storedSong(store)!).sections[0].steps).toEqual({})
      await vi.advanceTimersByTimeAsync(300)
      expect(store.saveState).toBe('saved')
      // The write lands one debounce after the last edit; fake timers advance the clock with it.
      expect(store.lastSavedAt).toBe(start + AUTOSAVE_DEBOUNCE_MS)
      expect(JSON.parse(storedSong(store)!).sections[0].steps[channelId]).toEqual([3, 4])
      expect(store.library[0]!.updatedAt).toBe(start + AUTOSAVE_DEBOUNCE_MS)
    })

    it('reports an error when storage rejects the write', async () => {
      vi.useFakeTimers()
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      const store = useSongStore()
      store.rename('Too big')
      await vi.advanceTimersByTimeAsync(300)
      expect(store.saveState).toBe('error')
      expect(store.lastSavedAt).toBeNull()
      setItem.mockRestore()
      store.rename('Fits now')
      await vi.advanceTimersByTimeAsync(300)
      expect(store.saveState).toBe('saved')
      expect(storedSong(store)).toContain('"Fits now"')
    })
  })
})
