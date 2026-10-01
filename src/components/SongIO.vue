<script setup lang="ts">
import { computed, ref } from 'vue'
import { songFileName } from '../core/serialization'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'

const store = useSongStore()
const transport = useTransportStore()
const fileInput = ref<HTMLInputElement | null>(null)

/** Read a File as text; falls back to FileReader for engines without Blob.text(). */
function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('could not read file'))
    reader.readAsText(file)
  })
}
const message = ref<string | null>(null)
const error = ref<string | null>(null)

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Live autosave status line, driven by the store's save state. */
const autosave = computed(() => {
  switch (store.saveState) {
    case 'unavailable':
      return { text: 'Autosave is unavailable in this browser. Export to keep a copy.', tone: 'status-warn' }
    case 'pending':
      return { text: 'Saving…', tone: 'muted' }
    case 'saved':
      return {
        text: store.lastSavedAt === null ? 'Autosaved.' : `Autosaved at ${formatTime(store.lastSavedAt)}.`,
        tone: 'status-ok',
      }
    case 'error':
      return {
        text: 'Autosave failed: browser storage is full or disabled. Export to keep a copy.',
        tone: 'status-bad',
      }
    default:
      return { text: 'Songs autosave in this browser; open them from the Song browser tab.', tone: 'muted' }
  }
})

function exportSong() {
  const json = store.exportJson()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = songFileName(store.song)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  message.value = `Exported ${a.download}`
  error.value = null
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await readText(file)
    transport.stop()
    store.importJson(text)
    message.value = `Loaded "${store.song.name}"`
    error.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    message.value = null
  }
}

function newSong() {
  const previous = store.song.name.trim() || 'Untitled'
  transport.stop()
  store.newSong()
  message.value = `New song. "${previous}" is kept in the Song browser.`
  error.value = null
}
</script>

<template>
  <section class="panel" aria-labelledby="song-heading">
    <h2 id="song-heading">Song</h2>
    <div class="row">
      <button data-testid="new-song" @click="newSong">New</button>
      <button data-testid="export-song" @click="exportSong">Export JSON</button>
      <button data-testid="import-song" @click="fileInput?.click()">Import JSON</button>
      <input
        ref="fileInput"
        class="sr-only"
        type="file"
        accept="application/json,.json"
        aria-label="Import song file"
        data-testid="import-file"
        @change="onFile"
      />
    </div>
    <p v-if="error" class="status-bad msg" data-testid="io-error">{{ error }}</p>
    <p v-else-if="message" class="muted msg" data-testid="io-message">{{ message }}</p>
    <p
      class="msg"
      :class="autosave.tone"
      role="status"
      aria-live="polite"
      data-testid="autosave-status"
      :data-save-state="store.saveState"
    >
      {{ autosave.text }}
    </p>
  </section>
</template>

<style scoped>
.msg {
  margin: 10px 0 0;
  font-size: 12px;
}
</style>
