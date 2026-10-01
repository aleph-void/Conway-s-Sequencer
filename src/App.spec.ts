import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import App from './App.vue'

describe('App', () => {
  it('mounts every panel with Aleph Void branding', () => {
    localStorage.clear()
    const wrapper = mount(App, { global: { plugins: [createPinia()] } })
    expect(wrapper.get('h1').text()).toBe("Conway's Sequencer")
    expect(wrapper.findAll('a[href="https://alephvoid.com"]').length).toBeGreaterThanOrEqual(2)
    expect(wrapper.findAll('[data-testid="brand-logo"]').length).toBeGreaterThanOrEqual(2)
    expect(wrapper.text()).toContain('Aleph Void, LLC')
    expect(wrapper.find('[data-testid="enable-midi"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="play"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sections-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="song-browser-tab"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Nervous Squirrel')
  })

  it('collapses the settings drawer and remembers the choice', async () => {
    localStorage.clear()
    const wrapper = mount(App, { global: { plugins: [createPinia()] } })
    const toggle = wrapper.get('[data-testid="toggle-settings"]')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(true)

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="settings-drawer"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sections-table"]').exists()).toBe(false)
    // The editor and transport stay available while the drawer is closed.
    expect(wrapper.find('[data-testid="grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="play"]').exists()).toBe(true)

    const again = mount(App, { global: { plugins: [createPinia()] } })
    expect(again.find('[data-testid="settings-drawer"]').exists()).toBe(false)
    await again.get('[data-testid="toggle-settings"]').trigger('click')
    expect(again.find('[data-testid="sections-table"]').exists()).toBe(true)
  })

  it('renames the song from the header', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } })
    await wrapper.get('[data-testid="song-name"]').setValue('My Patch')
    expect((wrapper.get('[data-testid="song-name"]').element as HTMLInputElement).value).toBe('My Patch')
  })
})
