import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSongStore } from '../stores/song'
import ChannelHeader from './ChannelHeader.vue'

describe('ChannelHeader', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  function mountFirst() {
    const store = useSongStore()
    const channel = store.song.channels[0]!
    const wrapper = mount(ChannelHeader, {
      props: { channel, index: 0, total: store.song.channels.length, baseNote: store.song.settings.baseNote },
    })
    return { store, channel, wrapper }
  }

  it('shows 1-based output numbers and edits name/output', async () => {
    const { store, channel, wrapper } = mountFirst()
    const output = wrapper.get('[data-testid="channel-output"]')
    expect((output.element as HTMLInputElement).value).toBe('1')
    await output.setValue('12')
    expect(channel.output).toBe(11)
    await wrapper.get('[data-testid="channel-name"]').setValue('Snare')
    expect(store.channelById(channel.id)?.name).toBe('Snare')
    expect(wrapper.get('.out').attributes('title')).toContain('47')
  })

  it('toggles mute and gate mode', async () => {
    const { channel, wrapper } = mountFirst()
    await wrapper.get('[data-testid="channel-mute"]').trigger('click')
    expect(channel.muted).toBe(true)
    await wrapper.get('[data-testid="channel-gate-mode"]').trigger('click')
    expect(channel.gateMode).toBe('tie')
    await wrapper.get('[data-testid="channel-gate-mode"]').trigger('click')
    expect(channel.gateMode).toBe('retrigger')
  })

  it('moves and removes the channel', async () => {
    const { store, channel, wrapper } = mountFirst()
    expect(wrapper.get('[data-testid="channel-up"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="channel-down"]').trigger('click')
    expect(store.song.channels[1]!.id).toBe(channel.id)
    await wrapper.get('[data-testid="channel-remove"]').trigger('click')
    expect(store.channelById(channel.id)).toBeUndefined()
  })
})
