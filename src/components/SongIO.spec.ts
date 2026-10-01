import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('starts a new song after confirmation', async () => {
    const store = useSongStore()
    store.rename('Old')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = mount(SongIO)
    await wrapper.get('[data-testid="new-song"]').trigger('click')
    expect(store.song.name).toBe('Old')
    confirm.mockReturnValue(true)
    await wrapper.get('[data-testid="new-song"]').trigger('click')
    expect(store.song.name).toBe('Untitled')
    confirm.mockRestore()
  })
})
