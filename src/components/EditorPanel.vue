<script setup lang="ts">
import { computed } from 'vue'
import { TRACK_ORIENTATIONS, useUiStore } from '../stores/ui'

const ui = useUiStore()

function onOrientation(event: Event) {
  ui.setTrackOrientation((event.target as HTMLSelectElement).value)
}

const moduleView = computed({
  get: () => ui.moduleViewOpen,
  set: (open: boolean) => ui.setModuleViewOpen(open),
})
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
      <label
        class="check"
        :title="moduleView ? 'Hide the module view' : 'Show the module\'s outputs and which are high'"
      >
        <span>Module view</span>
        <input
          v-model="moduleView"
          type="checkbox"
          aria-controls="module-view"
          data-testid="toggle-module-view"
        />
      </label>
    </div>
    <p class="muted note">
      Which way time runs along a channel's track. Left to right and right to left keep one row per channel, with
      the steps running away from its name; top to bottom and bottom to top make each channel a column instead.
      The module view is a picture of the Conway's Game panel beside the grid, with the outputs that are high
      lighting up as the song plays. Both are preferences of this browser, not part of the song.
    </p>
  </section>
</template>

<style scoped>
.check {
  flex-direction: row;
  align-items: center;
  align-self: flex-end;
  gap: 6px;
  min-height: 34px;
}

.note {
  margin: 10px 0 0;
  font-size: 12px;
}
</style>
