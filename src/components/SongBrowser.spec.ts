import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { songKey } from '../core/library'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'
import SongBrowser from './SongBrowser.vue'

describe('SongBrowser', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  function mountBrowser() {
    return mount(SongBrowser, { attachTo: document.body })
  }

  /** jsdom has no `inert` property, so Vue writes the binding as an attribute ("true" / "false"). */
  function isInert(el: { attributes(key: string): string | undefined }) {
    const value = el.attributes('inert')
    return value !== undefined && value !== 'false'
  }

  it('slides open from its tab, closes from the close button, backdrop and Escape', async () => {
    const wrapper = mountBrowser()
    const root = wrapper.get('[data-testid="song-browser"]')
    const tab = wrapper.get('[data-testid="song-browser-tab"]')
    const panel = wrapper.get('[data-testid="song-browser-panel"]')
    expect(root.attributes('data-open')).toBe('false')
    expect(tab.attributes('aria-expanded')).toBe('false')
    expect(panel.attributes('aria-hidden')).toBe('true')
    expect(tab.text()).toContain('Songs')
    expect(tab.text()).toContain('1')

    await tab.trigger('click')
    await nextTick()
    expect(root.attributes('data-open')).toBe('true')
    expect(tab.attributes('aria-expanded')).toBe('true')
    expect(panel.attributes('aria-hidden')).toBe('false')
    expect(document.activeElement).toBe(wrapper.get('[data-testid="song-browser-close"]').element)

    await wrapper.get('[data-testid="song-browser-close"]').trigger('click')
    expect(root.attributes('data-open')).toBe('false')
    expect(document.activeElement).toBe(tab.element)

    await tab.trigger('click')
    await wrapper.get('[data-testid="song-browser-backdrop"]').trigger('click')
    expect(root.attributes('data-open')).toBe('false')

    // Escape only matters while open.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await tab.trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(root.attributes('data-open')).toBe('false')

    await tab.trigger('click')
    await tab.trigger('click')
    expect(root.attributes('data-open')).toBe('false')
    wrapper.unmount()
  })

  it('lists saved songs most recent first and marks the open one', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 1, 9, 5))
    const store = useSongStore()
    store.rename('Alpha')
    store.addChannel()
    store.addSection()
    store.save()
    vi.setSystemTime(new Date(2026, 9, 1, 10, 30))
    store.newSong()
    store.rename('Beta')
    store.save()
    const wrapper = mountBrowser()
    const entries = wrapper.findAll('[data-testid="song-entry"]')
    expect(entries).toHaveLength(2)
    expect(entries[0]!.text()).toContain('Beta')
    expect(entries[0]!.text()).toMatch(/8 channels · 1 section · edited .*10.*30/)
    expect(entries[0]!.classes()).toContain('current')
    expect(entries[0]!.get('[data-testid="song-pick"]').attributes('aria-current')).toBe('true')
    expect(entries[1]!.text()).toContain('Alpha')
    expect(entries[1]!.text()).toMatch(/9 channels · 2 sections · edited .*9.*05/)
    expect(entries[1]!.get('[data-testid="song-pick"]').attributes('aria-current')).toBeUndefined()
    expect(wrapper.get('[data-testid="song-browser-tab"]').text()).toContain('2')

    // Older songs show a date instead of a time; blank names read as Untitled.
    vi.setSystemTime(new Date(2026, 9, 3, 8, 0))
    store.newSong()
    store.rename('   ')
    store.save()
    await nextTick()
    const updated = wrapper.findAll('[data-testid="song-entry"]')
    expect(updated[0]!.text()).toContain('Untitled')
    expect(updated[1]!.text()).toMatch(/edited .*2026/)
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('selects a song, stopping the transport and closing the drawer', async () => {
    const store = useSongStore()
    const transport = useTransportStore()
    const stop = vi.spyOn(transport, 'stop')
    store.rename('Alpha')
    store.save()
    const alpha = store.currentId
    store.newSong()
    store.rename('Beta')
    store.save()
    const wrapper = mountBrowser()
    await wrapper.get('[data-testid="song-browser-tab"]').trigger('click')
    const picks = wrapper.findAll('[data-testid="song-pick"]')
    await picks[1]!.trigger('click')
    expect(stop).toHaveBeenCalledTimes(1)
    expect(store.currentId).toBe(alpha)
    expect(store.song.name).toBe('Alpha')
    expect(wrapper.get('[data-testid="song-browser"]').attributes('data-open')).toBe('false')

    // Picking the open song just closes the drawer without reloading.
    await wrapper.get('[data-testid="song-browser-tab"]').trigger('click')
    await wrapper.get('.song.current [data-testid="song-pick"]').trigger('click')
    expect(stop).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="song-browser"]').attributes('data-open')).toBe('false')

    // A song that vanished from storage stays unopened and the drawer stays open.
    const beta = store.library.find((e) => e.name === 'Beta')!.id
    localStorage.removeItem(songKey(beta))
    await wrapper.get('[data-testid="song-browser-tab"]').trigger('click')
    await wrapper.get(`[data-song-id="${beta}"] [data-testid="song-pick"]`).trigger('click')
    expect(store.currentId).toBe(alpha)
    expect(wrapper.get('[data-testid="song-browser"]').attributes('data-open')).toBe('true')
    expect(wrapper.findAll('[data-testid="song-entry"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('deletes a song after confirming in a modal', async () => {
    const store = useSongStore()
    const transport = useTransportStore()
    const stop = vi.spyOn(transport, 'stop')
    store.rename('Alpha')
    store.save()
    store.newSong()
    store.rename('Beta')
    store.save()
    const wrapper = mountBrowser()
    const root = wrapper.get('[data-testid="song-browser"]')
    const drawer = wrapper.get('.drawer')
    await wrapper.get('[data-testid="song-browser-tab"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false)
    expect(isInert(drawer)).toBe(false)

    // Asking names the song, focuses Cancel and puts the drawer behind the box.
    const deleteAlpha = wrapper.findAll('[data-testid="song-delete"]')[1]!
    await deleteAlpha.trigger('click')
    await nextTick()
    const dialog = wrapper.get('[data-testid="confirm-dialog"]')
    expect(dialog.get('[role="dialog"]').text()).toContain('Delete “Alpha”?')
    expect(dialog.find('[data-testid="confirm-current-note"]').exists()).toBe(false)
    expect(document.activeElement).toBe(dialog.get('[data-testid="confirm-cancel"]').element)
    expect(isInert(drawer)).toBe(true)
    expect(store.library).toHaveLength(2)

    // Cancel keeps the song and hands focus back to the button that asked.
    await dialog.get('[data-testid="confirm-cancel"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false)
    expect(isInert(drawer)).toBe(false)
    expect(store.library).toHaveLength(2)
    expect(document.activeElement).toBe(deleteAlpha.element)
    expect(root.attributes('data-open')).toBe('true')

    // Escape cancels the box without closing the drawer behind it.
    await deleteAlpha.trigger('click')
    await wrapper.get('[data-testid="confirm-cancel"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false)
    expect(root.attributes('data-open')).toBe('true')
    expect(store.library).toHaveLength(2)

    // So does clicking the backdrop.
    await deleteAlpha.trigger('click')
    await wrapper.get('[data-testid="confirm-backdrop"]').trigger('click')
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false)
    expect(store.library).toHaveLength(2)

    // Confirming deletes it; a song that is not open leaves the transport alone.
    await deleteAlpha.trigger('click')
    await wrapper.get('[data-testid="confirm-accept"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false)
    expect(store.library.map((e) => e.name)).toEqual(['Beta'])
    expect(stop).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="song-browser-close"]').element)

    // Deleting the open song says what opens next, stops playback and opens a fresh song.
    await wrapper.findAll('[data-testid="song-delete"]')[0]!.trigger('click')
    expect(wrapper.get('[data-testid="confirm-current-note"]').text()).toContain('a fresh song will open')
    await wrapper.get('[data-testid="confirm-accept"]').trigger('click')
    expect(stop).toHaveBeenCalledTimes(1)
    expect(store.song.name).toBe('Untitled')
    expect(wrapper.findAll('[data-testid="song-entry"]')).toHaveLength(1)

    // With other songs saved, the note promises the most recent of them.
    store.newSong()
    store.save()
    await nextTick()
    await wrapper.get('.song.current [data-testid="song-delete"]').trigger('click')
    expect(wrapper.get('[data-testid="confirm-current-note"]').text()).toContain('most recently edited remaining song')
    wrapper.unmount()
  })

  it('duplicates a song, opening the copy and closing the drawer', async () => {
    const store = useSongStore()
    const transport = useTransportStore()
    const stop = vi.spyOn(transport, 'stop')
    store.rename('Alpha')
    store.save()
    const alpha = store.currentId
    store.newSong()
    store.rename('Beta')
    store.save()
    const wrapper = mountBrowser()
    await wrapper.get('[data-testid="song-browser-tab"]').trigger('click')
    await wrapper.get(`[data-song-id="${alpha}"] [data-testid="song-duplicate"]`).trigger('click')
    expect(stop).toHaveBeenCalledTimes(1)
    expect(store.song.name).toBe('Alpha copy')
    expect(store.currentId).not.toBe(alpha)
    expect(store.library.map((e) => e.name)).toEqual(['Alpha copy', 'Beta', 'Alpha'])
    expect(wrapper.get('[data-testid="song-browser"]').attributes('data-open')).toBe('false')

    // A song that vanished from storage is dropped and the drawer stays open.
    localStorage.removeItem(songKey(alpha))
    await wrapper.get('[data-testid="song-browser-tab"]').trigger('click')
    await wrapper.get(`[data-song-id="${alpha}"] [data-testid="song-duplicate"]`).trigger('click')
    expect(store.song.name).toBe('Alpha copy')
    expect(wrapper.get('[data-testid="song-browser"]').attributes('data-open')).toBe('true')
    expect(wrapper.findAll('[data-testid="song-entry"]')).toHaveLength(2)
    wrapper.unmount()
  })

  it('starts a new song from the drawer', async () => {
    const store = useSongStore()
    store.rename('Alpha')
    const wrapper = mountBrowser()
    await wrapper.get('[data-testid="song-browser-tab"]').trigger('click')
    await wrapper.get('[data-testid="browser-new-song"]').trigger('click')
    expect(store.song.name).toBe('Untitled')
    expect(store.library.map((e) => e.name)).toEqual(['Untitled', 'Alpha'])
    expect(wrapper.get('[data-testid="song-browser"]').attributes('data-open')).toBe('false')
    wrapper.unmount()
  })

  it('explains when storage is unavailable or empty', async () => {
    vi.stubGlobal('localStorage', undefined)
    const wrapper = mountBrowser()
    expect(wrapper.find('[data-testid="browser-unavailable"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="song-list"]').exists()).toBe(false)
    vi.unstubAllGlobals()
    wrapper.unmount()

    // When the very first write fails there is nothing in the library to list.
    setActivePinia(createPinia())
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const store = useSongStore()
    setItem.mockRestore()
    expect(store.library).toEqual([])
    const empty = mountBrowser()
    expect(empty.get('[data-testid="browser-empty"]').text()).toBe('No songs saved yet.')
    expect(empty.find('[data-testid="song-list"]').exists()).toBe(false)
    expect(empty.get('[data-testid="song-browser-tab"]').text()).toContain('0')
    store.rename('Now it saves')
    store.save()
    await nextTick()
    expect(empty.findAll('[data-testid="song-entry"]')).toHaveLength(1)
    empty.unmount()
  })
})
