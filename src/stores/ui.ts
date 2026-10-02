import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const UI_STORAGE_KEY = 'conways-sequencer:ui'

interface UiState {
  settingsOpen: boolean
}

/** Matches the phone breakpoint in `style.css`; wider screens start with the drawer open. */
export const PHONE_MEDIA_QUERY = '(max-width: 767px)'

/**
 * Open on desktops and tablets, where the drawer shares the viewport with the grid; closed
 * on phones, where it would push the grid below the fold until the user asks for it.
 */
function defaults(): UiState {
  const phone =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_MEDIA_QUERY).matches
  return { settingsOpen: !phone }
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
    }
  } catch {
    return fallback
  }
}

/**
 * Layout preferences that are not part of the song: whether the settings
 * drawer (sections, module settings, song file I/O) is open. Persisted so the
 * editor comes back the way it was left.
 */
export const useUiStore = defineStore('ui', () => {
  const stored = readStored()
  const settingsOpen = ref(stored.settingsOpen)

  function toggleSettings() {
    settingsOpen.value = !settingsOpen.value
  }

  function setSettingsOpen(open: boolean) {
    settingsOpen.value = open
  }

  watch(settingsOpen, (open) => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ settingsOpen: open }))
    } catch {
      /* storage can be full or disabled; the preference is a convenience only */
    }
  })

  return { settingsOpen, toggleSettings, setSettingsOpen }
})
