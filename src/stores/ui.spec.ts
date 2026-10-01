import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { UI_STORAGE_KEY, useUiStore } from './ui'

describe('ui store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('opens the settings drawer by default and persists toggles', async () => {
    const ui = useUiStore()
    expect(ui.settingsOpen).toBe(true)
    ui.toggleSettings()
    await nextTick()
    expect(ui.settingsOpen).toBe(false)
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY)!)).toEqual({ settingsOpen: false })
    ui.setSettingsOpen(true)
    await nextTick()
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY)!)).toEqual({ settingsOpen: true })
  })

  it('restores a stored preference', () => {
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ settingsOpen: false }))
    expect(useUiStore().settingsOpen).toBe(false)
  })

  it('falls back to defaults on corrupt or partial storage', () => {
    localStorage.setItem(UI_STORAGE_KEY, '{not json')
    expect(useUiStore().settingsOpen).toBe(true)
    setActivePinia(createPinia())
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ settingsOpen: 'yes' }))
    expect(useUiStore().settingsOpen).toBe(true)
  })
})
