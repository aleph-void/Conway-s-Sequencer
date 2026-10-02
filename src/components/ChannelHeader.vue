<script setup lang="ts">
import { computed } from 'vue'
import { noteName } from '../core/midi'
import { MAX_CHANNELS, isChannelSilenced, type Channel } from '../core/song'
import { useSongStore } from '../stores/song'

const props = defineProps<{
  channel: Channel
  index: number
  baseNote: number
  total: number
  /**
   * The channel is a column rather than a row (the grid's track orientation is top to bottom
   * or bottom to top): the header tops the column and the channels are ordered left to right.
   */
  vertical?: boolean
}>()
const store = useSongStore()

/** Silenced overall: muted outright, or another channel is soloed and this one is not. */
const silenced = computed(() => isChannelSilenced(props.channel, store.song.channels))
/** Muted only because of another channel's solo; the M button shows it without being "on". */
const mutedBySolo = computed(() => silenced.value && !props.channel.muted)

function onOutput(event: Event) {
  // The UI shows 1-based outputs to match the module's panel labels.
  store.updateChannel(props.channel.id, { output: Number((event.target as HTMLInputElement).value) - 1 })
}

function remove() {
  store.removeChannel(props.channel.id)
}
</script>

<template>
  <div class="channel-header" :class="{ muted: silenced, vertical }" :data-testid="`channel-header-${index}`">
    <div class="ident">
      <span class="swatch" aria-hidden="true" data-testid="channel-swatch" />
      <input
        class="name"
        type="text"
        :value="channel.name"
        aria-label="Channel name"
        data-testid="channel-name"
        @change="store.updateChannel(channel.id, { name: ($event.target as HTMLInputElement).value })"
      />
      <label class="out" :title="`MIDI note ${baseNote + channel.output} (${noteName(baseNote + channel.output)})`">
        <span class="sr-only">Output</span>
        <input
          type="number"
          min="1"
          :max="MAX_CHANNELS"
          :value="channel.output + 1"
          aria-label="Module output"
          data-testid="channel-output"
          @change="onOutput"
        />
      </label>
    </div>
    <div class="controls">
      <button
        class="icon toggle mute"
        :class="{ active: channel.muted, implied: mutedBySolo }"
        :aria-pressed="channel.muted"
        :title="mutedBySolo ? 'Muted by solo' : 'Mute'"
        data-testid="channel-mute"
        @click="store.updateChannel(channel.id, { muted: !channel.muted })"
      >
        M
      </button>
      <button
        class="icon toggle solo"
        :class="{ active: channel.solo }"
        :aria-pressed="channel.solo"
        title="Solo"
        data-testid="channel-solo"
        @click="store.updateChannel(channel.id, { solo: !channel.solo })"
      >
        S
      </button>
      <!-- Channels are rows ordered top to bottom, or, in a vertical orientation, columns ordered left to right. -->
      <button
        class="icon up"
        :title="vertical ? 'Move left' : 'Move up'"
        :disabled="index === 0"
        data-testid="channel-up"
        @click="store.moveChannel(channel.id, -1)"
      >
        {{ vertical ? '←' : '↑' }}
      </button>
      <button
        class="icon down"
        :title="vertical ? 'Move right' : 'Move down'"
        :disabled="index === total - 1"
        data-testid="channel-down"
        @click="store.moveChannel(channel.id, 1)"
      >
        {{ vertical ? '→' : '↓' }}
      </button>
      <button class="icon danger remove" title="Remove channel" data-testid="channel-remove" @click="remove">✕</button>
    </div>
  </div>
</template>

<style scoped>
.channel-header {
  display: flex;
  align-items: center;
  gap: 3px;
  height: var(--row-height);
  padding: 0 6px 0 4px;
  width: var(--row-head-width);
  font-size: 12px;
  /* The right-to-left grid mirrors its rows, but the header's text and controls stay readable. */
  direction: ltr;
}

/* One line on desktop: the groups are only there so phones can stack them (below). */
.ident,
.controls {
  display: contents;
}

.channel-header.muted .name {
  opacity: 0.5;
  text-decoration: line-through;
}

/* The track's colour, inherited from the grid row, so the header matches its gates. */
.swatch {
  flex: 0 0 4px;
  width: 4px;
  height: 26px;
  border-radius: 2px;
  background: var(--track-color, oklch(var(--track-l) var(--track-c) var(--track-hue)));
}

.channel-header.muted .swatch {
  background: var(--track-color-dim, oklch(var(--track-l-dim) var(--track-c-dim) var(--track-hue)));
  opacity: 0.55;
}

.name {
  flex: 1;
  min-width: 0;
  padding: 1px 6px;
  height: 26px;
  min-height: 0;
  background: transparent;
  border-color: transparent;
}

.name:hover,
.name:focus {
  background: var(--bg);
  border-color: var(--border);
}

.out input {
  width: 3.2em;
  padding: 1px 4px;
  height: 26px;
  min-height: 0;
  text-align: right;
}

.icon {
  padding: 0 5px;
  height: 26px;
  min-height: 0;
  min-width: 24px;
  font-size: 11px;
}

/* Phones: the channel column is narrow, so name + output sit above the buttons. */
@media (max-width: 767px) {
  .channel-header {
    flex-wrap: wrap;
    align-content: center;
    row-gap: 2px;
    padding: 2px 4px;
  }

  .ident,
  .controls {
    display: flex;
    align-items: center;
    gap: 3px;
    flex: 1 1 100%;
    min-width: 0;
  }

  .controls .icon {
    flex: 1 1 0;
  }
}

/*
 * Vertical orientations: the header tops a column as wide as a track, so the name, the
 * output and the buttons stack on three lines. The same cells, laid out on a grid.
 */
.channel-header.vertical {
  display: grid;
  grid-template-columns: 4px repeat(3, minmax(0, 1fr));
  grid-template-areas:
    'swatch name name name'
    'out out mute solo'
    'up up down remove';
  gap: 3px;
  align-items: center;
  width: auto;
  height: var(--track-head-height);
  padding: 4px;
}

.vertical .ident,
.vertical .controls {
  display: contents;
}

.vertical .swatch {
  grid-area: swatch;
}

.vertical .name {
  grid-area: name;
  width: 100%;
  padding: 1px 4px;
}

.vertical .out {
  grid-area: out;
  display: flex;
}

.vertical .out input {
  width: 100%;
  padding: 1px 3px;
}

.vertical .icon {
  width: 100%;
  min-width: 0;
  padding: 0;
}

.vertical .mute {
  grid-area: mute;
}

.vertical .solo {
  grid-area: solo;
}

.vertical .up {
  grid-area: up;
}

.vertical .down {
  grid-area: down;
}

.vertical .remove {
  grid-area: remove;
}

.toggle.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
}

/* Muted because another channel is soloed: lit, but dimmer than an explicit mute. */
.toggle.implied {
  background: var(--accent-soft);
  border-color: var(--accent-border);
  color: var(--accent-bright);
}

.toggle.solo.active {
  background: var(--solo);
  border-color: var(--solo);
  color: var(--solo-contrast);
}
</style>
