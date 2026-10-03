import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  LEGACY_SONG_KEY,
  loadLibrary,
  readSong,
  removeFromLibrary,
  saveToLibrary,
  sortEntries,
  writeIndex,
  type LibraryEntry,
  type LibraryIndex,
} from '../core/library'
import { deleteBars as takeBars, insertBars as putBars, readBars, type BarClip, type BarRange } from '../core/bars'
import { clearRange, divideRange, rangeDivisions, readBlock, writeBlock, type Block, type CellRange } from '../core/clipboard'
import { normalizeSong, parseSong, serializeSong } from '../core/serialization'
import {
  MAX_BARS,
  MAX_CHANNELS,
  MAX_SWING,
  MAX_TEMPO,
  MIN_BARS,
  MIN_DIVISION,
  MIN_SWING,
  MIN_TEMPO,
  clamp,
  clampStepsToLength,
  createChannel,
  createSection,
  createSong,
  generateId,
  nextFreeOutput,
  normalizeLoopRange,
  pruneDivisions,
  stepCount,
  totalBars,
  withDivisionSet,
  withStepSet,
  withStepToggled,
  type Channel,
  type LoopRange,
  type Section,
  type Song,
  type SongSettings,
} from '../core/song'
import { buildTimeline, loopRangeSeconds, resolveSwings, resolveTempos, totalDuration, totalSteps } from '../core/timing'

/** Delay between the last edit and the autosave write. */
export const AUTOSAVE_DEBOUNCE_MS = 250

/**
 * Where the autosave stands.
 * - `unavailable`: no storage in this environment, nothing is ever saved.
 * - `idle`: nothing has changed since the song was loaded.
 * - `pending`: an edit is waiting for the debounce to elapse.
 * - `saved`: the latest edit is in storage.
 * - `error`: the last write failed (quota exceeded or storage disabled).
 */
export type SaveState = 'unavailable' | 'idle' | 'pending' | 'saved' | 'error'

