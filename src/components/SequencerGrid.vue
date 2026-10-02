<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { trackHue } from '../core/colors'
import { MAX_CHANNELS, isChannelSilenced, isStepOn } from '../core/song'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'
import ChannelHeader from './ChannelHeader.vue'

const store = useSongStore()
const transport = useTransportStore()

/** Painting state: while the pointer is down we set every entered cell to `paintValue`. */
const painting = ref(false)
const paintValue = ref(true)
/**
 * Pointer type of the last pointerdown on a cell. A mouse or pen draws from pointerdown
 * and paints across the cells it enters; a finger cannot do that (touch pointers are
 * captured by the first cell, and a drag has to scroll the grid), so a touch toggles on
 * the tap's click instead and a swipe is left to the browser.
 */
let lastPointerType = 'mouse'

const sections = computed(() =>
  store.timeline.map((timing) => {
    const section = store.song.sections[timing.index]!
    const bars = Array.from({ length: section.bars }, (_, bar) => ({
      bar,
      /** Index on the whole-song bar axis, which the loop points are counted on. */
      globalBar: timing.startBar + bar,
      startStep: bar * timing.stepsPerBar,
      stepsPerBar: timing.stepsPerBar,
    }))
    return { section, timing, bars }
  }),
)

const currentStep = computed(() => transport.currentStep)

// ---- loop points ----------------------------------------------------------
const loopRange = computed(() => store.song.settings.loopRange)

function inLoop(globalBar: number): boolean {
  const range = loopRange.value
  return range !== null && globalBar >= range.start && globalBar < range.end
}

/**
 * Loop-strip drag state: a mouse or pen press on a bar loops that bar and dragging across
 * other bars stretches the range between the press and the pointer. Shift extends the
 * existing range instead. A finger taps one bar (a drag has to scroll the grid).
 */
const selecting = ref(false)
let anchorBar = 0

function loopBegin(globalBar: number, event: PointerEvent) {
  lastPointerType = event.pointerType || 'mouse'
  if (lastPointerType === 'touch' || event.button !== 0) return
  event.preventDefault()
  selecting.value = true
  if (event.shiftKey) {
    store.extendLoopRange(globalBar)
    const range = loopRange.value!
    anchorBar = globalBar === range.start ? range.end - 1 : range.start
  } else {
    anchorBar = globalBar
    store.setLoopBar(globalBar)
  }
}

function loopEnter(globalBar: number, event: PointerEvent) {
  if (!selecting.value || (event.buttons & 1) === 0) return
  store.setLoopRange(Math.min(anchorBar, globalBar), Math.max(anchorBar, globalBar) + 1)
}

function loopTap(globalBar: number) {
  if (lastPointerType !== 'touch') return
  store.setLoopBar(globalBar)
}

function loopKey(globalBar: number, event: KeyboardEvent) {
  if (event.shiftKey) store.extendLoopRange(globalBar)
  else store.setLoopBar(globalBar)
}

function loopLabel(sectionName: string, bar: number, globalBar: number): string {
  const state = inLoop(globalBar) ? 'in the loop' : 'not in the loop'
  return `Loop ${sectionName} bar ${bar + 1} (${state}); Shift extends the loop to it`
}

