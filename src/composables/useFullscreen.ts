import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Minimal wrapper around the Fullscreen API. `supported` is false where the
 * browser does not expose it (older Safari on iPhone, embedded webviews), so
 * the UI can hide the control instead of showing one that does nothing.
 */
export function useFullscreen(target: () => Element | null = () => document.documentElement) {
  const supported = typeof document !== 'undefined' && typeof document.documentElement?.requestFullscreen === 'function'
  const active = ref(false)

  function sync() {
    active.value = typeof document !== 'undefined' && document.fullscreenElement != null
  }

  async function enter() {
    const el = target()
    if (!supported || !el) return
    try {
      await el.requestFullscreen()
    } catch {
      /* the browser refused (no user gesture, iframe sandbox); state is synced by the event */
    }
  }

  async function exit() {
    if (!supported || !document.fullscreenElement) return
    try {
      await document.exitFullscreen()
    } catch {
      /* same as above */
    }
  }

  async function toggle() {
    if (document.fullscreenElement) await exit()
    else await enter()
  }

  onMounted(() => {
    sync()
    document.addEventListener('fullscreenchange', sync)
  })
  onBeforeUnmount(() => document.removeEventListener('fullscreenchange', sync))

  return { supported, active, enter, exit, toggle }
}
