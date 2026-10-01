import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'
import SequencerGrid from './SequencerGrid.vue'

describe('SequencerGrid', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('renders one row per channel and one cell per step per section', () => {
    const store = useSongStore()
    store.addSection({ bars: 1 })
    const wrapper = mount(SequencerGrid)
    expect(wrapper.findAll('.channel-row')).toHaveLength(8)
    expect(wrapper.findAll('[data-testid="channel-row-0"] .cell')).toHaveLength(64 + 16)
    expect(wrapper.findAll('.bar-label')).toHaveLength(5)
    expect(wrapper.get('[data-testid="grid-section-0"]').text()).toContain('120 BPM')
    expect(wrapper.get('[data-testid="channel-count"]').text()).toContain('8 / 64')
  })

  it('dims rows that are muted, or silenced by another channel\'s solo', async () => {
    const store = useSongStore()
    const wrapper = mount(SequencerGrid)
    const row = (i: number) => wrapper.get(`[data-testid="channel-row-${i}"]`)
    expect(row(0).classes()).not.toContain('is-muted')

    store.updateChannel(store.song.channels[2]!.id, { solo: true })
    await wrapper.vm.$nextTick()
    expect(row(0).classes()).toContain('is-muted')
    expect(row(1).classes()).toContain('is-muted')
    expect(row(2).classes()).not.toContain('is-muted')

    store.updateChannel(store.song.channels[2]!.id, { solo: false })
    await wrapper.vm.$nextTick()
    expect(row(0).classes()).not.toContain('is-muted')
  })

  it('toggles a cell on pointerdown and paints on pointerenter', async () => {
    const store = useSongStore()
    const wrapper = mount(SequencerGrid, { attachTo: document.body })
    const section = store.song.sections[0]!
    const channel = store.song.channels[0]!

    const c0 = wrapper.get('[data-testid="cell-0-0-0"]')
    await c0.trigger('pointerdown', { button: 0, buttons: 1 })
    expect(section.steps[channel.id]).toEqual([0])
    expect(c0.classes()).toContain('on')
    expect(c0.attributes('aria-checked')).toBe('true')

    await wrapper.get('[data-testid="cell-0-0-1"]').trigger('pointerenter', { buttons: 1 })
    await wrapper.get('[data-testid="cell-0-0-2"]').trigger('pointerenter', { buttons: 1 })
    expect(section.steps[channel.id]).toEqual([0, 1, 2])

    // Releasing the pointer ends the stroke; hovering no longer paints.
    window.dispatchEvent(new Event('pointerup'))
    await wrapper.get('[data-testid="cell-0-0-3"]').trigger('pointerenter', { buttons: 1 })
    expect(section.steps[channel.id]).toEqual([0, 1, 2])

    // Starting on an "on" cell erases.
    await wrapper.get('[data-testid="cell-0-0-1"]').trigger('pointerdown', { button: 0, buttons: 1 })
    await wrapper.get('[data-testid="cell-0-0-2"]').trigger('pointerenter', { buttons: 1 })
    expect(section.steps[channel.id]).toEqual([0])

    // Right button does nothing; hovering without a pressed button does nothing.
    await wrapper.get('[data-testid="cell-0-0-5"]').trigger('pointerdown', { button: 2, buttons: 2 })
    await wrapper.get('[data-testid="cell-0-0-6"]').trigger('pointerenter', { buttons: 0 })
    expect(section.steps[channel.id]).toEqual([0])
    wrapper.unmount()
  })

  it('toggles with the keyboard', async () => {
    const store = useSongStore()
    const wrapper = mount(SequencerGrid)
    const channel = store.song.channels[1]!
    await wrapper.get('[data-testid="cell-1-0-4"]').trigger('keydown.enter')
    expect(store.song.sections[0]!.steps[channel.id]).toEqual([4])
    await wrapper.get('[data-testid="cell-1-0-4"]').trigger('keydown.space')
    expect(store.song.sections[0]!.steps[channel.id]).toBeUndefined()
  })

  it('adds channels until the module limit', async () => {
    const store = useSongStore()
    const wrapper = mount(SequencerGrid)
    await wrapper.get('[data-testid="add-channel"]').trigger('click')
    expect(store.song.channels).toHaveLength(9)
    while (store.canAddChannel) store.addChannel()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="add-channel"]').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('.channel-row')).toHaveLength(64)
  })

  it('highlights the playhead column while playing', async () => {
    const transport = useTransportStore()
    const wrapper = mount(SequencerGrid)
    expect(wrapper.findAll('.cell.playhead')).toHaveLength(0)
    transport.play()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.cell.playhead')).toHaveLength(8)
    expect(wrapper.get('[data-testid="cell-0-0-0"]').classes()).toContain('playhead')
    transport.stop()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.cell.playhead')).toHaveLength(0)
  })

  it('shows empty states', () => {
    const store = useSongStore()
    store.removeSection(store.song.sections[0]!.id)
    const wrapper = mount(SequencerGrid)
    expect(wrapper.text()).toContain('Add a section')
    store.addSection()
    for (const c of [...store.song.channels]) store.removeChannel(c.id)
    const again = mount(SequencerGrid)
    expect(again.text()).toContain('Add a channel')
  })
})
