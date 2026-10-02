import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { UI_STORAGE_KEY, useUiStore } from '../stores/ui'
import EditorPanel from './EditorPanel.vue'

describe('EditorPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('lists the four track orientations and sets the browser preference', async () => {
    const ui = useUiStore()
    const wrapper = mount(EditorPanel)
    const select = wrapper.get('[data-testid="track-orientation"]')
    expect(select.findAll('option').map((o) => o.text())).toEqual([
      'Left to right',
      'Right to left',
      'Top to bottom',
      'Bottom to top',
    ])
    expect((select.element as HTMLSelectElement).value).toBe('ltr')

    await select.setValue('btt')
    expect(ui.trackOrientation).toBe('btt')
    await nextTick()
    expect(JSON.parse(localStorage.getItem(UI_STORAGE_KEY)!)).toMatchObject({ trackOrientation: 'btt' })

    // The select follows the store too.
    ui.setTrackOrientation('rtl')
    await wrapper.vm.$nextTick()
    expect((select.element as HTMLSelectElement).value).toBe('rtl')
    expect(wrapper.text()).toContain('not part of the song')
  })
})
