import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const UI_STORAGE_KEY = 'conways-sequencer:ui'

interface UiState {
  settingsOpen: boolean
}

const DEFAULTS: UiState = { settingsOpen: true }

function readStored(): UiState {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<UiState>
    return {
      settingsOpen: typeof parsed.settingsOpen === 'boolean' ? parsed.settingsOpen : DEFAULTS.settingsOpen,
    }
  } catch {
    return { ...DEFAULTS }
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
