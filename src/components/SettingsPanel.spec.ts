import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSongStore } from '../stores/song'
import SettingsPanel from './SettingsPanel.vue'

describe('SettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('edits and clamps module settings', async () => {
    const store = useSongStore()
    const wrapper = mount(SettingsPanel)
    await wrapper.get('[data-testid="midi-channel"]').setValue('10')
    await wrapper.get('[data-testid="base-note"]').setValue('48')
    await wrapper.get('[data-testid="velocity"]').setValue('500')
    expect(wrapper.find('[data-testid="gate-length"]').exists()).toBe(false)
    expect(store.song.settings).toMatchObject({ midiChannel: 10, baseNote: 48, velocity: 127 })
    expect(wrapper.text()).toContain('Output 1 = C3 (48)')
    expect(wrapper.text()).toContain('output 62 = C#8 (109)')
    expect(wrapper.text()).toContain('x16 clock on D7 (98)')
    expect(wrapper.text()).toContain('play gate on D#7 (99)')
  })
})
