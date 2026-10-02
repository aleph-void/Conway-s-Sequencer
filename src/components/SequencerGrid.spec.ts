import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '../stores/editor'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'
import { useUiStore } from '../stores/ui'
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

  describe('selection and clipboard', () => {
    const cell = (wrapper: ReturnType<typeof mount>, c: number, s: number, section = 0) =>
      wrapper.get(`[data-testid="cell-${c}-${section}-${s}"]`)
    const selected = (wrapper: ReturnType<typeof mount>) =>
      wrapper.findAll('.cell.selected').map((c) => c.attributes('data-testid'))
    const key = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { ...init, cancelable: true })
      window.dispatchEvent(event)
      return event
    }

    it('selects a block with Shift+drag across tracks without painting', async () => {
      const store = useSongStore()
      const editor = useEditorStore()
      const wrapper = mount(SequencerGrid, { attachTo: document.body })
      expect(wrapper.find('[data-testid="selection"]').exists()).toBe(false)

      await cell(wrapper, 1, 2).trigger('pointerdown', { button: 0, buttons: 1, shiftKey: true })
      expect(store.song.sections[0]!.steps).toEqual({})
      expect(editor.selection).toEqual({ channelStart: 1, channelEnd: 2, stepStart: 2, stepEnd: 3 })
      expect(selected(wrapper)).toEqual(['cell-1-0-2'])
      expect(wrapper.get('[data-testid="selection-size"]').text()).toBe('1 track × 1 step selected')

      await cell(wrapper, 2, 4).trigger('pointerenter', { buttons: 1 })
      expect(editor.selection).toEqual({ channelStart: 1, channelEnd: 3, stepStart: 2, stepEnd: 5 })
      expect(selected(wrapper)).toEqual(['cell-1-0-2', 'cell-1-0-3', 'cell-1-0-4', 'cell-2-0-2', 'cell-2-0-3', 'cell-2-0-4'])
      expect(wrapper.get('[data-testid="selection-size"]').text()).toBe('2 tracks × 3 steps selected')
      // Dragging back past the anchor flips the rectangle around it.
      await cell(wrapper, 0, 0).trigger('pointerenter', { buttons: 1 })
      expect(editor.selection).toEqual({ channelStart: 0, channelEnd: 2, stepStart: 0, stepEnd: 3 })
      expect(store.song.sections[0]!.steps).toEqual({})

      // Releasing the pointer ends the drag; hovering no longer stretches it.
      window.dispatchEvent(new Event('pointerup'))
      await cell(wrapper, 5, 9).trigger('pointerenter', { buttons: 1 })
      expect(editor.selection).toEqual({ channelStart: 0, channelEnd: 2, stepStart: 0, stepEnd: 3 })

      // A plain press paints as before and leaves the selection alone; the ✕ clears it.
      await cell(wrapper, 5, 9).trigger('pointerdown', { button: 0, buttons: 1 })
      expect(store.song.sections[0]!.steps[store.song.channels[5]!.id]).toEqual([9])
      expect(editor.selection).not.toBeNull()
      window.dispatchEvent(new Event('pointerup'))
      await wrapper.get('[data-testid="clear-selection"]').trigger('click')
      expect(editor.selection).toBeNull()
      expect(wrapper.find('[data-testid="selection"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('selects and stretches with Shift+Enter or Shift+Space on a cell', async () => {
      const store = useSongStore()
      const editor = useEditorStore()
      const wrapper = mount(SequencerGrid)
      await cell(wrapper, 3, 8).trigger('keydown.enter', { shiftKey: true })
      expect(editor.selection).toEqual({ channelStart: 3, channelEnd: 4, stepStart: 8, stepEnd: 9 })
      await cell(wrapper, 4, 11).trigger('keydown.space', { shiftKey: true })
      expect(editor.selection).toEqual({ channelStart: 3, channelEnd: 5, stepStart: 8, stepEnd: 12 })
      expect(store.song.sections[0]!.steps).toEqual({})
      // Without Shift the keys still toggle the cell.
      await cell(wrapper, 4, 11).trigger('keydown.enter')
      expect(store.song.sections[0]!.steps[store.song.channels[4]!.id]).toEqual([11])
      wrapper.unmount()
    })

    it('copies, cuts, deletes and pastes at the cursor with the buttons', async () => {
      const store = useSongStore()
      const transport = useTransportStore()
      const editor = useEditorStore()
      const wrapper = mount(SequencerGrid, { attachTo: document.body })
      const steps = (c: number) => store.song.sections[0]!.steps[store.song.channels[c]!.id] ?? []
      store.setStep(store.song.sections[0]!.id, store.song.channels[0]!.id, 1, true)
      store.setStep(store.song.sections[0]!.id, store.song.channels[1]!.id, 0, true)
      editor.selectCell({ channel: 0, step: 0 })
      editor.extendTo({ channel: 1, step: 1 })
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="paste"]').exists()).toBe(false)

      await wrapper.get('[data-testid="copy"]').trigger('click')
      expect(editor.clipboard).toEqual({ channels: 2, steps: 2, rows: [[1], [0]] })
      const paste = wrapper.get('[data-testid="paste"]')
      expect(paste.attributes('title')).toContain('(2 × 2) at the cursor: A bar 1 step 1 (Ctrl+V)')

      transport.seekToStep(20)
      await wrapper.vm.$nextTick()
      expect(wrapper.get('[data-testid="paste"]').attributes('title')).toContain('at the cursor: A bar 2 step 5')
      await wrapper.get('[data-testid="paste"]').trigger('click')
      expect(steps(0)).toEqual([1, 21])
      expect(steps(1)).toEqual([0, 20])
      expect(selected(wrapper)).toEqual(['cell-0-0-20', 'cell-0-0-21', 'cell-1-0-20', 'cell-1-0-21'])

      await wrapper.get('[data-testid="delete-selection"]').trigger('click')
      expect(steps(0)).toEqual([1])
      expect(steps(1)).toEqual([0])
      expect(editor.selection).toEqual({ channelStart: 0, channelEnd: 2, stepStart: 20, stepEnd: 22 })

      editor.selectCell({ channel: 1, step: 0 })
      await wrapper.vm.$nextTick()
      await wrapper.get('[data-testid="cut"]').trigger('click')
      expect(editor.clipboard).toEqual({ channels: 1, steps: 1, rows: [[0]] })
      expect(steps(1)).toEqual([])
      wrapper.unmount()
    })

    it('answers Ctrl+C, Ctrl+X, Ctrl+V and Delete outside text fields', async () => {
      const store = useSongStore()
      const transport = useTransportStore()
      const editor = useEditorStore()
      const wrapper = mount(SequencerGrid, { attachTo: document.body })
      const steps = (c: number) => store.song.sections[0]!.steps[store.song.channels[c]!.id] ?? []
      store.setStep(store.song.sections[0]!.id, store.song.channels[2]!.id, 3, true)

      // Nothing selected and nothing copied: the keys are left to the browser.
      expect(key({ key: 'c', ctrlKey: true }).defaultPrevented).toBe(false)
      expect(key({ key: 'v', ctrlKey: true }).defaultPrevented).toBe(false)
      expect(key({ key: 'Delete' }).defaultPrevented).toBe(false)

      editor.selectCell({ channel: 2, step: 3 })
      expect(key({ key: 'c', metaKey: true }).defaultPrevented).toBe(true)
      expect(editor.clipboard).toEqual({ channels: 1, steps: 1, rows: [[0]] })
      transport.seekToStep(10)
      expect(key({ key: 'V', ctrlKey: true }).defaultPrevented).toBe(true)
      expect(steps(2)).toEqual([3, 10])
      expect(key({ key: 'Backspace' }).defaultPrevented).toBe(true)
      expect(steps(2)).toEqual([3])
      editor.selectCell({ channel: 2, step: 3 })
      expect(key({ key: 'x', ctrlKey: true }).defaultPrevented).toBe(true)
      expect(steps(2)).toEqual([])
      expect(editor.clipboard).toEqual({ channels: 1, steps: 1, rows: [[0]] })

      // Other modifier combinations, and keys typed into an input, are not for the grid.
      expect(key({ key: 'v', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false)
      expect(key({ key: 'v', ctrlKey: true, altKey: true }).defaultPrevented).toBe(false)
      expect(steps(2)).toEqual([])
      const input = document.createElement('input')
      document.body.appendChild(input)
      const typed = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, cancelable: true, bubbles: true })
      input.dispatchEvent(typed)
      expect(typed.defaultPrevented).toBe(false)
      expect(steps(2)).toEqual([])
      input.remove()

      // Unmounting drops the listener.
      wrapper.unmount()
      editor.selectCell({ channel: 2, step: 3 })
      expect(key({ key: 'c', ctrlKey: true }).defaultPrevented).toBe(false)
    })
  })

  describe('cursor placement', () => {
    /** Give a header a layout so a click lands on the step under the pointer. */
    function layOut(el: Element, rect: { left: number; top: number; width: number; height: number }) {
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
      })
    }

    it('puts the cursor at the step clicked on a section header or a bar number', async () => {
      const store = useSongStore()
      const transport = useTransportStore()
      store.addSection({ bars: 2 })
      const wrapper = mount(SequencerGrid, { attachTo: document.body })
      const header = wrapper.get('[data-testid="grid-section-1"]')
      expect(header.attributes('role')).toBe('button')
      // Without a layout (jsdom), a click is the start of the header.
      await header.trigger('click')
      expect(transport.currentStep).toBe(64)
      expect(transport.paused).toBe(true)

      // Section 2 spans 32 steps over 640 px: a click 330 px in is its 17th step.
      layOut(header.element, { left: 100, top: 0, width: 640, height: 32 })
      await header.trigger('click', { clientX: 430, clientY: 10 })
      expect(transport.currentStep).toBe(64 + 16)
      // Clamped to the header's own steps when the pointer is past its edge.
      await header.trigger('click', { clientX: 2000, clientY: 10 })
      expect(transport.currentStep).toBe(64 + 31)

      const bar = wrapper.get('[data-testid="bar-label-5"]')
      expect(bar.attributes('aria-label')).toBe('Put the cursor at Section 2 bar 2')
      layOut(bar.element, { left: 50, top: 0, width: 160, height: 18 })
      await bar.trigger('click', { clientX: 95, clientY: 10 })
      expect(transport.currentStep).toBe(64 + 16 + 4)

      // Enter and Space put it at the start.
      await bar.trigger('keydown.space')
      expect(transport.currentStep).toBe(64 + 16)
      await header.trigger('keydown.enter')
      expect(transport.currentStep).toBe(64)
      await wrapper.get('[data-testid="grid-section-0"]').trigger('keydown.enter')
      expect(transport.currentStep).toBe(-1)
      expect(transport.paused).toBe(false)
      wrapper.unmount()
    })

    it('reads the pointer along the time axis of each orientation', async () => {
      const transport = useTransportStore()
      const ui = useUiStore()
      const wrapper = mount(SequencerGrid, { attachTo: document.body })
      const header = wrapper.get('[data-testid="grid-section-0"]')
      // 64 steps over 640 px (or 640 px tall when vertical): 10 px per step.
      layOut(header.element, { left: 100, top: 100, width: 640, height: 640 })

      await header.trigger('click', { clientX: 125, clientY: 725 })
      expect(transport.currentStep).toBe(2)
      ui.setTrackOrientation('rtl')
      await header.trigger('click', { clientX: 125, clientY: 725 })
      expect(transport.currentStep).toBe(61)
      ui.setTrackOrientation('ttb')
      await header.trigger('click', { clientX: 125, clientY: 725 })
      expect(transport.currentStep).toBe(62)
      ui.setTrackOrientation('btt')
      await header.trigger('click', { clientX: 125, clientY: 725 })
      expect(transport.currentStep).toBe(1)
      wrapper.unmount()
    })
  })

  describe('track orientation', () => {
    it('lays the tracks out left to right unless the editor preference says otherwise', async () => {
      const ui = useUiStore()
      const wrapper = mount(SequencerGrid)
      const grid = wrapper.get('[data-testid="grid"]')
      const header = () => wrapper.get('[data-testid="channel-header-1"]')
      expect(grid.attributes('data-orientation')).toBe('ltr')
      expect(grid.classes()).toEqual(expect.arrayContaining(['horizontal', 'orient-ltr']))
      // Channels are rows: their headers keep the one-line layout and the move buttons point up and down.
      expect(header().classes()).not.toContain('vertical')
      expect(header().get('[data-testid="channel-up"]').attributes('title')).toBe('Move up')

      ui.setTrackOrientation('rtl')
      await wrapper.vm.$nextTick()
      expect(grid.attributes('data-orientation')).toBe('rtl')
      expect(grid.classes()).toEqual(expect.arrayContaining(['horizontal', 'orient-rtl']))
      expect(grid.classes()).not.toContain('orient-ltr')
      expect(header().classes()).not.toContain('vertical')

      ui.setTrackOrientation('ttb')
      await wrapper.vm.$nextTick()
      expect(grid.attributes('data-orientation')).toBe('ttb')
      expect(grid.classes()).toEqual(expect.arrayContaining(['vertical', 'orient-ttb']))
      expect(grid.classes()).not.toContain('horizontal')
      // Channels are columns ordered left to right.
      expect(header().classes()).toContain('vertical')
      expect(header().get('[data-testid="channel-up"]').attributes('title')).toBe('Move left')
      expect(header().get('[data-testid="channel-down"]').attributes('title')).toBe('Move right')

      ui.setTrackOrientation('btt')
      await wrapper.vm.$nextTick()
      expect(grid.classes()).toEqual(expect.arrayContaining(['vertical', 'orient-btt']))
      expect(header().classes()).toContain('vertical')
      // The cells themselves are the same elements whichever way they run.
      expect(wrapper.findAll('[data-testid="channel-row-0"] .cell')).toHaveLength(64)
    })

    it('tells the section, bar and loop cells how many steps they span', () => {
      const store = useSongStore()
      store.addSection({ bars: 2 })
      const wrapper = mount(SequencerGrid)
      const span = (selector: string) =>
        (wrapper.get(selector).element as HTMLElement).style.getPropertyValue('--span')
      expect(span('[data-testid="grid-section-0"]')).toBe('64')
      expect(span('[data-testid="grid-section-1"]')).toBe('32')
      expect(span('[data-testid="loop-bar-0"]')).toBe('16')
      expect(span('[data-testid="loop-bar-5"]')).toBe('16')
      expect(wrapper.findAll('.bar-label').map((b) => (b.element as HTMLElement).style.getPropertyValue('--span'))).toEqual(
        Array(6).fill('16'),
      )
    })

    it('scrolls back to the start of the song when the orientation changes', async () => {
      const ui = useUiStore()
      const wrapper = mount(SequencerGrid, { attachTo: document.body })
      const el = wrapper.get('[data-testid="grid"]').element as HTMLElement
      // jsdom does no layout, so record the scroll positions being written instead.
      const writes: Array<[string, number]> = []
      Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => 0, set: (v: number) => writes.push(['left', v]) })
      Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => 0, set: (v: number) => writes.push(['top', v]) })
      Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 1234 })
      const scrollIntoView = vi.fn()
      el.scrollIntoView = scrollIntoView

      // Bottom to top: the start is at the bottom edge, so scroll all the way down, and
      // bring the page down to the foot of the grid, since vertical tracks run down the page.
      ui.setTrackOrientation('btt')
      await flushPromises()
      expect(writes).toEqual([
        ['left', 0],
        ['top', 1234],
      ])
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end' })

      // Right to left: 0 is the right edge of a right-to-left scroller, and the page stays put.
      writes.length = 0
      ui.setTrackOrientation('rtl')
      await flushPromises()
      expect(writes).toEqual([
        ['left', 0],
        ['top', 0],
      ])
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })
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
