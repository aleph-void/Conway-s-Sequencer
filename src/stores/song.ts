import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
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

export const STORAGE_KEY = 'conways-sequencer:song'
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

/** Load the autosaved song, or a fresh one if nothing valid is stored. */
export function loadInitialSong(storage: Pick<Storage, 'getItem'> | null): Song {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (raw) return parseSong(raw)
  } catch {
    // Corrupt autosave; fall through to a fresh song.
  }
  return createSong()
}

export const useSongStore = defineStore('song', () => {
  const storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage
  const song = ref<Song>(loadInitialSong(storage))
  /** Bumped on every structural edit so the transport can recompile. */
  const revision = ref(0)
  const saveState = ref<SaveState>(storage ? 'idle' : 'unavailable')
  /** Epoch milliseconds of the last successful autosave in this session. */
  const lastSavedAt = ref<number | null>(null)

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

  function loadSong(next: Song) {
    song.value = normalizeSong(next)
    touch()
  }

  function newSong() {
    song.value = createSong()
    touch()
  }

  function exportJson(): string {
    return serializeSong(song.value)
  }

  function importJson(json: string) {
    loadSong(parseSong(json))
  }

  // ---- persistence ------------------------------------------------------
  let handle: ReturnType<typeof setTimeout> | null = null
  /** Write the song to storage now, cancelling any pending debounced save. */
  function save() {
    if (!storage) return
    if (handle) clearTimeout(handle)
    handle = null
    try {
      storage.setItem(STORAGE_KEY, serializeSong(song.value))
      saveState.value = 'saved'
      lastSavedAt.value = Date.now()
    } catch {
      // Quota exceeded or storage disabled: autosave is best-effort, but say so.
      saveState.value = 'error'
    }
  }
  if (storage) {
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
    updateSection,
    toggleStep,
    setStep,
    clearSection,
    clearChannel,
    updateSettings,
    rename,
    loadSong,
    newSong,
    exportJson,
    importJson,
    save,
  }
})
