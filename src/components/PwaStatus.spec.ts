import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const offlineReady = ref(false)
const needRefresh = ref(false)
const updateServiceWorker = vi.fn(() => Promise.resolve())
let registeredHook: ((url: string, registration?: { update: () => Promise<void> }) => void) | undefined

vi.mock('virtual:pwa-register/vue', () => ({
  useRegisterSW: (options?: { onRegisteredSW?: typeof registeredHook }) => {
    registeredHook = options?.onRegisteredSW
    return { offlineReady, needRefresh, updateServiceWorker }
  },
}))

import PwaStatus from './PwaStatus.vue'

describe('PwaStatus', () => {
  beforeEach(() => {
    offlineReady.value = false
    needRefresh.value = false
    updateServiceWorker.mockClear()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  it('shows nothing while online with nothing to report', () => {
    const wrapper = mount(PwaStatus)
    expect(wrapper.find('[data-testid="pwa-toast"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="offline-badge"]').exists()).toBe(false)
  })

  it('announces offline readiness and can be dismissed', async () => {
    const wrapper = mount(PwaStatus)
    offlineReady.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="pwa-message"]').text()).toBe('Ready to work offline.')
    expect(wrapper.find('[data-testid="pwa-reload"]').exists()).toBe(false)

    await wrapper.get('[data-testid="pwa-dismiss"]').trigger('click')
    expect(offlineReady.value).toBe(false)
    expect(wrapper.find('[data-testid="pwa-toast"]').exists()).toBe(false)
  })

  it('offers to reload when a new build is waiting', async () => {
    const wrapper = mount(PwaStatus)
    needRefresh.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="pwa-message"]').text()).toContain('new version')

    await wrapper.get('[data-testid="pwa-reload"]').trigger('click')
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('shows an offline badge that follows the browser connectivity events', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const wrapper = mount(PwaStatus, { attachTo: document.body })
    expect(wrapper.get('[data-testid="offline-badge"]').text()).toBe('Offline')

    window.dispatchEvent(new Event('online'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="offline-badge"]').exists()).toBe(false)

    window.dispatchEvent(new Event('offline'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="offline-badge"]').exists()).toBe(true)

    const removed = vi.spyOn(window, 'removeEventListener')
    wrapper.unmount()
    expect(removed).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removed).toHaveBeenCalledWith('offline', expect.any(Function))
    removed.mockRestore()
  })

  it('polls the registration for updates once registered', () => {
    vi.useFakeTimers()
    try {
      mount(PwaStatus)
      const update = vi.fn(() => Promise.resolve())
      registeredHook?.('/sw.js', { update })
      registeredHook?.('/sw.js', undefined)
      vi.advanceTimersByTime(60 * 60 * 1000)
      expect(update).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
