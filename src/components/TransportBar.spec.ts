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

  it('plays and stops from the button and shows the position readout', async () => {
    const wrapper = mount(TransportBar, { attachTo: document.body })
    const transport = useTransportStore()
    const play = wrapper.get('[data-testid="play"]')
    expect(play.text()).toContain('Play')
    expect(wrapper.get('[data-testid="section-readout"]').text()).toBe('—')
    await play.trigger('click')
    expect(transport.playing).toBe(true)
    expect(play.text()).toContain('Stop')
    expect(wrapper.get('[data-testid="section-readout"]').text()).toContain('A · bar 1 · beat 1 · 120 BPM')
    expect(wrapper.text()).toContain('no MIDI output selected')
    await play.trigger('click')
    expect(transport.playing).toBe(false)
    wrapper.unmount()
  })

  it('responds to Space and Escape unless typing in a field', async () => {
    const wrapper = mount(TransportBar, { attachTo: document.body })
    const transport = useTransportStore()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(transport.playing).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(transport.playing).toBe(false)

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
