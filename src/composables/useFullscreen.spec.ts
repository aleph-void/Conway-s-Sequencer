import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useFullscreen } from './useFullscreen'

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: el })
}

function Host(target?: () => Element | null) {
  return defineComponent({
    setup() {
      const fs = useFullscreen(target)
      return { fs }
    },
    render() {
      return h('button', { onClick: () => this.fs.toggle() }, this.fs.active.value ? 'exit' : 'enter')
    },
  })
}

describe('useFullscreen', () => {
  afterEach(() => {
    setFullscreenElement(null)
    delete (document.documentElement as Partial<HTMLElement>).requestFullscreen
    delete (document as Partial<Document>).exitFullscreen
  })

  it('reports unsupported when the API is missing', () => {
    const wrapper = mount(Host())
    expect(wrapper.vm.fs.supported).toBe(false)
    expect(wrapper.vm.fs.active.value).toBe(false)
  })

  it('enters and exits full screen and follows fullscreenchange', async () => {
    const request = vi.fn(async () => setFullscreenElement(document.documentElement))
    const exit = vi.fn(async () => setFullscreenElement(null))
    document.documentElement.requestFullscreen = request
    document.exitFullscreen = exit

    const wrapper = mount(Host())
    expect(wrapper.vm.fs.supported).toBe(true)

    await wrapper.get('button').trigger('click')
    document.dispatchEvent(new Event('fullscreenchange'))
    await wrapper.vm.$nextTick()
    expect(request).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.fs.active.value).toBe(true)
    expect(wrapper.text()).toBe('exit')

    await wrapper.get('button').trigger('click')
    document.dispatchEvent(new Event('fullscreenchange'))
    await wrapper.vm.$nextTick()
    expect(exit).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.fs.active.value).toBe(false)

    wrapper.unmount()
    setFullscreenElement(document.documentElement)
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(wrapper.vm.fs.active.value).toBe(false)
  })

  it('swallows a refused request and does nothing when nothing to exit', async () => {
    document.documentElement.requestFullscreen = vi.fn(async () => {
      throw new Error('not allowed')
    })
    const exit = vi.fn(async () => {})
    document.exitFullscreen = exit
    const wrapper = mount(Host())
    await expect(wrapper.vm.fs.enter()).resolves.toBeUndefined()
    await wrapper.vm.fs.exit()
    expect(exit).not.toHaveBeenCalled()
    expect(wrapper.vm.fs.active.value).toBe(false)
  })

  it('does nothing when the target element is missing', async () => {
    const request = vi.fn(async () => {})
    document.documentElement.requestFullscreen = request
    const wrapper = mount(Host(() => null))
    await wrapper.vm.fs.enter()
    expect(request).not.toHaveBeenCalled()
  })
})
