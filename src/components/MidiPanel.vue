<script setup lang="ts">
import { computed } from 'vue'
import { useMidiStore } from '../stores/midi'

const midi = useMidiStore()

const selected = computed({
  get: () => midi.selectedOutputId ?? '',
  set: (value: string) => midi.selectOutput(value || null),
})

const statusText = computed(() => {
  switch (midi.status) {
    case 'unsupported':
      return 'Web MIDI is not available in this browser. Use Chrome, Edge or Opera.'
    case 'idle':
      return 'Click "Enable MIDI" to list your interfaces.'
    case 'requesting':
      return 'Waiting for permission…'
    case 'denied':
      return 'MIDI access was denied. Allow it in the site permissions and try again.'
    case 'error':
      return `Could not access MIDI: ${midi.error ?? 'unknown error'}`
    case 'ready':
      return midi.outputs.length === 0
        ? 'No MIDI outputs found. Connect your interface and it will appear here.'
        : midi.isConnected
          ? `Sending to ${midi.selectedOutput?.name}`
          : 'Select an output.'
  }
  return ''
})

const statusClass = computed(() => {
  if (midi.isConnected) return 'status-ok'
  if (midi.status === 'denied' || midi.status === 'error' || midi.status === 'unsupported') return 'status-bad'
  return 'status-warn'
})
</script>

<template>
  <section class="group" aria-labelledby="midi-heading">
    <h2 id="midi-heading" class="sr-only">MIDI output</h2>
    <div class="row">
      <button
        v-if="midi.status !== 'ready'"
        class="primary"
        :disabled="midi.status === 'requesting' || midi.status === 'unsupported'"
        data-testid="enable-midi"
        @click="midi.requestAccess()"
      >
        Enable MIDI
      </button>
      <label v-else>
        <span>Interface</span>
        <select v-model="selected" data-testid="midi-output" aria-label="MIDI output">
          <option value="">— choose an output —</option>
          <option v-for="o in midi.outputs" :key="o.id" :value="o.id">
            {{ o.name }}<template v-if="o.manufacturer"> ({{ o.manufacturer }})</template>
          </option>
        </select>
      </label>
      <button v-if="midi.status === 'ready'" class="icon" title="Rescan outputs" @click="midi.refreshOutputs()">
        ⟳
      </button>
    </div>
    <p class="status" :class="statusClass" data-testid="midi-status">{{ statusText }}</p>
  </section>
</template>

<style scoped>
.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.row {
  align-items: center;
}

.status {
  margin: 0;
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

label {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

select {
  min-width: 200px;
  max-width: 280px;
}
</style>
