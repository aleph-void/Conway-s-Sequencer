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
    await wrapper.get('[data-testid="play-gate-note"]').setValue('100')
    expect(store.song.settings.playGateNote).toBe(100)
    expect(wrapper.text()).toContain('play gate on E7 (100)')
    expect(wrapper.text()).toContain("module's 64th output is note 111")
  })
})
