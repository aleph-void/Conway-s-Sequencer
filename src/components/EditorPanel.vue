<script setup lang="ts">
import { TRACK_ORIENTATIONS, useUiStore } from '../stores/ui'

const ui = useUiStore()

function onOrientation(event: Event) {
  ui.setTrackOrientation((event.target as HTMLSelectElement).value)
}
</script>

<template>
  <section class="panel" aria-labelledby="editor-heading" data-testid="editor-panel">
    <h2 id="editor-heading">Editor</h2>
    <div class="row">
      <label>
        <span>Track orientation</span>
        <select :value="ui.trackOrientation" data-testid="track-orientation" @change="onOrientation">
          <option v-for="option in TRACK_ORIENTATIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>
    <p class="muted note">
      Which way time runs along a channel's track. Left to right and right to left keep one row per channel, with
      the steps running away from its name; top to bottom and bottom to top make each channel a column instead.
      This is a preference of this browser, not part of the song.
    </p>
  </section>
</template>

<style scoped>
.note {
  margin: 10px 0 0;
  font-size: 12px;
}
</style>
