<script setup lang="ts">
import { computed } from 'vue'
import { noteName } from '../core/midi'
import { MAX_CHANNELS, isChannelSilenced, type Channel } from '../core/song'
import { useSongStore } from '../stores/song'

const props = defineProps<{ channel: Channel; index: number; baseNote: number; total: number }>()
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
  <div class="channel-header" :class="{ muted: silenced }" :data-testid="`channel-header-${index}`">
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
        class="icon toggle"
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
      <button class="icon" title="Move up" :disabled="index === 0" data-testid="channel-up" @click="store.moveChannel(channel.id, -1)">↑</button>
      <button class="icon" title="Move down" :disabled="index === total - 1" data-testid="channel-down" @click="store.moveChannel(channel.id, 1)">↓</button>
      <button class="icon danger" title="Remove channel" data-testid="channel-remove" @click="remove">✕</button>
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
