import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'
import ModuleView from './ModuleView.vue'

describe('ModuleView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('draws the 64 outputs with the song mapped onto them', () => {
    const wrapper = mount(ModuleView)
    const outputs = wrapper.findAll('[data-testid^="module-output-"]')
    expect(outputs).toHaveLength(64)
    expect(outputs[0]!.text()).toBe('1')
    expect(outputs[63]!.text()).toBe('64')
    // The default song's 8 channels sit on outputs 1-8, the clock on 63 and the gate on 64.
    for (let i = 1; i <= 8; i++) {
      expect(wrapper.get(`[data-testid="module-output-${i}"]`).classes()).toContain('channel')
    }
    expect(wrapper.get('[data-testid="module-output-9"]').classes()).not.toContain('assigned')
    expect(wrapper.get('[data-testid="module-output-63"]').classes()).toContain('clock')
    expect(wrapper.get('[data-testid="module-output-64"]').classes()).toContain('play')
    expect(wrapper.get('[data-testid="module-output-1"]').attributes('title')).toBe('Output 1 · note 36 (C2) · Out 1 · low')
    expect(wrapper.get('[data-testid="module-output-9"]').attributes('title')).toBe('Output 9 · note 44 (G#2) · unused · low')
    expect(wrapper.get('[data-testid="module-output-64"]').attributes('title')).toBe('Output 64 · note 99 (D#7) · Play gate · low')
    expect(wrapper.get('[data-testid="module-high"]').text()).toBe('none')
    expect(wrapper.find('[data-testid="module-silent"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="module-off-panel"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Output 1 = C2 (36)')
  })

  it('lights the outputs that are high while the song plays and clears them on stop', async () => {
    const song = useSongStore()
    const transport = useTransportStore()
    const sec = song.song.sections[0]!
    song.toggleStep(sec.id, song.song.channels[1]!.id, 0)
    const wrapper = mount(ModuleView)
    const high = (n: number) => wrapper.get(`[data-testid="module-output-${n}"]`).attributes('data-high')

    transport.play()
    await nextTick()
    expect(high(2)).toBe('true')
    expect(high(63)).toBe('true')
    expect(high(64)).toBe('true')
    expect(high(1)).toBe('false')
    expect(wrapper.get('[data-testid="module-output-2"]').classes()).toContain('high')
    expect(wrapper.get('[data-testid="module-output-2"]').attributes('title')).toContain('· high')
    expect(wrapper.get('[data-testid="module-high"]').text()).toBe('2, 63, 64')

    // 20 ms in: the clock's 15.6 ms pulse is over, the drawn gate still holds. The cursor is
    // moved by hand: the transport advances it per animation frame, which fake timers do not drive.
    transport.positionSeconds = 0.02
    await nextTick()
    expect(high(63)).toBe('false')
    expect(high(2)).toBe('true')
    expect(high(64)).toBe('true')

    // 200 ms in: step 1 is empty, so the gate has dropped.
    transport.positionSeconds = 0.2
    await nextTick()
    expect(high(2)).toBe('false')
    expect(high(64)).toBe('true')

    transport.stop()
    await nextTick()
    expect(high(64)).toBe('false')
    expect(wrapper.get('[data-testid="module-high"]').text()).toBe('none')
  })

  it('follows edits to the mapping and warns when a note leaves the panel', async () => {
    const song = useSongStore()
    const wrapper = mount(ModuleView)
    song.updateChannel(song.song.channels[0]!.id, { output: 20, name: 'Snare' })
    await nextTick()
    expect(wrapper.get('[data-testid="module-output-1"]').classes()).not.toContain('assigned')
    expect(wrapper.get('[data-testid="module-output-21"]').attributes('title')).toContain('Snare')

    song.updateSettings({ baseNote: 20 })
    await nextTick()
    expect(wrapper.get('[data-testid="module-off-panel"]').text()).toContain('x16 clock (note 98), Play gate (note 99)')
    expect(wrapper.get('[data-testid="module-output-64"]').classes()).not.toContain('play')
    expect(wrapper.text()).toContain('Output 1 = G#0 (20)')

    // Two sources on one output (the play gate moved onto Snare's note 56) are flagged.
    song.updateSettings({ baseNote: 36, playGateNote: 56 })
    await nextTick()
    const shared = wrapper.get('[data-testid="module-output-21"]')
    expect(shared.classes()).toContain('shared')
    expect(shared.classes()).toContain('channel')
    expect(shared.attributes('title')).toContain('Snare + Play gate')
    expect(wrapper.get('[data-testid="module-output-64"]').classes()).not.toContain('assigned')
  })

  it('marks outputs whose note leaves MIDI as invalid', () => {
    const song = useSongStore()
    song.updateSettings({ baseNote: 66 })
    const wrapper = mount(ModuleView)
    const last = wrapper.get('[data-testid="module-output-64"]')
    expect(last.classes()).toContain('invalid')
    expect(last.attributes('title')).toContain('outside MIDI')
    expect(wrapper.get('[data-testid="module-output-62"]').attributes('title')).toContain('note 127')
  })
})
