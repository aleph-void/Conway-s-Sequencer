import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSongStore } from '../stores/song'
import SectionsPanel from './SectionsPanel.vue'

describe('SectionsPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('renders a row per section with resolved tempo placeholder', async () => {
    const store = useSongStore()
    store.addSection()
    const wrapper = mount(SectionsPanel)
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    const inherited = rows[1]!.get('[data-testid="tempo-inherited"]')
    expect(inherited.text()).toContain('120')
    expect(rows[0]!.find('[data-testid="tempo-inherited"]').exists()).toBe(false)
  })

  it('adds a section from the button', async () => {
    const wrapper = mount(SectionsPanel)
    await wrapper.get('[data-testid="add-section"]').trigger('click')
    expect(useSongStore().song.sections).toHaveLength(2)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('edits tempo, meter, bars and subdivision through the inputs', async () => {
    const store = useSongStore()
    const wrapper = mount(SectionsPanel)
    const row = wrapper.get('[data-testid="section-row-0"]')
    await row.get('[data-testid="section-tempo"]').setValue('98')
    await row.get('[data-testid="section-beats"]').setValue('7')
    await row.get('[data-testid="section-unit"]').setValue('8')
    await row.get('[data-testid="section-bars"]').setValue('2')
    await row.get('[data-testid="section-subdivision"]').setValue('2')
    await row.get('[data-testid="section-name"]').setValue('Verse')
    expect(store.song.sections[0]).toMatchObject({
      name: 'Verse',
      tempo: 98,
      timeSignature: { beats: 7, unit: 8 },
      bars: 2,
      subdivision: 2,
    })
    expect(row.text()).toContain('28 steps')
    await row.get('[data-testid="section-tempo"]').setValue('')
    expect(store.song.sections[0]!.tempo).toBeNull()
  })

  it('moves, duplicates, clears and deletes sections', async () => {
    const store = useSongStore()
    const first = store.song.sections[0]!
    store.toggleStep(first.id, store.song.channels[0]!.id, 0)
    store.addSection({ name: 'B' })
    const wrapper = mount(SectionsPanel)

    await wrapper.get('[data-testid="section-row-1"] [data-testid="section-up"]').trigger('click')
    expect(store.song.sections[0]!.name).toBe('B')
    await wrapper.get('[data-testid="section-row-0"] [data-testid="section-down"]').trigger('click')
    expect(store.song.sections[0]!.name).toBe('A')

    await wrapper.get('[data-testid="section-row-0"] [data-testid="section-duplicate"]').trigger('click')
    expect(store.song.sections.map((s) => s.name)).toEqual(['A', 'A copy', 'B'])

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper.get('[data-testid="section-row-0"] [data-testid="section-delete"]').trigger('click')
    expect(store.song.sections).toHaveLength(3)
    confirm.mockReturnValue(true)
    await wrapper.get('[data-testid="section-row-0"] [data-testid="section-delete"]').trigger('click')
    expect(store.song.sections.map((s) => s.name)).toEqual(['A copy', 'B'])
    expect(confirm).toHaveBeenCalledTimes(2)

    await wrapper.get('[data-testid="section-row-0"] [data-testid="section-clear"]').trigger('click')
    expect(store.song.sections[0]!.steps).toEqual({})
    // Deleting an empty section needs no confirmation.
    await wrapper.get('[data-testid="section-row-0"] [data-testid="section-delete"]').trigger('click')
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(store.song.sections.map((s) => s.name)).toEqual(['B'])
    confirm.mockRestore()
  })

  it('shows an empty state', () => {
    const store = useSongStore()
    store.removeSection(store.song.sections[0]!.id)
    const wrapper = mount(SectionsPanel)
    expect(wrapper.text()).toContain('No sections yet')
  })
})
