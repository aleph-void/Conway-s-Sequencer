<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { formatDuration } from '../core/timing'
import { useMidiStore } from '../stores/midi'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'

const transport = useTransportStore()
const song = useSongStore()
const midi = useMidiStore()

const loop = computed({
  get: () => song.song.settings.loop,
  set: (value: boolean) => song.updateSettings({ loop: value }),
})

const sectionLabel = computed(() => {
  const pos = transport.position
  if (!transport.playing || !pos) return '—'
  const section = song.song.sections[pos.sectionIndex]
  const timing = song.timeline[pos.sectionIndex]
  if (!section || !timing) return '—'
  const bar = Math.floor(pos.stepInSection / timing.stepsPerBar) + 1
  const beat = Math.floor((pos.stepInSection % timing.stepsPerBar) / section.subdivision) + 1
  return `${section.name} · bar ${bar} · beat ${beat} · ${timing.tempo} BPM`
})

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const tag = target?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target?.isContentEditable) return
  if (event.code === 'Space') {
    event.preventDefault()
    transport.toggle()
  } else if (event.key === 'Escape') {
    transport.panic()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <section class="panel transport" aria-labelledby="transport-heading">
    <h2 id="transport-heading">Transport</h2>
    <div class="row">
      <button
        class="primary play"
        :aria-pressed="transport.playing"
        :disabled="song.duration <= 0"
        data-testid="play"
        @click="transport.toggle()"
      >
        {{ transport.playing ? '■ Stop' : '▶ Play' }}
      </button>
      <button title="Stop and send note-off to every output (Esc)" data-testid="panic" @click="transport.panic()">
        Panic
      </button>
      <label class="check">
        <span>Loop</span>
        <input v-model="loop" type="checkbox" data-testid="loop" />
      </label>
      <div class="readout mono">
        <span data-testid="position">{{ formatDuration(transport.positionSeconds) }}</span>
        <span class="muted"> / {{ formatDuration(song.duration) }}</span>
      </div>
    </div>
    <p class="meta">
      <span data-testid="section-readout">{{ sectionLabel }}</span>
      <span v-if="!midi.isConnected" class="status-warn"> · no MIDI output selected, playback is silent</span>
      <span class="muted hint"> · Space = play/stop, Esc = panic</span>
    </p>
  </section>
</template>

<style scoped>
.play {
  min-width: 96px;
}

.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.readout {
  margin-left: auto;
  font-size: 16px;
}

.meta {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-dim);
}
</style>