export const useSongStore = defineStore('song', () => {
  const storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage
  const loaded = loadLibrary(storage)
  const song = ref<Song>(loaded.song)
  /** Id of the open song in the library. */
  const currentId = ref(loaded.id)
  /** The library index; `library` is the view the Song browser lists. */
  const index = ref<LibraryIndex>(loaded.index)
  /** Bumped on every structural edit so the transport can recompile. */
  const revision = ref(0)
  const saveState = ref<SaveState>(storage ? 'idle' : 'unavailable')
  /** Epoch milliseconds of the last successful autosave in this session. */
  const lastSavedAt = ref<number | null>(null)

  /** Every song saved in this browser, most recently edited first. */
  const library = computed<LibraryEntry[]>(() => sortEntries(index.value.entries))

  const timeline = computed(() => buildTimeline(song.value))
  const resolvedTempos = computed(() => resolveTempos(song.value.sections))
  const resolvedSwings = computed(() => resolveSwings(song.value.sections))
  const duration = computed(() => totalDuration(timeline.value))
  const stepTotal = computed(() => totalSteps(timeline.value))
  const barTotal = computed(() => totalBars(song.value.sections))
  /** The loop points in seconds, or null when the whole song plays. */
  const loopSeconds = computed(() => loopRangeSeconds(timeline.value, song.value.settings.loopRange))
  const canAddChannel = computed(() => song.value.channels.length < MAX_CHANNELS)

  function touch() {
    revision.value += 1
  }

  function sectionById(id: string): Section | undefined {
    return song.value.sections.find((s) => s.id === id)
  }

  function channelById(id: string): Channel | undefined {
    return song.value.channels.find((c) => c.id === id)
  }

  /** The section a cell edit targets, or undefined when the section, channel or step does not exist. */
  function cellTarget(sectionId: string, channelId: string, step: number): Section | undefined {
    const section = sectionById(sectionId)
    if (!section || !channelById(channelId)) return undefined
    if (step < 0 || step >= stepCount(section)) return undefined
    return section
  }

  /** Move the item with `id` to index `to` (clamped). Returns whether anything moved; does not touch. */
  function moveItem<T extends { id: string }>(list: T[], id: string, to: number): boolean {
    const from = list.findIndex((item) => item.id === id)
    if (from < 0 || !Number.isFinite(to)) return false
    const target = clamp(Math.round(to), 0, list.length - 1)
    if (target === from) return false
    const [item] = list.splice(from, 1)
    list.splice(target, 0, item!)
    return true
  }

  /** Forget everything every section knows about a channel: its steps and their divisions. */
  function dropChannelData(channelId: string) {
    for (const section of song.value.sections) {
      delete section.steps[channelId]
      delete section.divisions[channelId]
    }
  }

  // ---- channels -------------------------------------------------------
  function addChannel(overrides: Partial<Omit<Channel, 'id'>> = {}): Channel | null {
    if (!canAddChannel.value) return null
    const output = overrides.output ?? nextFreeOutput(song.value.channels)
    if (output === null) return null
    const channel = createChannel(output, overrides)
    song.value.channels.push(channel)
    touch()
    return channel
  }

  function removeChannel(id: string) {
    const index = song.value.channels.findIndex((c) => c.id === id)
    if (index < 0) return
    song.value.channels.splice(index, 1)
    dropChannelData(id)
    touch()
  }

  function updateChannel(id: string, patch: Partial<Omit<Channel, 'id'>>) {
    const channel = channelById(id)
    if (!channel) return
    if (patch.output !== undefined) patch.output = clamp(Math.round(patch.output), 0, MAX_CHANNELS - 1)
    Object.assign(channel, patch)
    touch()
  }

  function moveChannel(id: string, delta: number) {
    if (moveBy(song.value.channels, id, delta)) touch()
  }

  /** Move an item by `delta` places, staying put when that would leave the list. */
  function moveBy<T extends { id: string }>(list: T[], id: string, delta: number): boolean {
    const from = list.findIndex((item) => item.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= list.length) return false
    return moveItem(list, id, to)
  }

  // ---- sections -------------------------------------------------------
  function addSection(overrides: Partial<Omit<Section, 'id'>> = {}, afterId?: string): Section {
    const sections = song.value.sections
    const after = afterId ? sections.findIndex((s) => s.id === afterId) : sections.length - 1
    const template = sections[after] ?? sections[sections.length - 1]
    const section = createSection({
      name: `Section ${sections.length + 1}`,
      timeSignature: template ? { ...template.timeSignature } : { beats: 4, unit: 4 },
      bars: template?.bars ?? 4,
      subdivision: template?.subdivision ?? 4,
      tempo: null,
      swing: null,
      ...overrides,
    })
    sections.splice(after + 1, 0, section)
    touch()
    return section
  }

  function duplicateSection(id: string): Section | null {
    const source = sectionById(id)
    if (!source) return null
    const copy = JSON.parse(JSON.stringify(source)) as Partial<Section>
    delete copy.id
    return addSection({ ...copy, name: `${source.name} copy` }, id)
  }

  function removeSection(id: string) {
    const index = song.value.sections.findIndex((s) => s.id === id)
    if (index < 0) return
    song.value.sections.splice(index, 1)
    clampLoopRange()
    touch()
  }

  function moveSection(id: string, delta: number) {
    if (moveBy(song.value.sections, id, delta)) touch()
  }

  /** Move a section so that it ends up at `to` (clamped to the list); used by drag-and-drop reordering. */
  function moveSectionTo(id: string, to: number) {
    if (moveItem(song.value.sections, id, to)) touch()
  }

  function updateSection(id: string, patch: Partial<Omit<Section, 'id' | 'steps'>>) {
    const section = sectionById(id)
    if (!section) return
    if (patch.tempo !== undefined && patch.tempo !== null) {
      patch.tempo = Number.isFinite(patch.tempo) ? clamp(patch.tempo, MIN_TEMPO, MAX_TEMPO) : null
    }
    if (patch.swing !== undefined && patch.swing !== null) {
      patch.swing = Number.isFinite(patch.swing) ? clamp(patch.swing, MIN_SWING, MAX_SWING) : null
    }
    if (patch.bars !== undefined) patch.bars = clamp(Math.round(patch.bars), MIN_BARS, MAX_BARS)
    if (patch.timeSignature) {
      patch.timeSignature = { ...patch.timeSignature, beats: clamp(Math.round(patch.timeSignature.beats), 1, 32) }
    }
    Object.assign(section, patch)
    section.steps = clampStepsToLength(section.steps, stepCount(section))
    section.divisions = pruneDivisions(section.divisions, section.steps)
    clampLoopRange()
    touch()
  }

  /** Keep the loop points inside the song after it has lost bars. */
  function clampLoopRange() {
    const settings = song.value.settings
    settings.loopRange = normalizeLoopRange(settings.loopRange, barTotal.value)
  }

  // ---- steps ----------------------------------------------------------
  function toggleStep(sectionId: string, channelId: string, step: number) {
    const section = cellTarget(sectionId, channelId, step)
    if (!section) return
    const next = withStepToggled(section.steps[channelId], step)
    if (next.length) section.steps[channelId] = next
    else delete section.steps[channelId]
    if (!next.includes(step)) section.divisions = withDivisionSet(section.divisions, channelId, step, MIN_DIVISION)
    touch()
  }

  function setStep(sectionId: string, channelId: string, step: number, on: boolean) {
    const section = cellTarget(sectionId, channelId, step)
    if (!section) return
    const next = withStepSet(section.steps[channelId], step, on)
    if (next.length) section.steps[channelId] = next
    else delete section.steps[channelId]
    if (!on) section.divisions = withDivisionSet(section.divisions, channelId, step, MIN_DIVISION)
    touch()
  }

  /**
   * Divide one step `division` ways (1 makes it a plain gate again; see `Section.divisions`),
   * turning it on first when it is off.
   */
  function setDivision(sectionId: string, channelId: string, step: number, division: number) {
    const section = cellTarget(sectionId, channelId, step)
    if (!section) return
    const next = withStepSet(section.steps[channelId], step, true)
    section.steps[channelId] = next
    section.divisions = withDivisionSet(section.divisions, channelId, step, division)
    touch()
  }

  function clearSection(sectionId: string) {
    const section = sectionById(sectionId)
    if (!section) return
    section.steps = {}
    section.divisions = {}
    touch()
  }

  function clearChannel(channelId: string) {
    dropChannelData(channelId)
    touch()
  }

  // ---- blocks (selection, clipboard) -------------------------------------
  /** Copy the gates inside a rectangle of cells out of the song; see `core/clipboard.ts`. */
  function copyBlock(range: CellRange): Block {
    return readBlock(song.value, timeline.value, range)
  }

  /**
   * Put a block down with its corner on channel `channelStart`, step `stepStart` (whole-song
   * step axis), replacing the cells it covers. Returns the range written, null for none.
   */
  function pasteBlock(block: Block, channelStart: number, stepStart: number): CellRange | null {
    const written = writeBlock(song.value, timeline.value, block, channelStart, stepStart)
    if (written) touch()
    return written
  }

  /** Clear every gate inside a rectangle of cells. Returns the range cleared, null for none. */
  function clearBlock(range: CellRange): CellRange | null {
    const cleared = clearRange(song.value, timeline.value, range)
    if (cleared) touch()
    return cleared
  }

  /**
   * Divide every gate inside a rectangle of cells `division` ways (cells that are off stay
   * off). Returns the range covered, null for none.
   */
  function divideBlock(range: CellRange, division: number): CellRange | null {
    const divided = divideRange(song.value, timeline.value, range, division)
    if (divided) touch()
    return divided
  }

  /** The distinct divisions of the gates inside a rectangle of cells, smallest first. */
  function blockDivisions(range: CellRange): number[] {
    return rangeDivisions(song.value, timeline.value, range)
  }

  // ---- bars (loop points, clipboard) -------------------------------------
  /** Lift the bars inside a range of the whole-song bar axis out of the song; see `core/bars.ts`. */
  function copyBars(range: BarRange): BarClip | null {
    return readBars(song.value, range)
  }

  /**
   * Take the bars inside a range out of the song, moving the later ones up. Loop points
   * that lay after them move up too; points that covered any of them are cleared (what
   * they pointed at is gone). Returns the range taken out, null for none.
   */
  function deleteBars(range: BarRange): BarRange | null {
    const removed = takeBars(song.value, range)
    if (!removed) return null
    const loop = song.value.settings.loopRange
    if (loop) {
      const gone = removed.end - removed.start
      if (loop.start >= removed.end) song.value.settings.loopRange = { start: loop.start - gone, end: loop.end - gone }
      else if (loop.end > removed.start) song.value.settings.loopRange = null
    }
    clampLoopRange()
    touch()
    return removed
  }

  /**
   * Put a run of bars into the song so that the first becomes bar `atBar`, pushing the
   * later ones along, and set the loop points to them so where they landed is visible.
   * Returns the range they occupy, null for none.
   */
  function insertBars(clip: BarClip, atBar: number): BarRange | null {
    const inserted = putBars(song.value, clip, atBar)
    if (!inserted) return null
    song.value.settings.loopRange = normalizeLoopRange(inserted, barTotal.value)
    touch()
    return inserted
  }

  // ---- settings / whole-song --------------------------------------------
  function updateSettings(patch: Partial<SongSettings>) {
    const next = normalizeSong({ ...song.value, settings: { ...song.value.settings, ...patch } }).settings
    song.value.settings = next
    touch()
  }

  // ---- loop points --------------------------------------------------------
  /**
   * Set the loop points to the bars from `start` up to but not including `end`, counted
   * across the whole song (reversed or out-of-range values are put right; an empty range
   * clears the points). Playback then stays inside them.
   */
  function setLoopRange(start: number, end: number) {
    song.value.settings.loopRange = normalizeLoopRange({ start, end }, barTotal.value)
    touch()
  }

  /** Loop a single bar. */
  function setLoopBar(bar: number) {
    setLoopRange(bar, bar + 1)
  }

  /** Stretch the loop points so they also cover `bar` (set them to that bar when there are none). */
  function extendLoopRange(bar: number) {
    const current: LoopRange | null = song.value.settings.loopRange
    if (!current) return setLoopBar(bar)
    setLoopRange(Math.min(current.start, bar), Math.max(current.end, bar + 1))
  }

  function clearLoopRange() {
    if (!song.value.settings.loopRange) return
    song.value.settings.loopRange = null
    touch()
  }

  function rename(name: string) {
    song.value.name = name
    touch()
  }

  /** Open `next` as a new song in the library, keeping the current one saved. */
  function loadSong(next: Song) {
    openNew(normalizeSong(next))
  }

  /** Start a fresh song as a new library entry, keeping the current one saved. */
  function newSong() {
    openNew(createSong())
  }

  function exportJson(): string {
    return serializeSong(song.value)
  }

  function importJson(json: string) {
    loadSong(parseSong(json))
  }

  // ---- library ----------------------------------------------------------
  function replaceSong(next: Song, id: string) {
    song.value = next
    currentId.value = id
    touch()
  }

  /** Make `next` the open song under a fresh id and write it straight away. */
  function openNew(next: Song) {
    flush()
    replaceSong(next, generateId('song'))
    writeNow()
  }

  /** Make an already-saved song the open one and record that in the index. */
  function openStored(id: string, next: Song) {
    replaceSong(next, id)
    index.value.currentId = id
    writeIndexSafely()
  }

  /**
   * Open a saved song from the library. Returns false when the song is gone
   * or unreadable, in which case its entry is dropped from the library.
   */
  function selectSong(id: string): boolean {
    if (id === currentId.value) return true
    if (!storage) return false
    const next = readSong(storage, id)
    if (!next) {
      forget(id)
      return false
    }
    flush()
    openStored(id, next)
    return true
  }

  /**
   * Copy a saved song into a new library entry named "<name> copy" and open
   * the copy, keeping the original saved. Copying the open song includes its
   * pending edits. Returns the copy's id, or null when the song is gone or
   * unreadable (its entry is then dropped from the library).
   */
  function duplicateSong(id: string): string | null {
    let source: Song | null
    if (id === currentId.value) {
      source = song.value
    } else {
      if (!storage) return null
      source = readSong(storage, id)
      if (!source) {
        forget(id)
        return null
      }
    }
    // Round-tripping through JSON gives a deep copy with nothing shared with the original.
    const copy = parseSong(serializeSong(source))
    copy.name = `${source.name.trim() || 'Untitled'} copy`
    openNew(copy)
    return currentId.value
  }

  /**
   * Delete a saved song from this browser. Deleting the open song opens the
   * most recently edited remaining one, or a fresh song when none is left;
   * its own pending edits are discarded rather than flushed.
   */
  function deleteSong(id: string) {
    if (!storage) return
    const wasCurrent = id === currentId.value
    if (wasCurrent) cancelPending()
    forget(id)
    if (!wasCurrent) return
    for (const entry of library.value) {
      const next = readSong(storage, entry.id)
      if (next) {
        openStored(entry.id, next)
        return
      }
    }
    replaceSong(createSong(), generateId('song'))
    writeNow()
  }

  function forget(id: string) {
    if (!storage) return
    try {
      removeFromLibrary(storage, index.value, id)
    } catch {
      saveState.value = 'error'
    }
  }

  function writeIndexSafely() {
    if (!storage) return
    try {
      writeIndex(storage, index.value)
    } catch {
      saveState.value = 'error'
    }
  }

  // ---- persistence ------------------------------------------------------
  let handle: ReturnType<typeof setTimeout> | null = null

  function cancelPending() {
    if (handle) clearTimeout(handle)
    handle = null
  }

  /**
   * Write the open song now, so switching songs never drops an edit, even one
   * made in the same tick (before the autosave watcher has seen it).
   */
  function flush() {
    if (storage) save()
  }

  /**
   * Write the open song and its library entry. Returns whether the content
   * changed (null when storage is unavailable or the write failed).
   */
  function writeNow(): boolean | null {
    if (!storage) return null
    try {
      return saveToLibrary(storage, index.value, currentId.value, song.value)
    } catch {
      // Quota exceeded or storage disabled: autosave is best-effort, but say so.
      saveState.value = 'error'
      return null
    }
  }

  /** Write the song to storage now, cancelling any pending debounced save. */
  function save() {
    if (!storage) return
    cancelPending()
    const changed = writeNow()
    if (changed === null) return
    if (changed) {
      saveState.value = 'saved'
      lastSavedAt.value = Date.now()
    } else {
      // Opening a song fires the watcher without changing anything on disk.
      saveState.value = 'idle'
    }
  }

  if (storage) {
    if (loaded.fresh) {
      // First visit, or a song migrated from the pre-library autosave: make it
      // the first library entry so the Song browser lists it.
      if (writeNow() !== null && loaded.migrated) storage.removeItem(LEGACY_SONG_KEY)
    } else if (loaded.indexChanged) {
      writeIndexSafely()
    }
    // Every edit goes through an action that bumps `revision` (`touch`), so watching that
    // one number picks all of them up without walking the whole song on each change;
    // debounce so a paint-drag across many cells results in one write.
    watch(revision, () => {
      saveState.value = 'pending'
      if (handle) clearTimeout(handle)
      handle = setTimeout(save, AUTOSAVE_DEBOUNCE_MS)
    })
    if (typeof window !== 'undefined') {
      // Flush a pending autosave when the tab is closed, reloaded or backgrounded.
      window.addEventListener('pagehide', () => {
        if (handle) save()
      })
    }
  }

  return {
    song,
    currentId,
    library,
    revision,
    saveState,
    lastSavedAt,
    timeline,
    resolvedTempos,
    resolvedSwings,
    duration,
    stepTotal,
    barTotal,
    loopSeconds,
    canAddChannel,
    sectionById,
    channelById,
    addChannel,
    removeChannel,
    updateChannel,
    moveChannel,
    addSection,
    duplicateSection,
    removeSection,
    moveSection,
    moveSectionTo,
    updateSection,
    toggleStep,
    setStep,
    setDivision,
    clearSection,
    clearChannel,
    copyBlock,
    pasteBlock,
    clearBlock,
    divideBlock,
    blockDivisions,
    copyBars,
    deleteBars,
    insertBars,
    updateSettings,
    setLoopRange,
    setLoopBar,
    extendLoopRange,
    clearLoopRange,
    rename,
    loadSong,
    newSong,
    selectSong,
    duplicateSong,
    deleteSong,
    exportJson,
    importJson,
    save,
  }
})
