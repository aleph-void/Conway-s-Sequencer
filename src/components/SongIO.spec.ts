import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useSongStore } from '../stores/song'
import SongIO from './SongIO.vue'

describe('SongIO', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('exports a JSON download', async () => {
    const store = useSongStore()
    store.rename('Export Test')
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mount(SongIO)
    await wrapper.get('[data-testid="export-song"]').trigger('click')
    expect(createUrl).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="io-message"]').text()).toContain('export-test.conway-seq.json')
    createUrl.mockRestore()
    revoke.mockRestore()
    click.mockRestore()
  })

  it('imports a valid file and reports invalid ones', async () => {
    const store = useSongStore()
    const wrapper = mount(SongIO)
    const json = JSON.stringify({ name: 'Imported', channels: [{ output: 3 }], sections: [{ tempo: 99 }] })
    const input = wrapper.get('[data-testid="import-file"]')
    const file = new File([json], 'song.json', { type: 'application/json' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(store.song.name).toBe('Imported'))
    expect(wrapper.get('[data-testid="io-message"]').text()).toContain('Imported')

    const bad = new File(['{nope'], 'bad.json', { type: 'application/json' })
    Object.defineProperty(input.element, 'files', { value: [bad], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(wrapper.find('[data-testid="io-error"]').exists()).toBe(true))
    expect(wrapper.get('[data-testid="io-error"]').text()).toContain('not valid JSON')
    expect(store.song.name).toBe('Imported')

    Object.defineProperty(input.element, 'files', { value: [], configurable: true })
    await input.trigger('change')
  })

  it('shows the live autosave status', async () => {
    const store = useSongStore()
    const wrapper = mount(SongIO)
    const status = wrapper.get('[data-testid="autosave-status"]')
    expect(status.text()).toContain('Songs autosave in this browser')
    expect(status.attributes('data-save-state')).toBe('idle')

    store.saveState = 'pending'
    await nextTick()
    expect(status.text()).toContain('Saving')

    store.saveState = 'saved'
    store.lastSavedAt = new Date(2026, 9, 1, 12, 34, 56).getTime()
    await nextTick()
    expect(status.text()).toMatch(/Autosaved at .*34.*56/)
    expect(status.classes()).toContain('status-ok')

    store.lastSavedAt = null
    await nextTick()
    expect(status.text()).toBe('Autosaved.')

    store.saveState = 'error'
    await nextTick()
    expect(status.text()).toContain('Autosave failed')
    expect(status.classes()).toContain('status-bad')

    store.saveState = 'unavailable'
    await nextTick()
    expect(status.text()).toContain('unavailable')
    expect(status.classes()).toContain('status-warn')
  })

  it('reaches "saved" after editing through the store', async () => {
    vi.useFakeTimers()
    const store = useSongStore()
    const wrapper = mount(SongIO)
    store.rename('Edited')
    await nextTick()
    expect(wrapper.get('[data-testid="autosave-status"]').text()).toContain('Saving')
    await vi.advanceTimersByTimeAsync(300)
    expect(wrapper.get('[data-testid="autosave-status"]').text()).toContain('Autosaved at')
    vi.useRealTimers()
  })

  it('starts a new song and keeps the old one in the library', async () => {
    const store = useSongStore()
    store.rename('Old')
    const wrapper = mount(SongIO)
    await wrapper.get('[data-testid="new-song"]').trigger('click')
    expect(store.song.name).toBe('Untitled')
    expect(wrapper.get('[data-testid="io-message"]').text()).toBe('New song. "Old" is kept in the Song browser.')
    expect(store.library.map((e) => e.name)).toEqual(['Untitled', 'Old'])
  })

  it('imports into a new library entry', async () => {
    const store = useSongStore()
    store.rename('Keep me')
    const wrapper = mount(SongIO)
    const json = JSON.stringify({ name: 'Imported', channels: [{ output: 3 }], sections: [{ tempo: 99 }] })
    const input = wrapper.get('[data-testid="import-file"]')
    const file = new File([json], 'song.json', { type: 'application/json' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(store.song.name).toBe('Imported'))
    expect(store.library.map((e) => e.name)).toEqual(['Imported', 'Keep me'])
  })

  it('opens the file picker from the Import button and reads a file without Blob.text()', async () => {
    const store = useSongStore()
    const wrapper = mount(SongIO)
    const input = wrapper.get('[data-testid="import-file"]')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click').mockImplementation(() => {})
    await wrapper.get('[data-testid="import-song"]').trigger('click')
    expect(click).toHaveBeenCalledTimes(1)

    const json = JSON.stringify({ name: 'Old engine', channels: [], sections: [] })
    const file = new File([json], 'song.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: undefined })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(store.song.name).toBe('Old engine'))
    await nextTick()
    expect(wrapper.get('[data-testid="io-message"]').text()).toContain('Old engine')
  })
})
