import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import App from './App.vue'

describe('App', () => {
  it('mounts every panel with alephvoid.com branding', () => {
    localStorage.clear()
    const wrapper = mount(App, { global: { plugins: [createPinia()] } })
    expect(wrapper.get('h1').text()).toBe("Conway's Sequencer")
    expect(wrapper.findAll('a[href="https://alephvoid.com"]').length).toBeGreaterThanOrEqual(2)
    expect(wrapper.find('[data-testid="enable-midi"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="play"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sections-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="grid"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Nervous Squirrel')
  })

  it('renames the song from the header', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } })
    await wrapper.get('[data-testid="song-name"]').setValue('My Patch')
    expect((wrapper.get('[data-testid="song-name"]').element as HTMLInputElement).value).toBe('My Patch')
  })
})
