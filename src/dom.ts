/** Small helpers for reading DOM events, shared by the components. */

/** The numeric value of the input an event came from. */
export function numberFrom(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

/** Whether a key event came from a field that takes text, so global shortcuts must leave it alone. */
export function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  const tag = el?.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el?.isContentEditable === true
}
