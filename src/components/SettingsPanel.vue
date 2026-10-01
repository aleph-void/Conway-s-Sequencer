<script setup lang="ts">
import { computed } from 'vue'
import { noteName } from '../core/midi'
import { MAX_CHANNELS } from '../core/song'
import { useSongStore } from '../stores/song'

const store = useSongStore()
const settings = computed(() => store.song.settings)

function num(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="panel" aria-labelledby="settings-heading">
    <h2 id="settings-heading">Module settings</h2>
    <div class="row">
      <label>
        <span>MIDI channel</span>
        <input
          type="number"
          min="1"
          max="16"
          :value="settings.midiChannel"
          data-testid="midi-channel"
          @change="store.updateSettings({ midiChannel: num($event) })"
        />
      </label>
      <label>
        <span>Base note (output 1)</span>
        <input
          type="number"
          min="0"
          :max="127 - (MAX_CHANNELS - 1)"
          :value="settings.baseNote"
          data-testid="base-note"
          @change="store.updateSettings({ baseNote: num($event) })"
        />
      </label>
      <label>
        <span>Velocity</span>
        <input
          type="number"
          min="1"
          max="127"
          :value="settings.velocity"
          data-testid="velocity"
          @change="store.updateSettings({ velocity: num($event) })"
        />
      </label>
      <label>
        <span>Play gate note</span>
        <input
          type="number"
          min="0"
          max="127"
          :value="settings.playGateNote"
          data-testid="play-gate-note"
          @change="store.updateSettings({ playGateNote: num($event) })"
        />
      </label>
    </div>
    <p class="muted note">
      Output 1 = {{ noteName(settings.baseNote) }} ({{ settings.baseNote }}), output {{ MAX_CHANNELS }} =
      {{ noteName(settings.baseNote + MAX_CHANNELS - 1) }} ({{ settings.baseNote + MAX_CHANNELS - 1 }}). A gate stays
      high for every step it is drawn on and only drops at the next empty step. The play gate on
      {{ noteName(settings.playGateNote) }} ({{ settings.playGateNote }}) is held high while the song is playing and
      drops when it pauses or stops; the module's 64th output is note {{ settings.baseNote + MAX_CHANNELS }}.
    </p>
  </section>
</template>

<style scoped>
.note {
  margin: 10px 0 0;
  font-size: 12px;
}
</style>
