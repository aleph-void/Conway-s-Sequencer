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

/** The loop points as shown to the user: 1-based, inclusive bar numbers, plus their times. */
const loopLabel = computed(() => {
  const range = song.song.settings.loopRange
  const seconds = song.loopSeconds
  if (!range || !seconds) return null
  const bars = range.end - range.start === 1 ? `bar ${range.start + 1}` : `bars ${range.start + 1}–${range.end}`
  return `${bars} · ${formatDuration(seconds.start)}–${formatDuration(seconds.end)}`
})

const loopTitle = computed(() =>
  song.song.settings.loopRange
    ? 'Repeat the bars between the loop points; unticked, play them once and stop'
    : 'Repeat the song; unticked, play it once and stop',
)

const playLabel = computed(() => {
  if (transport.playing) return '❙❙ Pause'
  return transport.paused ? '▶ Resume' : '▶ Play'
})

const playTitle = computed(() => {
  if (transport.playing) return 'Pause where the cursor is (Space)'
  return transport.paused ? 'Resume from the cursor (Space)' : 'Play from the start (Space)'
})

const sectionLabel = computed(() => {
  const pos = transport.position
  if ((!transport.playing && !transport.paused) || !pos) return '—'
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
  <section class="group transport" aria-labelledby="transport-heading">
    <h2 id="transport-heading" class="sr-only">Transport</h2>
    <div class="row">
      <button
        class="primary play"
        :aria-pressed="transport.playing"
        :disabled="song.duration <= 0"
        :title="playTitle"
        data-testid="play"
        @click="transport.toggle()"
      >
        {{ playLabel }}
      </button>
      <button
        title="Stop and return the cursor to the start"
        :disabled="!transport.playing && !transport.paused"
        data-testid="stop"
        @click="transport.stop()"
      >
        ■ Stop
      </button>
      <button
        title="Return the cursor to the start; playback, if running, restarts from there"
        :disabled="!transport.playing && !transport.paused"
        data-testid="reset"
        @click="transport.reset()"
      >
        ⏮ Reset
      </button>
      <button title="Stop and send note-off to every output (Esc)" data-testid="panic" @click="transport.panic()">
        Panic
      </button>
      <label class="check" :title="loopTitle">
        <span>Loop</span>
        <input v-model="loop" type="checkbox" data-testid="loop" />
      </label>
      <div class="readout mono">
        <span data-testid="position">{{ formatDuration(transport.positionSeconds) }}</span>
        <span class="muted"> / {{ formatDuration(song.duration) }}</span>
      </div>
    </div>
    <!--
      The loop points live on this line rather than in the row above: the toolbar wraps when the row
      grows, which would shift the grid under a pointer that is still dragging across the loop strip.
    -->
    <p class="meta">
      <span data-testid="section-readout">{{ sectionLabel }}</span>
      <span v-if="!midi.isConnected" class="status-warn"> · no MIDI output selected, playback is silent</span>
      <span v-if="loopLabel" class="loop-points" data-testid="loop-range">
        · <span class="loop-glyph" aria-hidden="true">⟲</span> loop {{ loopLabel }}
        <button
          class="loop-clear"
          type="button"
          title="Clear the loop points and play the whole song"
          aria-label="Clear the loop points"
          data-testid="loop-range-clear"
          @click="song.clearLoopRange()"
        >
          ✕
        </button>
      </span>
      <span class="muted hint"> · Space = play/pause, Esc = panic</span>
    </p>
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

.play {
  min-width: 108px;
}

.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.loop-points {
  color: var(--accent-bright);
  font-variant-numeric: tabular-nums;
}

.loop-glyph {
  font-size: 12px;
}

/* Kept shorter than the line so showing it never changes the height of the meta line. */
.loop-clear {
  min-height: 0;
  height: 14px;
  margin-left: 2px;
  padding: 0 4px;
  font-size: 9px;
  line-height: 1;
  vertical-align: text-bottom;
  border-radius: 3px;
  color: var(--text-dim);
}

.loop-clear:hover:not(:disabled) {
  color: var(--accent-bright);
}

.readout {
  margin-left: 6px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.meta {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /*
   * The line's text must not size the toolbar: as it gets longer (loop points set, no MIDI
   * output) the toolbar would wrap and grow, moving the grid under the pointer.
   */
  contain: inline-size;
}

/* Keyboard shortcuts mean nothing to a finger. */
@media (pointer: coarse) {
  .hint {
    display: none;
  }
}

@media (max-width: 767px) {
  .row > button {
    flex: 1 1 auto;
  }

  .play {
    min-width: 0;
  }

  .readout {
    margin-left: auto;
  }

  .meta {
    white-space: normal;
  }
}
</style>
