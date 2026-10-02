import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { PHONE_MEDIA_QUERY, TRACK_ORIENTATIONS, UI_STORAGE_KEY, isVerticalOrientation, useUiStore } from './ui'

describe('ui store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the settings drawer by default and persists toggles', async () => {
    const ui = useUiStore()
    expect(ui.settingsOpen).toBe(true)
    ui.toggleSettings()
    await nextTick()
    expect(ui.settingsOpen).toBe(false)
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY)!)).toEqual({
      settingsOpen: false,
      moduleViewOpen: false,
      trackOrientation: 'ltr',
    })
    ui.setSettingsOpen(true)
    await nextTick()
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY)!)).toEqual({
      settingsOpen: true,
      moduleViewOpen: false,
      trackOrientation: 'ltr',
    })
  })

  it('hides the module view by default and persists toggles alongside the drawer', async () => {
    const ui = useUiStore()
    expect(ui.moduleViewOpen).toBe(false)
    ui.toggleModuleView()
    await nextTick()
    expect(ui.moduleViewOpen).toBe(true)
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY)!)).toEqual({
      settingsOpen: true,
      moduleViewOpen: true,
      trackOrientation: 'ltr',
    })
    ui.setModuleViewOpen(false)
    await nextTick()
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY)!)).toEqual({
      settingsOpen: true,
      moduleViewOpen: false,
      trackOrientation: 'ltr',
    })

    setActivePinia(createPinia())
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ settingsOpen: false, moduleViewOpen: true }))
    const again = useUiStore()
    expect(again.settingsOpen).toBe(false)
    expect(again.moduleViewOpen).toBe(true)
  })

  it('runs tracks left to right by default and persists another orientation', async () => {
    const ui = useUiStore()
    expect(ui.trackOrientation).toBe('ltr')
    ui.setTrackOrientation('ttb')
    await nextTick()
    expect(ui.trackOrientation).toBe('ttb')
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY)!)).toEqual({
      settingsOpen: true,
      moduleViewOpen: false,
      trackOrientation: 'ttb',
    })
    // Anything but one of the four orientations is ignored.
    ui.setTrackOrientation('diagonal')
    expect(ui.trackOrientation).toBe('ttb')

    setActivePinia(createPinia())
    expect(useUiStore().trackOrientation).toBe('ttb')

    // A stored value that is not an orientation falls back to the default.
    setActivePinia(createPinia())
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ trackOrientation: 'sideways' }))
    expect(useUiStore().trackOrientation).toBe('ltr')
  })

  it('offers four orientations, two of them vertical', () => {
    expect(TRACK_ORIENTATIONS.map((o) => o.value)).toEqual(['ltr', 'rtl', 'ttb', 'btt'])
    expect(TRACK_ORIENTATIONS.map((o) => o.label)).toEqual([
      'Left to right',
      'Right to left',
      'Top to bottom',
      'Bottom to top',
    ])
    expect(TRACK_ORIENTATIONS.map((o) => isVerticalOrientation(o.value))).toEqual([false, false, true, true])
  })

  it('starts with the drawer closed on a phone-sized screen, unless a preference is stored', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === PHONE_MEDIA_QUERY }) as MediaQueryList)
    vi.stubGlobal('matchMedia', matchMedia)
    expect(useUiStore().settingsOpen).toBe(false)
    expect(matchMedia).toHaveBeenCalledWith(PHONE_MEDIA_QUERY)

    setActivePinia(createPinia())
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ settingsOpen: true }))
    expect(useUiStore().settingsOpen).toBe(true)
  })

  it('restores a stored preference', () => {
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ settingsOpen: false }))
    expect(useUiStore().settingsOpen).toBe(false)
  })

  it('falls back to defaults on corrupt or partial storage', () => {
    localStorage.setItem(UI_STORAGE_KEY, '{not json')
    expect(useUiStore().settingsOpen).toBe(true)
    setActivePinia(createPinia())
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ settingsOpen: 'yes', moduleViewOpen: 1 }))
    expect(useUiStore().settingsOpen).toBe(true)
    expect(useUiStore().moduleViewOpen).toBe(false)
    // A preference saved before the module view existed keeps the drawer choice.
    setActivePinia(createPinia())
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ settingsOpen: false }))
    expect(useUiStore().settingsOpen).toBe(false)
    expect(useUiStore().moduleViewOpen).toBe(false)
  })
})
