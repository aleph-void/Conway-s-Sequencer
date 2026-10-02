<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

/**
 * Service-worker status toasts. The app is precached on first visit so it keeps working
 * without a network; this tells the user when that is ready, when the browser is
 * offline, and when a newer build is waiting to be activated with a reload.
 */
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_url, registration) {
    // Look for a new build every hour while the tab stays open.
    if (registration) setInterval(() => registration.update(), 60 * 60 * 1000)
  },
})

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
function setOnline() {
  online.value = true
}
function setOffline() {
  online.value = false
}
onMounted(() => {
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOffline)
})
onBeforeUnmount(() => {
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOffline)
})

const showToast = computed(() => offlineReady.value || needRefresh.value)

function dismiss() {
  offlineReady.value = false
  needRefresh.value = false
}

/** How long to give the waiting worker to take over before reloading regardless. */
const RELOAD_FALLBACK_MS = 2500

const reloading = ref(false)
let reloadTimer: ReturnType<typeof setTimeout> | undefined
let reloaded = false

function reloadPage() {
  if (reloaded) return
  reloaded = true
  clearTimeout(reloadTimer)
  window.location.reload()
}

/**
 * Activate the waiting build and reload into it. The register script only reloads on its
 * own when a worker already controlled the page at registration time, so a hard refresh
 * or a first visit that then receives an update would swap the worker but never reload.
 * Reload ourselves as soon as the new worker takes control, and after a short grace
 * period in any case (the waiting worker may already have been activated by another tab).
 */
function reload() {
  if (reloading.value) return
  reloading.value = true
  navigator.serviceWorker?.addEventListener('controllerchange', reloadPage, { once: true })
  reloadTimer = setTimeout(reloadPage, RELOAD_FALLBACK_MS)
  updateServiceWorker(true).catch(reloadPage)
}

onBeforeUnmount(() => {
  clearTimeout(reloadTimer)
  navigator.serviceWorker?.removeEventListener('controllerchange', reloadPage)
})
</script>

<template>
  <span v-if="!online" class="offline-badge mono" role="status" data-testid="offline-badge">Offline</span>
  <div v-if="showToast" class="toast panel" role="status" aria-live="polite" data-testid="pwa-toast">
    <span v-if="needRefresh" class="message" data-testid="pwa-message">A new version of Conway's Sequencer is ready.</span>
    <span v-else class="message" data-testid="pwa-message">Ready to work offline.</span>
    <div class="actions">
      <button v-if="needRefresh" class="primary" :disabled="reloading" data-testid="pwa-reload" @click="reload">
        {{ reloading ? 'Reloading…' : 'Reload' }}
      </button>
      <button :disabled="reloading" data-testid="pwa-dismiss" @click="dismiss">Dismiss</button>
    </div>
  </div>
</template>

<style scoped>
.offline-badge {
  position: fixed;
  top: 10px;
  right: 14px;
  z-index: 20;
  padding: 3px 8px;
  border: 1px solid var(--warn);
  border-radius: var(--radius);
  color: var(--warn);
  background: var(--bg);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.toast {
  position: fixed;
  right: 16px;
  /* Clear of the footer line so the copyright stays readable underneath. */
  bottom: 44px;
  z-index: 20;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 14px;
  border-color: var(--accent-border);
  box-shadow: var(--shadow-glow);
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 8px;
}

/* Phones: the toast spans the width above the footer, with full-width buttons. */
@media (max-width: 767px) {
  .toast {
    left: 12px;
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    padding: 10px 12px;
  }

  .message {
    flex: 1 1 100%;
  }

  .actions {
    width: 100%;
  }

  .actions button {
    flex: 1;
  }
}
</style>
