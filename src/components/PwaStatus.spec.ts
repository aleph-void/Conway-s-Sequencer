import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

/** Mirrors the component's grace period before it reloads without a controller change. */
const RELOAD_FALLBACK_MS = 2500

/**
 * jsdom has no service worker container: install a stub `navigator.serviceWorker` that
 * records listeners, and stub `location` so a reload is observable instead of fatal.
 */
function fakeServiceWorkerContainer() {
  const listeners = new Map<string, Set<EventListener>>()
  const container = {
    addEventListener: vi.fn((type: string, fn: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    }),
    removeEventListener: vi.fn((type: string, fn: EventListener) => listeners.get(type)?.delete(fn)),
    dispatch(type: string) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(new Event(type))
    },
  }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
  const reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })
  return { container, reload }
}

describe('PwaStatus', () => {
  beforeEach(() => {
    offlineReady.value = false
    needRefresh.value = false
    updateServiceWorker.mockClear()
    updateServiceWorker.mockImplementation(() => Promise.resolve())
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    // Back to jsdom's default: no service worker container at all.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker
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

  it('reloads the page once the new worker takes control, exactly once', async () => {
    vi.useFakeTimers()
    const { container, reload } = fakeServiceWorkerContainer()
    const wrapper = mount(PwaStatus)
    needRefresh.value = true
    await wrapper.vm.$nextTick()

    const button = wrapper.get('[data-testid="pwa-reload"]')
    await button.trigger('click')
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
    expect(button.text()).toBe('Reloading…')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="pwa-dismiss"]').attributes('disabled')).toBeDefined()
    expect(container.addEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function), { once: true })
    // Nothing happens until the browser swaps the controlling worker…
    expect(reload).not.toHaveBeenCalled()
    container.dispatch('controllerchange')
    expect(reload).toHaveBeenCalledTimes(1)
    // …and the fallback timer does not reload a second time.
    vi.advanceTimersByTime(RELOAD_FALLBACK_MS * 2)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(updateServiceWorker).toHaveBeenCalledTimes(1)
  })

  it('reloads anyway when no controller change arrives in time', async () => {
    vi.useFakeTimers()
    const { reload } = fakeServiceWorkerContainer()
    const wrapper = mount(PwaStatus)
    needRefresh.value = true
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid="pwa-reload"]').trigger('click')

    vi.advanceTimersByTime(RELOAD_FALLBACK_MS - 1)
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads when activating the waiting worker fails', async () => {
    vi.useFakeTimers()
    const { reload } = fakeServiceWorkerContainer()
    updateServiceWorker.mockImplementation(() => Promise.reject(new Error('no waiting worker')))
    const wrapper = mount(PwaStatus)
    needRefresh.value = true
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid="pwa-reload"]').trigger('click')
    await vi.advanceTimersByTimeAsync(0)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('works without a service worker container and cleans up its listener on unmount', async () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    expect(navigator.serviceWorker).toBeUndefined()
    const wrapper = mount(PwaStatus)
    needRefresh.value = true
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid="pwa-reload"]').trigger('click')
    vi.advanceTimersByTime(RELOAD_FALLBACK_MS)
    expect(reload).toHaveBeenCalledTimes(1)

    const { container } = fakeServiceWorkerContainer()
    const again = mount(PwaStatus)
    await again.get('[data-testid="pwa-reload"]').trigger('click')
    again.unmount()
    expect(container.removeEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function))
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
