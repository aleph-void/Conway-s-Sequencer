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
import { normalizeSong, parseSong, serializeSong } from '../core/serialization'
import {
  MAX_BARS,
  MAX_CHANNELS,
  MAX_TEMPO,
  MIN_BARS,
  MIN_TEMPO,
  clamp,
  clampStepsToLength,
  createChannel,
  createSection,
  createSong,
  generateId,
  nextFreeOutput,
  stepCount,
  withStepSet,
  withStepToggled,
  type Channel,
  type Section,
  type Song,
  type SongSettings,
} from '../core/song'
import { buildTimeline, resolveTempos, totalDuration, totalSteps } from '../core/timing'

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
  const duration = computed(() => totalDuration(timeline.value))
  const stepTotal = computed(() => totalSteps(timeline.value))
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
    for (const section of song.value.sections) delete section.steps[id]
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
    const list = song.value.channels
    const from = list.findIndex((c) => c.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= list.length) return
    const [item] = list.splice(from, 1)
    list.splice(to, 0, item!)
    touch()
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
    touch()
  }

  function moveSection(id: string, delta: number) {
    const list = song.value.sections
    const from = list.findIndex((s) => s.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= list.length) return
    const [item] = list.splice(from, 1)
    list.splice(to, 0, item!)
    touch()
  }

  /** Move a section so that it ends up at `to` (clamped to the list); used by drag-and-drop reordering. */
  function moveSectionTo(id: string, to: number) {
    const list = song.value.sections
    const from = list.findIndex((s) => s.id === id)
    if (from < 0 || !Number.isFinite(to)) return
    const target = clamp(Math.round(to), 0, list.length - 1)
    if (target === from) return
    const [item] = list.splice(from, 1)
    list.splice(target, 0, item!)
    touch()
  }

  function updateSection(id: string, patch: Partial<Omit<Section, 'id' | 'steps'>>) {
    const section = sectionById(id)
    if (!section) return
    if (patch.tempo !== undefined && patch.tempo !== null) {
      patch.tempo = Number.isFinite(patch.tempo) ? clamp(patch.tempo, MIN_TEMPO, MAX_TEMPO) : null
    }
    if (patch.bars !== undefined) patch.bars = clamp(Math.round(patch.bars), MIN_BARS, MAX_BARS)
    if (patch.timeSignature) {
      patch.timeSignature = { ...patch.timeSignature, beats: clamp(Math.round(patch.timeSignature.beats), 1, 32) }
    }
    Object.assign(section, patch)
    section.steps = clampStepsToLength(section.steps, stepCount(section))
    touch()
  }

  // ---- steps ----------------------------------------------------------
  function toggleStep(sectionId: string, channelId: string, step: number) {
    const section = sectionById(sectionId)
    if (!section || !channelById(channelId)) return
    if (step < 0 || step >= stepCount(section)) return
    const next = withStepToggled(section.steps[channelId], step)
    if (next.length) section.steps[channelId] = next
    else delete section.steps[channelId]
    touch()
  }

  function setStep(sectionId: string, channelId: string, step: number, on: boolean) {
    const section = sectionById(sectionId)
    if (!section || !channelById(channelId)) return
    if (step < 0 || step >= stepCount(section)) return
    const next = withStepSet(section.steps[channelId], step, on)
    if (next.length) section.steps[channelId] = next
    else delete section.steps[channelId]
    touch()
  }

  function clearSection(sectionId: string) {
    const section = sectionById(sectionId)
    if (!section) return
    section.steps = {}
    touch()
  }

  function clearChannel(channelId: string) {
    for (const section of song.value.sections) delete section.steps[channelId]
    touch()
  }

  // ---- settings / whole-song --------------------------------------------
  function updateSettings(patch: Partial<SongSettings>) {
    const next = normalizeSong({ ...song.value, settings: { ...song.value.settings, ...patch } }).settings
    song.value.settings = next
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
    // Every GUI edit goes through an action that mutates `song`, so a deep
    // watch is enough to pick all of them up; debounce so a paint-drag across
    // many cells results in one write.
    watch(
      song,
      () => {
        saveState.value = 'pending'
        if (handle) clearTimeout(handle)
        handle = setTimeout(save, AUTOSAVE_DEBOUNCE_MS)
      },
      { deep: true },
    )
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
    duration,
    stepTotal,
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
    clearSection,
    clearChannel,
    updateSettings,
    rename,
    loadSong,
    newSong,
    selectSong,
    deleteSong,
    exportJson,
    importJson,
    save,
  }
})
