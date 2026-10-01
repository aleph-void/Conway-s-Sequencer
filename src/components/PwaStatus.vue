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

function reload() {
  void updateServiceWorker(true)
}
</script>

<template>
  <span v-if="!online" class="offline-badge mono" role="status" data-testid="offline-badge">Offline</span>
  <div v-if="showToast" class="toast panel" role="status" aria-live="polite" data-testid="pwa-toast">
    <span v-if="needRefresh" data-testid="pwa-message">A new version of Conway's Sequencer is ready.</span>
    <span v-else data-testid="pwa-message">Ready to work offline.</span>
    <button v-if="needRefresh" class="primary" data-testid="pwa-reload" @click="reload">Reload</button>
    <button data-testid="pwa-dismiss" @click="dismiss">Dismiss</button>
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
  gap: 10px;
  padding: 10px 14px;
  border-color: var(--accent-border);
  box-shadow: var(--shadow-glow);
  font-size: 13px;
}
</style>
