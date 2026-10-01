<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MAX_CHANNELS, isChannelSilenced, isStepOn } from '../core/song'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'
import ChannelHeader from './ChannelHeader.vue'

const store = useSongStore()
const transport = useTransportStore()

/** Painting state: while the pointer is down we set every entered cell to `paintValue`. */
const painting = ref(false)
const paintValue = ref(true)

const sections = computed(() =>
  store.timeline.map((timing) => {
    const section = store.song.sections[timing.index]!
    const bars = Array.from({ length: section.bars }, (_, bar) => ({
      bar,
      startStep: bar * timing.stepsPerBar,
      stepsPerBar: timing.stepsPerBar,
    }))
    return { section, timing, bars }
  }),
)

const currentStep = computed(() => transport.currentStep)

function begin(sectionId: string, channelId: string, step: number, event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  const section = store.sectionById(sectionId)
  if (!section) return
  paintValue.value = !isStepOn(section, channelId, step)
  painting.value = true
  store.setStep(sectionId, channelId, step, paintValue.value)
}

function enter(sectionId: string, channelId: string, step: number, event: PointerEvent) {
  if (!painting.value || (event.buttons & 1) === 0) return
  store.setStep(sectionId, channelId, step, paintValue.value)
}

function keyToggle(sectionId: string, channelId: string, step: number) {
  store.toggleStep(sectionId, channelId, step)
}

function end() {
  painting.value = false
}

onMounted(() => window.addEventListener('pointerup', end))
onBeforeUnmount(() => window.removeEventListener('pointerup', end))

function cellClass(sectionId: string, channelId: string, step: number, globalStep: number, subdivision: number) {
  const section = store.sectionById(sectionId)
  const on = section ? isStepOn(section, channelId, step) : false
  return {
    on,
    beat: step % subdivision === 0,
    playhead: globalStep === currentStep.value,
  }
}
</script>

<template>
  <section class="panel grid-panel" aria-labelledby="grid-heading" data-testid="grid-panel">
    <div class="head">
      <h2 id="grid-heading">Gates</h2>
      <span class="muted count" data-testid="channel-count">
        {{ store.song.channels.length }} / {{ MAX_CHANNELS }} channels · {{ store.stepTotal }} steps
      </span>
      <button class="primary" :disabled="!store.canAddChannel" data-testid="add-channel" @click="store.addChannel()">
        + Add channel
      </button>
    </div>

    <p v-if="store.song.sections.length === 0" class="muted">Add a section to see the grid.</p>
    <p v-else-if="store.song.channels.length === 0" class="muted">Add a channel to start drawing gates.</p>

    <div v-else class="scroller" data-testid="grid">
      <div class="header-row sections-row">
        <div class="corner" />
        <div
          v-for="{ section, timing } in sections"
          :key="section.id"
          class="section-label"
          :style="{ width: `calc(var(--cell-size) * ${timing.stepCount})` }"
          :title="`${section.name}: ${timing.tempo} BPM, ${section.timeSignature.beats}/${section.timeSignature.unit}, ${section.bars} bars`"
          :data-testid="`grid-section-${timing.index}`"
        >
          <span class="section-name">{{ section.name }}</span>
          <span class="section-meta mono">
            {{ timing.tempo }} BPM · {{ section.timeSignature.beats }}/{{ section.timeSignature.unit }} · {{ section.bars }}
            bars
          </span>
        </div>
      </div>
      <div class="header-row bars-row">
        <div class="corner" />
        <template v-for="{ section, bars } in sections" :key="section.id">
          <div
            v-for="bar in bars"
            :key="bar.bar"
            class="bar-label mono"
            :style="{ width: `calc(var(--cell-size) * ${bar.stepsPerBar})` }"
          >
            {{ bar.bar + 1 }}
          </div>
        </template>
      </div>

      <div
        v-for="(channel, channelIndex) in store.song.channels"
        :key="channel.id"
        class="channel-row"
        :class="{ 'is-muted': isChannelSilenced(channel, store.song.channels) }"
        :data-testid="`channel-row-${channelIndex}`"
      >
        <div class="row-head">
          <ChannelHeader
            :channel="channel"
            :index="channelIndex"
            :total="store.song.channels.length"
            :base-note="store.song.settings.baseNote"
          />
        </div>
        <template v-for="{ section, timing } in sections" :key="section.id">
          <div
            v-for="step in timing.stepCount"
            :key="step"
            class="cell"
            :class="cellClass(section.id, channel.id, step - 1, timing.startStep + step - 1, section.subdivision)"
            role="checkbox"
            tabindex="0"
            :aria-checked="isStepOn(section, channel.id, step - 1)"
            :aria-label="`${channel.name}, ${section.name}, step ${step}`"
            :data-testid="`cell-${channelIndex}-${timing.index}-${step - 1}`"
            @pointerdown="begin(section.id, channel.id, step - 1, $event)"
            @pointerenter="enter(section.id, channel.id, step - 1, $event)"
            @keydown.enter.prevent="keyToggle(section.id, channel.id, step - 1)"
            @keydown.space.prevent="keyToggle(section.id, channel.id, step - 1)"
          />
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.grid-panel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: 12px;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.head h2 {
  margin: 0;
}

.count {
  font-size: 12px;
  margin-right: auto;
}

.scroller {
  flex: 1 1 auto;
  min-height: 160px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  user-select: none;
  touch-action: none;
}

.header-row,
.channel-row {
  display: flex;
  width: max-content;
}

.header-row {
  position: sticky;
  z-index: 3;
  background: var(--bg-elev);
}

.sections-row {
  top: 0;
}

.bars-row {
  top: 32px;
  border-bottom: 1px solid var(--border);
}

.corner,
.row-head {
  position: sticky;
  left: 0;
  z-index: 2;
  flex: 0 0 var(--row-head-width);
  width: var(--row-head-width);
  background: var(--bg-elev);
  border-right: 1px solid var(--border);
}

.corner {
  z-index: 4;
}

.section-label {
  height: 32px;
  padding: 2px 8px;
  border-left: 2px solid var(--accent);
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
}

.section-name {
  font-weight: 600;
}

.section-meta {
  font-size: 10px;
  color: var(--text-dim);
}

.bar-label {
  height: 18px;
  font-size: 10px;
  color: var(--text-dim);
  padding-left: 4px;
  border-left: 1px solid var(--border);
}

.channel-row {
  height: var(--cell-size);
  border-bottom: 1px solid var(--cell-line);
}

.channel-row.is-muted .cell.on {
  background: var(--accent-dim);
  opacity: 0.55;
}

.cell {
  flex: 0 0 var(--cell-size);
  width: var(--cell-size);
  height: var(--cell-size);
  background: var(--cell);
  border-right: 1px solid var(--cell-line);
  cursor: crosshair;
}

.cell.beat {
  border-left: 1px solid var(--border);
  background: var(--cell-alt);
}

.cell:hover {
  filter: brightness(1.35);
}

.cell.on {
  background: var(--cell-on);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
}

.cell.on:hover {
  filter: brightness(1.15);
}

.cell.playhead {
  box-shadow: inset 0 0 0 2px var(--accent-light);
  background-color: var(--playhead);
}

.cell.playhead.on {
  background-color: var(--cell-on-playhead);
}

.cell:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
