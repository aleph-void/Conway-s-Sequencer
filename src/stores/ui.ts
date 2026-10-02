import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const UI_STORAGE_KEY = 'conways-sequencer:ui'

interface UiState {
  settingsOpen: boolean
  moduleViewOpen: boolean
}

/** Matches the phone breakpoint in `style.css`; wider screens start with the drawer open. */
export const PHONE_MEDIA_QUERY = '(max-width: 767px)'

/**
 * The drawer is open on desktops and tablets, where it shares the viewport with the grid, and
 * closed on phones, where it would push the grid below the fold until the user asks for it.
 * The module view is a debugging aid, so it starts hidden everywhere.
 */
function defaults(): UiState {
  const phone =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_MEDIA_QUERY).matches
  return { settingsOpen: !phone, moduleViewOpen: false }
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
    }
  } catch {
    return fallback
  }
}

/**
 * Layout preferences that are not part of the song: whether the settings drawer (sections,
 * module settings, song file I/O) is open and whether the module view (a live picture of the
 * module's outputs) is shown. Persisted so the editor comes back the way it was left.
 */
export const useUiStore = defineStore('ui', () => {
  const stored = readStored()
  const settingsOpen = ref(stored.settingsOpen)
  const moduleViewOpen = ref(stored.moduleViewOpen)

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

  watch([settingsOpen, moduleViewOpen], ([settings, moduleView]) => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ settingsOpen: settings, moduleViewOpen: moduleView }))
    } catch {
      /* storage can be full or disabled; the preference is a convenience only */
    }
  })

  return { settingsOpen, moduleViewOpen, toggleSettings, setSettingsOpen, toggleModuleView, setModuleViewOpen }
})
