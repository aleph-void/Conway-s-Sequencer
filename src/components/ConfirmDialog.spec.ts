import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'

describe('ConfirmDialog', () => {
  it('focuses Cancel, keeps Tab inside the box and reports the choice', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { title: 'Sure?' },
      slots: { default: '<p>Body text</p>' },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    const cancel = wrapper.get('[data-testid="confirm-cancel"]')
    const accept = wrapper.get('[data-testid="confirm-accept"]')
    const box = wrapper.get('[role="dialog"]')
    expect(document.activeElement).toBe(cancel.element)
    expect(cancel.text()).toBe('Cancel')
    expect(accept.text()).toBe('OK')
    expect(accept.classes()).toContain('primary')
    expect(box.attributes('aria-modal')).toBe('true')
    expect(document.getElementById(box.attributes('aria-labelledby')!)?.textContent).toBe('Sure?')
    expect(document.getElementById(box.attributes('aria-describedby')!)?.textContent).toContain('Body text')

    // Tab wraps at either end; in the middle the browser moves focus as usual.
    await cancel.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(accept.element)
    await accept.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(cancel.element)
    await cancel.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(cancel.element)
    // Focus that got out of the box is brought back in.
    ;(cancel.element as HTMLButtonElement).blur()
    expect(document.activeElement).toBe(document.body)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }))
    expect(document.activeElement).toBe(cancel.element)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    expect(document.activeElement).toBe(cancel.element)

    await accept.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toBeUndefined()
    await cancel.trigger('click')
    await wrapper.get('[data-testid="confirm-backdrop"]').trigger('click')
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    cancel.element.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    await nextTick()
    expect(wrapper.emitted('cancel')).toHaveLength(3)

    // The key listener goes with the component.
    const cancels = wrapper.emitted('cancel')!
    wrapper.unmount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(cancels).toHaveLength(3)
  })

  it('stops Escape before anything behind the box sees it', async () => {
    const wrapper = mount(ConfirmDialog, { props: { title: 'Sure?' }, attachTo: document.body })
    let seen = 0
    const behind = () => {
      seen += 1
    }
    window.addEventListener('keydown', behind)
    await wrapper.get('[data-testid="confirm-cancel"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(seen).toBe(0)
    // The same holds when focus is on the body, so the key lands on the window itself.
    ;(document.activeElement as HTMLElement | null)?.blur()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    expect(wrapper.emitted('cancel')).toHaveLength(2)
    expect(seen).toBe(0)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))
    expect(seen).toBe(1)
    window.removeEventListener('keydown', behind)
    wrapper.unmount()
  })

  it('labels a destructive confirmation', () => {
    const wrapper = mount(ConfirmDialog, {
      props: { title: 'Delete?', confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true },
    })
    const accept = wrapper.get('[data-testid="confirm-accept"]')
    expect(accept.text()).toBe('Delete')
    expect(accept.classes()).toContain('danger')
    expect(accept.classes()).not.toContain('primary')
    expect(wrapper.get('[data-testid="confirm-cancel"]').text()).toBe('Keep')
    wrapper.unmount()
  })
})
