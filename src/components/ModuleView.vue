<script setup lang="ts">
import { computed } from 'vue'
import { trackHue } from '../core/colors'
import { noteName } from '../core/midi'
import { MODULE_COLUMNS, MODULE_OUTPUTS, highNotes, moduleLayout, type ModuleOutput } from '../core/module'
import { useMidiStore } from '../stores/midi'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'

const song = useSongStore()
const transport = useTransportStore()
const midi = useMidiStore()

/** Which output every channel, the clock and the play gate land on; only changes on an edit. */
const layout = computed(() => moduleLayout(song.song))
/** The notes high right now; follows the transport's cursor frame by frame. */
const high = computed(() => highNotes(song.song, song.timeline, transport.positionSeconds, transport.playing))

const highOutputs = computed(() => layout.value.outputs.filter((o) => high.value.has(o.note)))
const highLabel = computed(() => (highOutputs.value.length ? highOutputs.value.map((o) => o.index + 1).join(', ') : 'none'))

/** The role that decides an output's colour: a channel first, then the play gate, then the clock. */
function primaryRole(output: ModuleOutput) {
  return output.sources.find((s) => s.role === 'channel') ?? output.sources.find((s) => s.role === 'play') ?? output.sources[0]
}

function classes(output: ModuleOutput) {
  const role = primaryRole(output)
  return {
    assigned: output.sources.length > 0,
    high: high.value.has(output.note),
    channel: role?.role === 'channel',
    clock: role?.role === 'clock',
    play: role?.role === 'play',
    shared: output.sources.length > 1,
    invalid: output.note < 0 || output.note > 127,
  }
}

function style(output: ModuleOutput) {
  const role = primaryRole(output)
  return role?.channelIndex !== undefined ? { '--track-hue': trackHue(role.channelIndex) } : undefined
}

function title(output: ModuleOutput) {
  const parts = [`Output ${output.index + 1}`]
  if (output.note >= 0 && output.note <= 127) parts.push(`note ${output.note} (${noteName(output.note)})`)
  else parts.push(`note ${output.note} is outside MIDI's range`)
  if (output.sources.length) parts.push(output.sources.map((s) => s.name).join(' + '))
  else parts.push('unused')
  parts.push(high.value.has(output.note) ? 'high' : 'low')
  return parts.join(' · ')
}
</script>

<template>
  <section id="module-view" class="panel module-panel" aria-labelledby="module-heading" data-testid="module-view">
    <div class="head">
      <h2 id="module-heading">Module</h2>
      <span class="muted mode mono">MIDI · {{ MODULE_OUTPUTS }} outputs</span>
    </div>

    <div class="faceplate" :class="{ running: transport.playing }">
      <div class="faceplate-head">
        <span class="faceplate-name">Conway's Game</span>
        <span class="run-led" :class="{ on: transport.playing }" aria-hidden="true" />
      </div>
      <ol class="outputs" :style="{ '--columns': MODULE_COLUMNS }" aria-label="Module outputs">
        <li
          v-for="output in layout.outputs"
          :key="output.index"
          class="output"
          :class="classes(output)"
          :style="style(output)"
          :title="title(output)"
          :aria-label="title(output)"
          :data-testid="`module-output-${output.index + 1}`"
          :data-high="high.has(output.note)"
        >
          <span class="led" aria-hidden="true" />
          <span class="number">{{ output.index + 1 }}</span>
        </li>
      </ol>
    </div>

    <p class="readout mono" aria-live="off">
      <span class="muted">High: </span>
      <span data-testid="module-high">{{ highLabel }}</span>
    </p>
    <ul class="legend" aria-label="Legend">
      <li><span class="key channel" aria-hidden="true" /> channel (its track's colour)</li>
      <li><span class="key play" aria-hidden="true" /> play gate (note {{ song.song.settings.playGateNote }})</li>
      <li><span class="key clock" aria-hidden="true" /> x16 clock (note 98)</li>
    </ul>
    <p class="muted note">
      Output 1 = {{ noteName(song.song.settings.baseNote) }} ({{ song.song.settings.baseNote }}). Lit outputs are high
      right now, as the song is sent; dim rings mark outputs a track is assigned to.
      <span v-if="layout.offPanel.length" class="status-warn" data-testid="module-off-panel">
        Off the panel at this base note: {{ layout.offPanel.map((s) => `${s.name} (note ${s.note})`).join(', ') }}.
      </span>
      <span v-if="!midi.isConnected" class="status-warn" data-testid="module-silent">
        No MIDI output is selected, so this is shown but not sent.
      </span>
    </p>
  </section>
</template>

<style scoped>
.module-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Sits beside the grid on desktop; keeps its own scrollbar when the viewport is short. */
  flex: 0 0 auto;
  width: 312px;
  min-height: 0;
  overflow: auto;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.head h2 {
  margin: 0;
}

.mode {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* The panel itself: a dark plate with the 8x8 field of jacks, each with its LED. */
.faceplate {
  flex: 0 0 auto;
  background: var(--bg);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 8px 10px 10px;
}

.faceplate-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.run-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 1px solid var(--border-strong);
}

.run-led.on {
  background: var(--ok);
  border-color: var(--ok);
  box-shadow: 0 0 8px var(--ok);
}

.outputs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(var(--columns, 8), minmax(0, 1fr));
  gap: 6px;
}

.output {
  --led: var(--text-muted);
  position: relative;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  /* A 3.5 mm jack: a dark hole in a lighter collar. */
  background: radial-gradient(circle, var(--bg) 0 34%, var(--bg-surface) 36% 100%);
  border: 1px solid var(--border-strong);
  font-family: var(--mono);
  font-size: 9.5px;
  line-height: 1;
  color: var(--text-muted);
  transition: box-shadow 0.08s ease, background-color 0.08s ease;
}

.output.channel {
  --led: oklch(var(--track-l) var(--track-c) var(--track-hue));
}

.output.play {
  --led: var(--ok);
}

.output.clock {
  --led: var(--warn);
}

/* Assigned but low: a ring in the source's colour, so the mapping shows while editing. */
.output.assigned {
  border-color: var(--led);
  color: var(--text-dim);
}

/* The LED sits above the jack and lights when the output is high. */
.led {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--bg-elev-2);
  border: 1px solid var(--border-strong);
}

.output.assigned .led {
  border-color: var(--led);
}

.output.high {
  background: var(--led);
  border-color: var(--led);
  color: #0a0a0f;
  font-weight: 600;
  box-shadow: 0 0 10px var(--led);
}

.output.high .led {
  background: #fff;
  border-color: #fff;
  box-shadow: 0 0 6px #fff;
}

/* Two sources on one output (the clock or play gate colliding with a channel). */
.output.shared {
  outline: 1px dashed var(--warn);
  outline-offset: 1px;
}

.output.invalid {
  opacity: 0.35;
  border-style: dashed;
}

.readout {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  min-height: 1.4em;
  word-break: break-word;
}

.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 11px;
  color: var(--text-dim);
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.key {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid currentColor;
}

.key.channel {
  color: oklch(var(--track-l) var(--track-c) var(--track-hue));
  background: currentColor;
}

.key.play {
  color: var(--ok);
  background: currentColor;
}

.key.clock {
  color: var(--warn);
  background: currentColor;
}

.note {
  margin: 0;
  font-size: 11.5px;
}

/* Narrow screens: the view sits above the grid, full width, with the jacks capped in size. */
@media (max-width: 999px) {
  .module-panel {
    width: auto;
    overflow: visible;
  }

  .outputs {
    max-width: 360px;
  }
}
</style>
