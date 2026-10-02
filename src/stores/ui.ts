import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const UI_STORAGE_KEY = 'conways-sequencer:ui'

/**
 * Which way time runs along a channel's track in the grid. `ltr` and `rtl` keep one row per
 * channel with the steps running away from the channel header; `ttb` and `btt` turn every
 * channel into a column with its header at the top or the bottom.
 */
export type TrackOrientation = 'ltr' | 'rtl' | 'ttb' | 'btt'

export const TRACK_ORIENTATIONS: ReadonlyArray<{ value: TrackOrientation; label: string }> = [
  { value: 'ltr', label: 'Left to right' },
  { value: 'rtl', label: 'Right to left' },
  { value: 'ttb', label: 'Top to bottom' },
  { value: 'btt', label: 'Bottom to top' },
]

export const DEFAULT_TRACK_ORIENTATION: TrackOrientation = 'ltr'

export function isTrackOrientation(value: unknown): value is TrackOrientation {
  return TRACK_ORIENTATIONS.some((o) => o.value === value)
}

/** Whether channels are columns (time runs up or down) rather than rows. */
export function isVerticalOrientation(orientation: TrackOrientation): boolean {
  return orientation === 'ttb' || orientation === 'btt'
}

interface UiState {
  settingsOpen: boolean
  moduleViewOpen: boolean
  trackOrientation: TrackOrientation
}

/** Matches the phone breakpoint in `style.css`; wider screens start with the drawer open. */
export const PHONE_MEDIA_QUERY = '(max-width: 767px)'

/**
 * The drawer is open on desktops and tablets, where it shares the viewport with the grid, and
 * closed on phones, where it would push the grid below the fold until the user asks for it.
 * The module view is a debugging aid, so it starts hidden everywhere. Tracks run left to
 * right, as on a piano roll, until the user picks another orientation.
 */
function defaults(): UiState {
  const phone =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_MEDIA_QUERY).matches
  return { settingsOpen: !phone, moduleViewOpen: false, trackOrientation: DEFAULT_TRACK_ORIENTATION }
}

function readStored(): UiState {
  const fallback = defaults()
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<UiState>
    return {
      settingsOpen: typeof parsed.settingsOpen === 'boolean' ? parsed.settingsOpen : fallback.settingsOpen,
      moduleViewOpen: typeof parsed.moduleViewOpen === 'boolean' ? parsed.moduleViewOpen : fallback.moduleViewOpen,
      trackOrientation: isTrackOrientation(parsed.trackOrientation)
        ? parsed.trackOrientation
        : fallback.trackOrientation,
    }
  } catch {
    return fallback
  }
}

/**
 * Layout preferences that are not part of the song: whether the settings drawer (sections,
 * module settings, song file I/O) is open, whether the module view (a live picture of the
 * module's outputs) is shown, and which way the channel tracks run in the grid. Persisted
 * so the editor comes back the way it was left, whichever song is open.
 */
export const useUiStore = defineStore('ui', () => {
  const stored = readStored()
  const settingsOpen = ref(stored.settingsOpen)
  const moduleViewOpen = ref(stored.moduleViewOpen)
  const trackOrientation = ref<TrackOrientation>(stored.trackOrientation)

  function toggleSettings() {
    settingsOpen.value = !settingsOpen.value
  }

  function setSettingsOpen(open: boolean) {
    settingsOpen.value = open
  }

  function toggleModuleView() {
    moduleViewOpen.value = !moduleViewOpen.value
  }

  function setModuleViewOpen(open: boolean) {
    moduleViewOpen.value = open
  }

  /** An unknown value (say, from a stale select) leaves the orientation as it is. */
  function setTrackOrientation(orientation: TrackOrientation | string) {
    if (isTrackOrientation(orientation)) trackOrientation.value = orientation
  }

  watch([settingsOpen, moduleViewOpen, trackOrientation], ([settings, moduleView, orientation]) => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(
        UI_STORAGE_KEY,
        JSON.stringify({ settingsOpen: settings, moduleViewOpen: moduleView, trackOrientation: orientation }),
      )
    } catch {
      /* storage can be full or disabled; the preference is a convenience only */
    }
  })

  return {
    settingsOpen,
    moduleViewOpen,
    trackOrientation,
    toggleSettings,
    setSettingsOpen,
    toggleModuleView,
    setModuleViewOpen,
    setTrackOrientation,
  }
})