function begin(sectionId: string, channelId: string, step: number, event: PointerEvent) {
  lastPointerType = event.pointerType || 'mouse'
  if (lastPointerType === 'touch' || event.button !== 0) return
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

/** A finger tap: the browser fires click once it knows the touch was not a scroll. */
function tap(sectionId: string, channelId: string, step: number) {
  if (lastPointerType !== 'touch') return
  store.toggleStep(sectionId, channelId, step)
}

function keyToggle(sectionId: string, channelId: string, step: number) {
  store.toggleStep(sectionId, channelId, step)
}

function end() {
  painting.value = false
  selecting.value = false
}

onMounted(() => window.addEventListener('pointerup', end))
onBeforeUnmount(() => window.removeEventListener('pointerup', end))

/**
 * Classes for one cell. Consecutive on-steps are one held gate (see `compileSong`), so a
 * cell whose neighbour within the same section is also on gets `tie-prev` / `tie-next` and
 * the CSS removes the edge between them, drawing the run as a single continuous bar.
 */
function cellClass(
  sectionId: string,
  channelId: string,
  step: number,
  globalStep: number,
  subdivision: number,
  stepCount: number,
) {
  const section = store.sectionById(sectionId)
  const on = section ? isStepOn(section, channelId, step) : false
  return {
    on,
    'tie-prev': on && step > 0 && isStepOn(section!, channelId, step - 1),
    'tie-next': on && step < stepCount - 1 && isStepOn(section!, channelId, step + 1),
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
            :class="{ 'in-loop': inLoop(bar.globalBar) }"
            :style="{ width: `calc(var(--cell-size) * ${bar.stepsPerBar})` }"
          >
            {{ bar.bar + 1 }}
          </div>
        </template>
      </div>
      <div class="header-row loop-row" data-testid="loop-strip">
        <div class="corner loop-corner">
          <span class="loop-title">Loop</span>
          <button
            v-if="loopRange"
            class="loop-clear"
            type="button"
            title="Clear the loop points and play the whole song"
            aria-label="Clear the loop points"
            data-testid="loop-clear"
            @click="store.clearLoopRange()"
          >
            ✕
          </button>
          <span v-else class="loop-hint muted">click or drag a bar</span>
        </div>
        <template v-for="{ section, bars } in sections" :key="section.id">
          <div
            v-for="bar in bars"
            :key="bar.bar"
            class="loop-cell"
            :class="{
              'in-loop': inLoop(bar.globalBar),
              'loop-start': loopRange?.start === bar.globalBar,
              'loop-end': loopRange?.end === bar.globalBar + 1,
            }"
            :style="{ width: `calc(var(--cell-size) * ${bar.stepsPerBar})` }"
            role="button"
            tabindex="0"
            :aria-pressed="inLoop(bar.globalBar)"
            :aria-label="loopLabel(section.name, bar.bar, bar.globalBar)"
            :title="`Loop ${section.name} bar ${bar.bar + 1}: click for this bar, drag across bars, Shift+click to extend`"
            :data-testid="`loop-bar-${bar.globalBar}`"
            @pointerdown="loopBegin(bar.globalBar, $event)"
            @pointerenter="loopEnter(bar.globalBar, $event)"
            @click="loopTap(bar.globalBar)"
            @keydown.enter.prevent="loopKey(bar.globalBar, $event)"
            @keydown.space.prevent="loopKey(bar.globalBar, $event)"
          />
        </template>
      </div>

      <div
        v-for="(channel, channelIndex) in store.song.channels"
        :key="channel.id"
        class="channel-row"
        :class="{ 'is-muted': isChannelSilenced(channel, store.song.channels) }"
        :style="{ '--track-hue': trackHue(channelIndex) }"
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
            :class="
              cellClass(
                section.id,
                channel.id,
                step - 1,
                timing.startStep + step - 1,
                section.subdivision,
                timing.stepCount,
              )
            "
            role="checkbox"
            tabindex="0"
            :aria-checked="isStepOn(section, channel.id, step - 1)"
            :aria-label="`${channel.name}, ${section.name}, step ${step}`"
            :data-testid="`cell-${channelIndex}-${timing.index}-${step - 1}`"
            @pointerdown="begin(section.id, channel.id, step - 1, $event)"
            @pointerenter="enter(section.id, channel.id, step - 1, $event)"
            @click="tap(section.id, channel.id, step - 1)"
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

@media (max-width: 767px) {
  .head {
    flex-wrap: wrap;
    gap: 6px 12px;
  }

  .count {
    flex: 1 1 100%;
    order: 3;
  }

  .head button {
    margin-left: auto;
  }
}

.scroller {
  flex: 1 1 auto;
  min-height: 160px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  user-select: none;
  /* Fingers pan the grid (a tap toggles a cell); pinch-zoom inside it is disabled. */
  touch-action: pan-x pan-y;
  -webkit-tap-highlight-color: transparent;
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
}

/* The loop strip sits under the bar numbers: one clickable cell per bar, lit inside the loop points. */
.loop-row {
  top: 50px;
  height: var(--loop-row-height);
  border-bottom: 1px solid var(--border);
  --loop-row-height: 14px;
}

.loop-corner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: var(--loop-row-height);
  font-size: 10px;
  line-height: 1;
}

.loop-title {
  font-weight: 600;
  color: var(--text-dim);
}

.loop-hint {
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loop-clear {
  min-height: 0;
  height: 12px;
  padding: 0 5px;
  font-size: 9px;
  line-height: 1;
  border-radius: 3px;
}

.loop-cell {
  flex: 0 0 auto;
  height: var(--loop-row-height);
  background: var(--bg-elev);
  border-left: 1px solid var(--border);
  border-right: 1px solid transparent;
  cursor: pointer;
}

.loop-cell.in-loop {
  background: var(--accent);
  border-left-color: var(--accent-dim);
}

.loop-cell.loop-start {
  border-left: 2px solid var(--accent-bright);
}

.loop-cell.loop-end {
  border-right: 2px solid var(--accent-bright);
}

@media (hover: hover) {
  .loop-cell:hover {
    background: var(--accent-soft);
  }

  .loop-cell.in-loop:hover {
    background: var(--accent-hover);
  }
}

.loop-cell:focus-visible {
  outline: 2px solid var(--accent-bright);
  outline-offset: -2px;
}

/* Bar numbers inside the loop points pick up the accent too. */
.bar-label.in-loop {
  color: var(--accent-bright);
}

/* A finger needs a taller strip to hit. */
@media (pointer: coarse) {
  .loop-row {
    --loop-row-height: 22px;
  }

  .loop-clear {
    height: 18px;
    padding: 0 8px;
    font-size: 11px;
  }
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

/* Full row height, so gates scrolled underneath the sticky header never peek out below it. */
.row-head {
  height: var(--row-height);
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
  height: var(--row-height);
  border-bottom: 1px solid var(--cell-line);
  /*
   * Each row carries its own hue (set inline from the track palette) and derives the
   * colours of its gates from it, so one track's gates never look like the next one's.
   */
  --track-color: oklch(var(--track-l) var(--track-c) var(--track-hue));
  --track-color-bright: oklch(var(--track-l-bright) var(--track-c-bright) var(--track-hue));
  --track-color-dim: oklch(var(--track-l-dim) var(--track-c-dim) var(--track-hue));
}

.channel-row.is-muted .cell.on {
  background: var(--track-color-dim);
  opacity: 0.55;
}

.cell {
  flex: 0 0 var(--cell-size);
  width: var(--cell-size);
  height: var(--row-height);
  background: var(--cell);
  border-right: 1px solid var(--cell-line);
  cursor: crosshair;
}

.cell.beat {
  border-left: 1px solid var(--border);
  background: var(--cell-alt);
}

/* Hover feedback only where a pointer can hover; on touch screens it would stick to the last tap. */
@media (hover: hover) {
  .cell:hover {
    filter: brightness(1.35);
  }

  .cell.on:hover {
    filter: brightness(1.15);
  }
}

.cell.on {
  --edge-left: 1px;
  --edge-right: 1px;
  background: var(--track-color);
  /* Dark outline around the gate; the left/right edges are dropped where a run continues. */
  box-shadow:
    inset 0 1px 0 0 var(--cell-on-edge),
    inset 0 -1px 0 0 var(--cell-on-edge),
    inset var(--edge-left) 0 0 0 var(--cell-on-edge),
    inset calc(-1 * var(--edge-right)) 0 0 0 var(--cell-on-edge);
}

/*
 * A run of consecutive on-steps is one gate, so draw it as one bar: hide the grid line
 * between tied cells and the outline on the tied side. The border keeps its width so the
 * layout does not shift; a transparent border lets the cell's own background show through.
 */
.cell.on.tie-next {
  --edge-right: 0px;
  border-right-color: transparent;
}

.cell.on.tie-prev {
  --edge-left: 0px;
  border-left-color: transparent;
}

.cell.playhead {
  box-shadow: inset 0 0 0 2px var(--accent-light);
  background-color: var(--playhead);
}

.cell.playhead.on {
  background-color: var(--track-color-bright);
}

.cell:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
