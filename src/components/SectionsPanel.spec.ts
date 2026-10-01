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

  describe('drag-and-drop reordering', () => {
    function setup() {
      const store = useSongStore()
      store.addSection({ name: 'B' })
      store.addSection({ name: 'C' })
      const wrapper = mount(SectionsPanel)
      const names = () => store.song.sections.map((s) => s.name)
      const row = (i: number) => wrapper.get(`[data-testid="section-row-${i}"]`)
      return { store, wrapper, names, row }
    }

    /** Fake a row's box so the drop side can be derived from clientY. */
    function placeRow(row: ReturnType<typeof mount>['element'] | Element, top: number, height = 20) {
      ;(row as HTMLElement).getBoundingClientRect = () =>
        ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    }

    it('makes only the grip draggable, never the row or its inputs', () => {
      const { row } = setup()
      expect(row(0).get('[data-testid="section-handle"]').attributes('draggable')).toBe('true')
      expect(row(0).attributes('draggable')).toBeUndefined()
      expect(row(0).get('[data-testid="section-name"]').attributes('draggable')).toBeUndefined()
    })

    it('drops a row below a later row', async () => {
      const { store, names, row } = setup()
      const before = store.revision
      await row(0).get('[data-testid="section-handle"]').trigger('dragstart')
      expect(row(0).classes()).toContain('dragging')

      placeRow(row(2).element, 40)
      await row(2).trigger('dragover', { clientY: 55 })
      expect(row(2).classes()).toContain('drop-after')
      await row(2).trigger('drop')
      expect(names()).toEqual(['B', 'C', 'A'])
      expect(store.revision).toBe(before + 1)
      expect(row(2).classes()).not.toContain('drop-after')
      expect(row(2).classes()).not.toContain('dragging')
    })

    it('drops a row above an earlier row', async () => {
      const { names, row } = setup()
      await row(2).get('[data-testid="section-handle"]').trigger('dragstart')
      placeRow(row(0).element, 0)
      await row(0).trigger('dragover', { clientY: 3 })
      expect(row(0).classes()).toContain('drop-before')
      await row(0).trigger('drop')
      expect(names()).toEqual(['C', 'A', 'B'])
    })

    it('dropping a row next to itself changes nothing', async () => {
      const { store, names, row } = setup()
      const before = store.revision
      await row(1).get('[data-testid="section-handle"]').trigger('dragstart')
      placeRow(row(0).element, 0)
      await row(0).trigger('dragover', { clientY: 15 }) // lower half: after A == where B already is
      await row(0).trigger('drop')
      expect(names()).toEqual(['A', 'B', 'C'])
      expect(store.revision).toBe(before)
    })

    it('clears the drop indicator on dragleave and a cancelled drag', async () => {
      const { names, row } = setup()
      await row(0).get('[data-testid="section-handle"]').trigger('dragstart')
      placeRow(row(1).element, 20)
      await row(1).trigger('dragover', { clientY: 22 })
      expect(row(1).classes()).toContain('drop-before')
      // Moving between cells of the same row bubbles a dragleave too; keep the indicator.
      await row(1).trigger('dragleave', { relatedTarget: row(1).get('[data-testid="section-name"]').element })
      expect(row(1).classes()).toContain('drop-before')
      await row(1).trigger('dragleave', { relatedTarget: row(2).element })
      expect(row(1).classes()).not.toContain('drop-before')
      await row(1).trigger('dragover', { clientY: 22 })
      await row(1).trigger('dragleave')
      expect(row(1).classes()).not.toContain('drop-before')
      await row(1).trigger('dragover', { clientY: 22 })
      await row(0).trigger('dragend')
      expect(row(0).classes()).not.toContain('dragging')
      expect(row(1).classes()).not.toContain('drop-before')
      expect(names()).toEqual(['A', 'B', 'C'])
    })

    it('ignores dragover and drop events that are not a section drag', async () => {
      const { names, row } = setup()
      placeRow(row(1).element, 20)
      await row(1).trigger('dragover', { clientY: 22 })
      expect(row(1).classes()).not.toContain('drop-before')
      await row(1).trigger('drop')
      expect(names()).toEqual(['A', 'B', 'C'])
    })

    it('moves a section with the arrow keys on its handle', async () => {
      const { names, row } = setup()
      const handle = () => row(0).get('[data-testid="section-handle"]')
      await handle().trigger('keydown', { key: 'ArrowDown' })
      expect(names()).toEqual(['B', 'A', 'C'])
      await row(1).get('[data-testid="section-handle"]').trigger('keydown', { key: 'ArrowUp' })
      expect(names()).toEqual(['A', 'B', 'C'])
      await handle().trigger('keydown', { key: 'ArrowUp' })
      await handle().trigger('keydown', { key: 'Enter' })
      expect(names()).toEqual(['A', 'B', 'C'])
    })
  })

  it('shows an empty state', () => {
    const store = useSongStore()
    store.removeSection(store.song.sections[0]!.id)
    const wrapper = mount(SectionsPanel)
    expect(wrapper.text()).toContain('No sections yet')
  })
})
