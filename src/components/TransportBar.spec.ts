import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'
import TransportBar from './TransportBar.vue'

describe('TransportBar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('plays, pauses, resumes and stops from the buttons and shows the position readout', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    const wrapper = mount(TransportBar, { attachTo: document.body })
    const transport = useTransportStore()
    const play = wrapper.get('[data-testid="play"]')
    const stop = wrapper.get('[data-testid="stop"]')
    const reset = wrapper.get('[data-testid="reset"]')
    expect(play.text()).toContain('Play')
    expect(stop.attributes('disabled')).toBeDefined()
    expect(reset.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="section-readout"]').text()).toBe('—')

    await play.trigger('click')
    expect(transport.playing).toBe(true)
    expect(play.text()).toContain('Pause')
    expect(stop.attributes('disabled')).toBeUndefined()
    expect(reset.attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="section-readout"]').text()).toContain('A · bar 1 · beat 1 · 120 BPM')
    expect(wrapper.text()).toContain('no MIDI output selected')

    await vi.advanceTimersByTimeAsync(1100)
    await play.trigger('click')
    expect(transport.playing).toBe(false)
    expect(transport.paused).toBe(true)
    expect(play.text()).toContain('Resume')
    expect(wrapper.get('[data-testid="position"]').text()).toBe('0:01')
    expect(wrapper.get('[data-testid="section-readout"]').text()).toContain('A · bar 1 · beat 3')

    await play.trigger('click')
    expect(transport.playing).toBe(true)
    expect(play.text()).toContain('Pause')

    await stop.trigger('click')
    expect(transport.playing).toBe(false)
    expect(transport.paused).toBe(false)
    expect(play.text()).toContain('Play')
    expect(wrapper.get('[data-testid="position"]').text()).toBe('0:00')
    expect(wrapper.get('[data-testid="section-readout"]').text()).toBe('—')
    wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('reset returns the cursor to the start', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    const wrapper = mount(TransportBar)
    const transport = useTransportStore()
    transport.play()
    await vi.advanceTimersByTimeAsync(1100)
    await wrapper.get('[data-testid="reset"]').trigger('click')
    expect(transport.playing).toBe(true)
    expect(wrapper.get('[data-testid="position"]').text()).toBe('0:00')
    transport.pause()
    await vi.advanceTimersByTimeAsync(0)
    expect(transport.paused).toBe(false) // paused at 0 is just stopped
    transport.play()
    await vi.advanceTimersByTimeAsync(1100)
    transport.pause()
    await wrapper.get('[data-testid="reset"]').trigger('click')
    expect(transport.paused).toBe(false)
    expect(wrapper.get('[data-testid="play"]').text()).toContain('Play')
    wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('responds to Space and Escape unless typing in a field', async () => {
    const wrapper = mount(TransportBar, { attachTo: document.body })
    const transport = useTransportStore()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(transport.playing).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(transport.playing).toBe(false)
    transport.play()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(transport.playing).toBe(false)
    expect(transport.paused).toBe(false)

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(transport.playing).toBe(false)
    input.remove()
    wrapper.unmount()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(transport.playing).toBe(false)
  })

  it('toggles loop and triggers panic', async () => {
    const wrapper = mount(TransportBar)
    const song = useSongStore()
    const transport = useTransportStore()
    await wrapper.get('[data-testid="loop"]').setValue(false)
    expect(song.song.settings.loop).toBe(false)
    transport.play()
    await wrapper.get('[data-testid="panic"]').trigger('click')
    expect(transport.playing).toBe(false)
  })

  it('disables play when the song is empty', () => {
    const song = useSongStore()
    song.removeSection(song.song.sections[0]!.id)
    const wrapper = mount(TransportBar)
    expect(wrapper.get('[data-testid="play"]').attributes('disabled')).toBeDefined()
  })
})
