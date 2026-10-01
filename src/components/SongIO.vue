<script setup lang="ts">
import { ref } from 'vue'
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
  if (typeof window !== 'undefined' && !window.confirm('Start a new song? Unsaved changes are lost.')) return
  transport.stop()
  store.newSong()
  message.value = 'New song'
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
    <p v-else class="muted msg">Songs autosave in this browser. Export to keep a copy.</p>
  </section>
</template>

<style scoped>
.msg {
  margin: 10px 0 0;
  font-size: 12px;
}
</style>
