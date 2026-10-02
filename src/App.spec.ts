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

  it('shows the module view from the settings drawer and remembers it', async () => {
    localStorage.clear()
    const wrapper = mount(App, { global: { plugins: [createPinia()] } })
    // The switch lives with the other editor settings, not in the toolbar.
    const toggle = wrapper.get('[data-testid="editor-panel"] [data-testid="toggle-module-view"]')
    expect(wrapper.find('.toolbar [data-testid="toggle-module-view"]').exists()).toBe(false)
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.find('[data-testid="module-view"]').exists()).toBe(false)

    await toggle.setValue(true)
    expect((toggle.element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('[data-testid="module-view"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid^="module-output-"]')).toHaveLength(64)
    // The grid stays alongside it.
    expect(wrapper.find('[data-testid="grid"]').exists()).toBe(true)

    // The view stays up when the drawer that holds its switch is closed.
    await wrapper.get('[data-testid="toggle-settings"]').trigger('click')
    expect(wrapper.find('[data-testid="toggle-module-view"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="module-view"]').exists()).toBe(true)
    await wrapper.get('[data-testid="toggle-settings"]').trigger('click')

    const again = mount(App, { global: { plugins: [createPinia()] } })
    expect(again.find('[data-testid="module-view"]').exists()).toBe(true)
    const againToggle = again.get('[data-testid="toggle-module-view"]')
    expect((againToggle.element as HTMLInputElement).checked).toBe(true)
    await againToggle.setValue(false)
    expect(again.find('[data-testid="module-view"]').exists()).toBe(false)
  })

  it('changes the track orientation from the settings drawer and remembers it', async () => {
    localStorage.clear()
    const wrapper = mount(App, { global: { plugins: [createPinia()] } })
    expect(wrapper.get('[data-testid="grid"]').attributes('data-orientation')).toBe('ltr')
    expect(wrapper.get('.app').classes()).not.toContain('tracks-vertical')
    await wrapper.get('[data-testid="track-orientation"]').setValue('ttb')
    expect(wrapper.get('[data-testid="grid"]').attributes('data-orientation')).toBe('ttb')
    expect(wrapper.get('[data-testid="channel-header-0"]').classes()).toContain('vertical')
    // Vertical tracks run down the page: the shell lets go of the viewport height.
    expect(wrapper.get('.app').classes()).toContain('tracks-vertical')
    await wrapper.get('[data-testid="track-orientation"]').setValue('rtl')
    expect(wrapper.get('.app').classes()).not.toContain('tracks-vertical')
    await wrapper.get('[data-testid="track-orientation"]').setValue('btt')
    expect(wrapper.get('.app').classes()).toContain('tracks-vertical')

    const again = mount(App, { global: { plugins: [createPinia()] } })
    expect(again.get('[data-testid="grid"]').attributes('data-orientation')).toBe('btt')
    expect(again.get('.app').classes()).toContain('tracks-vertical')
    expect((again.get('[data-testid="track-orientation"]').element as HTMLSelectElement).value).toBe('btt')
  })

  it('renames the song from the header', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia()] } })
    await wrapper.get('[data-testid="song-name"]').setValue('My Patch')
    expect((wrapper.get('[data-testid="song-name"]').element as HTMLInputElement).value).toBe('My Patch')
  })
})
