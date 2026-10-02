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

  function mountAt(index: number) {
    const store = useSongStore()
    const channel = store.song.channels[index]!
    const wrapper = mount(ChannelHeader, {
      props: { channel, index, total: store.song.channels.length, baseNote: store.song.settings.baseNote },
    })
    return { store, channel, wrapper }
  }

  function mountFirst() {
    return mountAt(0)
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

  it('toggles mute', async () => {
    const { channel, wrapper } = mountFirst()
    await wrapper.get('[data-testid="channel-mute"]').trigger('click')
    expect(channel.muted).toBe(true)
    await wrapper.get('[data-testid="channel-mute"]').trigger('click')
    expect(channel.muted).toBe(false)
    expect(wrapper.find('[data-testid="channel-gate-mode"]').exists()).toBe(false)
  })

  it('toggles solo and shows an implied mute on the other channels', async () => {
    const { store, channel, wrapper } = mountFirst()
    const other = mountAt(1)
    const solo = wrapper.get('[data-testid="channel-solo"]')
    const mute = wrapper.get('[data-testid="channel-mute"]')
    const otherMute = other.wrapper.get('[data-testid="channel-mute"]')

    await solo.trigger('click')
    expect(channel.solo).toBe(true)
    expect(solo.attributes('aria-pressed')).toBe('true')
    // The soloed channel itself is not muted...
    expect(mute.classes()).not.toContain('implied')
    expect(wrapper.classes()).not.toContain('muted')
    // ...but every other channel shows the mute indicator without being muted outright.
    await other.wrapper.vm.$nextTick()
    expect(other.channel.muted).toBe(false)
    expect(otherMute.classes()).toContain('implied')
    expect(otherMute.attributes('aria-pressed')).toBe('false')
    expect(otherMute.attributes('title')).toBe('Muted by solo')
    expect(other.wrapper.classes()).toContain('muted')

    // Soloing the second channel lifts its implied mute: both are now soloed.
    await other.wrapper.get('[data-testid="channel-solo"]').trigger('click')
    expect(store.song.channels.filter((c) => c.solo)).toHaveLength(2)
    await wrapper.vm.$nextTick()
    expect(otherMute.classes()).not.toContain('implied')
    expect(other.wrapper.classes()).not.toContain('muted')
    expect(mute.classes()).not.toContain('implied')

    // Clearing both solos restores every channel.
    await solo.trigger('click')
    await other.wrapper.get('[data-testid="channel-solo"]').trigger('click')
    expect(store.song.channels.some((c) => c.solo)).toBe(false)
    expect(otherMute.attributes('title')).toBe('Mute')
  })

  it('points the move buttons sideways when the channel is a column', () => {
    const store = useSongStore()
    const channel = store.song.channels[1]!
    const wrapper = mount(ChannelHeader, {
      props: { channel, index: 1, total: store.song.channels.length, baseNote: 36, vertical: true },
    })
    expect(wrapper.classes()).toContain('vertical')
    expect(wrapper.get('[data-testid="channel-up"]').attributes('title')).toBe('Move left')
    expect(wrapper.get('[data-testid="channel-up"]').text()).toBe('←')
    expect(wrapper.get('[data-testid="channel-down"]').attributes('title')).toBe('Move right')
    expect(wrapper.get('[data-testid="channel-down"]').text()).toBe('→')

    // In a row the channels are ordered top to bottom.
    const row = mountAt(1).wrapper
    expect(row.classes()).not.toContain('vertical')
    expect(row.get('[data-testid="channel-up"]').attributes('title')).toBe('Move up')
    expect(row.get('[data-testid="channel-up"]').text()).toBe('↑')
    expect(row.get('[data-testid="channel-down"]').attributes('title')).toBe('Move down')
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
