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
    expect(wrapper.get('[data-testid="channel-count"]').text()).toContain('8 / 62')
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

  it('gives each channel row its own track hue', () => {
    const store = useSongStore()
    for (let i = 0; i < 5; i++) store.addChannel()
    const wrapper = mount(SequencerGrid)
    const rows = wrapper.findAll('.channel-row')
    expect(rows).toHaveLength(13)
    const hue = (i: number) => (rows[i]!.element as HTMLElement).style.getPropertyValue('--track-hue')
    const hues = rows.map((_, i) => hue(i))
    hues.forEach((h) => expect(h).toMatch(/^\d+$/))
    // Twelve distinct hues before the palette wraps; neighbours never share one.
    expect(new Set(hues.slice(0, 12)).size).toBe(12)
    expect(hue(12)).toBe(hue(0))
    for (let i = 1; i < rows.length; i++) expect(hue(i)).not.toBe(hue(i - 1))
    expect(wrapper.findAll('[data-testid="channel-swatch"]')).toHaveLength(13)
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

  it('toggles on a finger tap and leaves a touch drag to the browser', async () => {
    const store = useSongStore()
    const wrapper = mount(SequencerGrid, { attachTo: document.body })
    const section = store.song.sections[0]!
    const channel = store.song.channels[0]!
    const cell = (step: number) => wrapper.get(`[data-testid="cell-0-0-${step}"]`)

    // A touch pointerdown draws nothing: the browser may still turn it into a scroll.
    await cell(0).trigger('pointerdown', { button: 0, buttons: 1, pointerType: 'touch' })
    expect(section.steps[channel.id]).toBeUndefined()
    // Neither does moving the finger across cells.
    await cell(1).trigger('pointerenter', { buttons: 1, pointerType: 'touch' })
    expect(section.steps[channel.id]).toBeUndefined()
    // The tap's click is what toggles.
    await cell(0).trigger('click')
    expect(section.steps[channel.id]).toEqual([0])
    await cell(0).trigger('click')
    expect(section.steps[channel.id]).toBeUndefined()

    // A mouse paints on pointerdown and its click must not toggle the cell back.
    await cell(3).trigger('pointerdown', { button: 0, buttons: 1, pointerType: 'mouse' })
    await cell(3).trigger('click')
    expect(section.steps[channel.id]).toEqual([3])
    window.dispatchEvent(new Event('pointerup'))
    wrapper.unmount()
  })

  it('ties consecutive on-steps into one continuous bar', async () => {
    const store = useSongStore()
    store.addSection({ bars: 1 })
    const wrapper = mount(SequencerGrid)
    const channel = store.song.channels[0]!
    const first = store.song.sections[0]!
    const second = store.song.sections[1]!
    for (const step of [2, 3, 4, 63]) store.setStep(first.id, channel.id, step, true)
    store.setStep(second.id, channel.id, 0, true)
    await wrapper.vm.$nextTick()

    const classes = (section: number, step: number) =>
      wrapper.get(`[data-testid="cell-0-${section}-${step}"]`).classes()
    // Run start: joined to the right only.
    expect(classes(0, 2)).toContain('tie-next')
    expect(classes(0, 2)).not.toContain('tie-prev')
    // Middle: joined on both sides.
    expect(classes(0, 3)).toContain('tie-prev')
    expect(classes(0, 3)).toContain('tie-next')
    // Run end: joined to the left only.
    expect(classes(0, 4)).toContain('tie-prev')
    expect(classes(0, 4)).not.toContain('tie-next')
    // Off cells and single on-steps carry no ties.
    expect(classes(0, 5)).not.toContain('tie-prev')
    expect(classes(0, 1)).not.toContain('tie-next')
    // Gates do not tie across a section boundary: each section is its own gate.
    expect(classes(0, 63)).not.toContain('tie-next')
    expect(classes(1, 0)).not.toContain('tie-prev')
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
    expect(wrapper.findAll('.channel-row')).toHaveLength(62)
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

  describe('loop strip', () => {
    const bar = (wrapper: ReturnType<typeof mount>, globalBar: number) =>
      wrapper.get(`[data-testid="loop-bar-${globalBar}"]`)

    it('renders one cell per bar across sections, lit between the loop points', async () => {
      const store = useSongStore()
      store.addSection({ bars: 2 })
      const wrapper = mount(SequencerGrid)
      expect(wrapper.findAll('.loop-cell')).toHaveLength(6)
      expect(wrapper.findAll('.loop-cell.in-loop')).toHaveLength(0)
      expect(wrapper.find('[data-testid="loop-clear"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="loop-strip"]').text()).toContain('click or drag a bar')

      store.setLoopRange(3, 5) // the last bar of A and the first of the new section
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.loop-cell.in-loop').map((c) => c.attributes('data-testid'))).toEqual([
        'loop-bar-3',
        'loop-bar-4',
      ])
      expect(bar(wrapper, 3).classes()).toContain('loop-start')
      expect(bar(wrapper, 4).classes()).toContain('loop-end')
      expect(bar(wrapper, 3).classes()).not.toContain('loop-end')
      expect(bar(wrapper, 3).attributes('aria-pressed')).toBe('true')
      expect(bar(wrapper, 0).attributes('aria-pressed')).toBe('false')
      expect(bar(wrapper, 4).attributes('aria-label')).toContain('Section 2 bar 1')
      // The bar numbers inside the range pick up the accent too.
      expect(wrapper.findAll('.bar-label.in-loop')).toHaveLength(2)

      await wrapper.get('[data-testid="loop-clear"]').trigger('click')
      expect(store.song.settings.loopRange).toBeNull()
      expect(wrapper.findAll('.loop-cell.in-loop')).toHaveLength(0)
    })

    it('loops one bar on a click and a range on a drag', async () => {
      const store = useSongStore()
      const wrapper = mount(SequencerGrid, { attachTo: document.body })
      await bar(wrapper, 1).trigger('pointerdown', { button: 0, buttons: 1 })
      expect(store.song.settings.loopRange).toEqual({ start: 1, end: 2 })
      await bar(wrapper, 2).trigger('pointerenter', { buttons: 1 })
      await bar(wrapper, 3).trigger('pointerenter', { buttons: 1 })
      expect(store.song.settings.loopRange).toEqual({ start: 1, end: 4 })
      // Dragging back the other way shrinks the range, and past the anchor flips it.
      await bar(wrapper, 2).trigger('pointerenter', { buttons: 1 })
      expect(store.song.settings.loopRange).toEqual({ start: 1, end: 3 })
      await bar(wrapper, 0).trigger('pointerenter', { buttons: 1 })
      expect(store.song.settings.loopRange).toEqual({ start: 0, end: 2 })
      // Releasing the pointer ends the drag.
      window.dispatchEvent(new Event('pointerup'))
      await bar(wrapper, 3).trigger('pointerenter', { buttons: 1 })
      expect(store.song.settings.loopRange).toEqual({ start: 0, end: 2 })
      // The right button does nothing; a mouse click after its own pointerdown does not re-set the bar.
      await bar(wrapper, 3).trigger('pointerdown', { button: 2, buttons: 2 })
      await bar(wrapper, 3).trigger('click')
      expect(store.song.settings.loopRange).toEqual({ start: 0, end: 2 })
      wrapper.unmount()
    })

    it('extends the range with Shift', async () => {
      const store = useSongStore()
      const wrapper = mount(SequencerGrid, { attachTo: document.body })
      await bar(wrapper, 1).trigger('pointerdown', { button: 0, buttons: 1 })
      await bar(wrapper, 3).trigger('pointerdown', { button: 0, buttons: 1, shiftKey: true })
      expect(store.song.settings.loopRange).toEqual({ start: 1, end: 4 })
      // A Shift-drag keeps stretching from the far end of the range.
      await bar(wrapper, 2).trigger('pointerenter', { buttons: 1 })
      expect(store.song.settings.loopRange).toEqual({ start: 1, end: 3 })
      window.dispatchEvent(new Event('pointerup'))
      await bar(wrapper, 0).trigger('pointerdown', { button: 0, buttons: 1, shiftKey: true })
      expect(store.song.settings.loopRange).toEqual({ start: 0, end: 3 })
      // Shift-dragging the start edge moves that edge.
      await bar(wrapper, 1).trigger('pointerenter', { buttons: 1 })
      expect(store.song.settings.loopRange).toEqual({ start: 1, end: 3 })
      window.dispatchEvent(new Event('pointerup'))
      wrapper.unmount()
    })

    it('loops a bar on a finger tap and leaves a touch drag to the browser', async () => {
      const store = useSongStore()
      const wrapper = mount(SequencerGrid, { attachTo: document.body })
      await bar(wrapper, 2).trigger('pointerdown', { button: 0, buttons: 1, pointerType: 'touch' })
      expect(store.song.settings.loopRange).toBeNull()
      await bar(wrapper, 3).trigger('pointerenter', { buttons: 1, pointerType: 'touch' })
      expect(store.song.settings.loopRange).toBeNull()
      await bar(wrapper, 2).trigger('click')
      expect(store.song.settings.loopRange).toEqual({ start: 2, end: 3 })
      wrapper.unmount()
    })

    it('loops and extends with the keyboard', async () => {
      const store = useSongStore()
      const wrapper = mount(SequencerGrid)
      await bar(wrapper, 2).trigger('keydown.enter')
      expect(store.song.settings.loopRange).toEqual({ start: 2, end: 3 })
      await bar(wrapper, 0).trigger('keydown.space', { shiftKey: true })
      expect(store.song.settings.loopRange).toEqual({ start: 0, end: 3 })
      await bar(wrapper, 3).trigger('keydown.space')
      expect(store.song.settings.loopRange).toEqual({ start: 3, end: 4 })
    })
  })
})
