<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { rangeContains } from '../core/clipboard'
import { trackHue } from '../core/colors'
import { MAX_CHANNELS, clamp, isChannelSilenced, isStepOn } from '../core/song'
import { useEditorStore } from '../stores/editor'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'
import { isVerticalOrientation, useUiStore } from '../stores/ui'
import ChannelHeader from './ChannelHeader.vue'

const store = useSongStore()
const transport = useTransportStore()
const ui = useUiStore()
const editor = useEditorStore()

/**
 * Which way time runs along a track (a browser preference, see `stores/ui.ts`). The DOM is
 * the same for every orientation: the rows of the left-to-right layout become columns in a
 * vertical one, and the CSS below lays them out and picks the sides the borders sit on.
 */
const orientation = computed(() => ui.trackOrientation)
const vertical = computed(() => isVerticalOrientation(orientation.value))

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

// ---- scrolling ------------------------------------------------------------
const scroller = ref<HTMLElement | null>(null)

/**
 * Show the start of the song. Where that is depends on the orientation: the scroll origin
 * follows the channel headers to the right edge (right to left) or the bottom edge (bottom
 * to top), so the position that was in view before a switch would be somewhere else after it.
 */
function scrollToStart() {
  const el = scroller.value
  if (!el) return
  // In a right-to-left scroller 0 is the right edge; in a reversed column it is the bottom
  // edge, and `scrollHeight` lands there too in a browser that keeps the origin at the top.
  el.scrollLeft = 0
  el.scrollTop = orientation.value === 'btt' ? el.scrollHeight : 0
  // Vertical tracks run down the page rather than inside the scroller (see App.vue), so
  // bottom to top also has to bring the page down to the foot of the grid, where the
  // headers and the first steps are. (jsdom has no scrollIntoView.)
  if (orientation.value === 'btt') el.scrollIntoView?.({ block: 'end' })
}

watch(orientation, () => nextTick(scrollToStart))

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

// ---- the cursor -------------------------------------------------------------
/**
 * A click on a section header or a bar number puts the cursor on the step under the pointer,
 * so a paste (below) lands there. Where the step is depends on which way the track runs;
 * without a layout (no size) the click counts as the start of the header.
 */
function seekFromHeader(startStep: number, span: number, event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  let fraction: number
  switch (orientation.value) {
    case 'ltr':
      fraction = (event.clientX - rect.left) / rect.width
      break
    case 'rtl':
      fraction = (rect.right - event.clientX) / rect.width
      break
    case 'ttb':
      fraction = (event.clientY - rect.top) / rect.height
      break
    case 'btt':
      fraction = (rect.bottom - event.clientY) / rect.height
      break
  }
  if (!Number.isFinite(fraction)) fraction = 0
  transport.seekToStep(startStep + clamp(Math.floor(fraction * span), 0, span - 1))
}

/** Enter or Space on a header puts the cursor at its start. */
function seekToHeader(startStep: number) {
  transport.seekToStep(startStep)
}

const cursorLabel = computed(() => {
  const at = transport.position
  if (!at) return 'the start'
  const section = store.song.sections[at.sectionIndex]
  const timing = store.timeline[at.sectionIndex]
  if (!section || !timing) return 'the start'
  const bar = Math.floor(at.stepInSection / timing.stepsPerBar) + 1
  const step = (at.stepInSection % timing.stepsPerBar) + 1
  return `${section.name} bar ${bar} step ${step}`
})

// ---- selection, copy and paste --------------------------------------------------
/**
 * Shift+drag with a mouse or pen selects a block: the rectangle between the cell pressed
 * on and the cell under the pointer, across as many tracks as it covers. Shift+Enter or
 * Shift+Space stretches the selection to the focused cell for keyboard users. The block is
 * copied, cut, pasted at the cursor and deleted with the usual keys or the buttons above
 * the grid; see `stores/editor.ts` for where a paste lands.
 */
const selectingCells = ref(false)

const selection = computed(() => editor.liveSelection)

const selectionLabel = computed(() => {
  const range = selection.value
  if (!range) return ''
  const channels = range.channelEnd - range.channelStart
  const steps = range.stepEnd - range.stepStart
  return `${channels} ${channels === 1 ? 'track' : 'tracks'} × ${steps} ${steps === 1 ? 'step' : 'steps'}`
})

const pasteTitle = computed(() => {
  const block = editor.clipboard
  if (!block) return ''
  return `Paste the copied block (${block.channels} × ${block.steps}) at the cursor: ${cursorLabel.value} (Ctrl+V)`
})

/** Keyboard shortcuts for the block, anywhere outside a text field: Ctrl/Cmd+C, X, V and Delete. */
function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const tag = target?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target?.isContentEditable) return
  const modifier = (event.ctrlKey || event.metaKey) && !event.altKey
  let handled = false
  if (modifier && !event.shiftKey) {
    const key = event.key.toLowerCase()
    if (key === 'c') handled = editor.copy()
    else if (key === 'x') handled = editor.cut()
    else if (key === 'v') handled = editor.paste() !== null
  } else if (!modifier && (event.key === 'Delete' || event.key === 'Backspace')) {
    handled = editor.deleteSelection()
  }
  if (handled) event.preventDefault()
}

function begin(
  sectionId: string,
  channelId: string,
  step: number,
  channelIndex: number,
  globalStep: number,
  event: PointerEvent,
) {
  lastPointerType = event.pointerType || 'mouse'
  if (lastPointerType === 'touch' || event.button !== 0) return
  event.preventDefault()
  // Cancelling the press keeps the browser from moving focus, so move it to the cell by
  // hand: otherwise focus stays in whatever drawer field was used last and the copy, cut,
  // paste and delete shortcuts (which stand down inside text fields) would not fire.
  ;(event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
  if (event.shiftKey) {
    selectingCells.value = true
    editor.selectCell({ channel: channelIndex, step: globalStep })
    return
  }
  const section = store.sectionById(sectionId)
  if (!section) return
  paintValue.value = !isStepOn(section, channelId, step)
  painting.value = true
  store.setStep(sectionId, channelId, step, paintValue.value)
}

function enter(
  sectionId: string,
  channelId: string,
  step: number,
  channelIndex: number,
  globalStep: number,
  event: PointerEvent,
) {
  if ((event.buttons & 1) === 0) return
  if (selectingCells.value) editor.extendTo({ channel: channelIndex, step: globalStep })
  else if (painting.value) store.setStep(sectionId, channelId, step, paintValue.value)
}

/** A finger tap: the browser fires click once it knows the touch was not a scroll. */
function tap(sectionId: string, channelId: string, step: number) {
  if (lastPointerType !== 'touch') return
  store.toggleStep(sectionId, channelId, step)
}

function keyToggle(
  sectionId: string,
  channelId: string,
  step: number,
  channelIndex: number,
  globalStep: number,
  event: KeyboardEvent,
) {
  if (event.shiftKey) editor.extendTo({ channel: channelIndex, step: globalStep })
  else store.toggleStep(sectionId, channelId, step)
}

function end() {
  painting.value = false
  selecting.value = false
  selectingCells.value = false
}

onMounted(() => {
  window.addEventListener('pointerup', end)
  window.addEventListener('keydown', onKey)
  scrollToStart()
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', end)
  window.removeEventListener('keydown', onKey)
})

/**
 * Classes for one cell. Consecutive on-steps are one held gate (see `compileSong`), so a
 * cell whose neighbour within the same section is also on gets `tie-prev` / `tie-next` and
 * the CSS removes the edge between them, drawing the run as a single continuous bar.
 */
function cellClass(
  sectionId: string,
  channelId: string,
  step: number,
  channelIndex: number,
  globalStep: number,
  subdivision: number,
  stepCount: number,
) {
  const section = store.sectionById(sectionId)
  const on = section ? isStepOn(section, channelId, step) : false
  const range = selection.value
  return {
    on,
    'tie-prev': on && step > 0 && isStepOn(section!, channelId, step - 1),
    'tie-next': on && step < stepCount - 1 && isStepOn(section!, channelId, step + 1),
    beat: step % subdivision === 0,
    playhead: globalStep === currentStep.value,
    selected: range !== null && rangeContains(range, channelIndex, globalStep),
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
      <div v-if="selection" class="block-tools" data-testid="selection">
        <span class="muted selection-size" data-testid="selection-size">{{ selectionLabel }} selected</span>
        <button class="small" title="Copy the selected block (Ctrl+C)" data-testid="copy" @click="editor.copy()">
          Copy
        </button>
        <button class="small" title="Copy the selected block and clear it (Ctrl+X)" data-testid="cut" @click="editor.cut()">
          Cut
        </button>
        <button
          class="small"
          title="Clear the selected block (Delete)"
          data-testid="delete-selection"
          @click="editor.deleteSelection()"
        >
          Delete
        </button>
        <button
          class="small icon"
          title="Clear the selection"
          aria-label="Clear the selection"
          data-testid="clear-selection"
          @click="editor.clearSelection()"
        >
          ✕
        </button>
      </div>
      <button v-if="editor.hasClipboard" class="small" :title="pasteTitle" data-testid="paste" @click="editor.paste()">
        Paste at cursor
      </button>
      <button class="primary" :disabled="!store.canAddChannel" data-testid="add-channel" @click="store.addChannel()">
        + Add channel
      </button>
    </div>

    <p v-if="store.song.sections.length === 0" class="muted">Add a section to see the grid.</p>
    <p v-else-if="store.song.channels.length === 0" class="muted">Add a channel to start drawing gates.</p>

    <div
      v-else
      ref="scroller"
      class="scroller"
      :class="[vertical ? 'vertical' : 'horizontal', `orient-${orientation}`]"
      :data-orientation="orientation"
      data-testid="grid"
    >
      <div class="tracks">
        <div class="header-row sections-row">
          <div class="corner" />
          <div
            v-for="{ section, timing } in sections"
            :key="section.id"
            class="section-label"
            :style="{ '--span': timing.stepCount }"
            :title="`${section.name}: ${timing.tempo} BPM, ${section.timeSignature.beats}/${section.timeSignature.unit}, ${section.bars} bars. Click to put the cursor there`"
            role="button"
            tabindex="0"
            :aria-label="`Put the cursor in ${section.name}`"
            :data-testid="`grid-section-${timing.index}`"
            @click="seekFromHeader(timing.startStep, timing.stepCount, $event)"
            @keydown.enter.prevent="seekToHeader(timing.startStep)"
            @keydown.space.prevent="seekToHeader(timing.startStep)"
          >
            <span class="section-name">{{ section.name }}</span>
            <span class="section-meta mono">
              {{ timing.tempo }} BPM · {{ section.timeSignature.beats }}/{{ section.timeSignature.unit }} ·
              {{ section.bars }} bars
            </span>
          </div>
        </div>
        <div class="header-row bars-row">
          <div class="corner" />
          <template v-for="{ section, timing, bars } in sections" :key="section.id">
            <div
              v-for="bar in bars"
              :key="bar.bar"
              class="bar-label mono"
              :class="{ 'in-loop': inLoop(bar.globalBar) }"
              :style="{ '--span': bar.stepsPerBar }"
              :title="`${section.name} bar ${bar.bar + 1}: click to put the cursor there`"
              role="button"
              tabindex="0"
              :aria-label="`Put the cursor at ${section.name} bar ${bar.bar + 1}`"
              :data-testid="`bar-label-${bar.globalBar}`"
              @click="seekFromHeader(timing.startStep + bar.startStep, bar.stepsPerBar, $event)"
              @keydown.enter.prevent="seekToHeader(timing.startStep + bar.startStep)"
              @keydown.space.prevent="seekToHeader(timing.startStep + bar.startStep)"
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
              :style="{ '--span': bar.stepsPerBar }"
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
              :vertical="vertical"
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
                  channelIndex,
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
              @pointerdown="begin(section.id, channel.id, step - 1, channelIndex, timing.startStep + step - 1, $event)"
              @pointerenter="enter(section.id, channel.id, step - 1, channelIndex, timing.startStep + step - 1, $event)"
              @click="tap(section.id, channel.id, step - 1)"
              @keydown.enter.prevent="
                keyToggle(section.id, channel.id, step - 1, channelIndex, timing.startStep + step - 1, $event)
              "
              @keydown.space.prevent="
                keyToggle(section.id, channel.id, step - 1, channelIndex, timing.startStep + step - 1, $event)
              "
            />
          </template>
        </div>
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

/* Copy, cut, delete and clear for the selected block, and paste for the clipboard. */
.block-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.selection-size {
  font-size: 12px;
  white-space: nowrap;
}

.head button.small {
  padding: 4px 10px;
  font-size: 12px;
}

.head button.small.icon {
  padding: 4px 7px;
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

  .head > button {
    margin-left: auto;
  }
}

/*
 * Orientation.
 * `.horizontal` (left to right, right to left): channels are rows, headed on the left or
 * the right. `.vertical` (top to bottom, bottom to top): the same elements laid out as
 * columns, headed at the top or the bottom. `.orient-rtl` and `.orient-btt` mirror their
 * axis. Every length that runs along the time axis is written once per axis, and every
 * border that marks a step boundary is written once per orientation, from the "start"
 * (earlier) and "end" (later) sides the state classes describe with custom properties.
 */
.scroller {
  flex: 1 1 auto;
  min-height: 160px;
  /*
   * Horizontal tracks scroll inside the box, which fills the window. Vertical tracks run
   * down the page instead: the shell grows with the song (see App.vue), so the box is as
   * tall as the tracks and only ever scrolls sideways, across the channels. The sticky
   * channel heads therefore hold only along the axis the box scrolls.
   */
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  user-select: none;
  /* Fingers pan the grid (a tap toggles a cell); pinch-zoom inside it is disabled. */
  touch-action: pan-x pan-y;
  -webkit-tap-highlight-color: transparent;
}

/* Right to left: rows are mirrored and the scroll origin moves to the right edge, by the headers. */
.scroller.orient-rtl {
  direction: rtl;
}

/*
 * Bottom to top: a reversed flex column puts its scroll origin at the bottom edge, so the
 * grid opens on the headers and the start of the song, and the song extends upwards.
 */
.scroller.orient-btt {
  display: flex;
  flex-direction: column-reverse;
}

.tracks {
  width: max-content;
}

.vertical .tracks {
  display: flex;
  flex: 0 0 auto;
}

.header-row,
.channel-row {
  display: flex;
}

.vertical .header-row,
.vertical .channel-row {
  flex-direction: column;
}

.orient-btt .header-row,
.orient-btt .channel-row {
  flex-direction: column-reverse;
}

/* The section, bar and loop strips stay in view: along the top, or down the left side. */
.header-row {
  position: sticky;
  z-index: 3;
  background: var(--bg-elev);
}

.horizontal .sections-row {
  top: 0;
}

.horizontal .bars-row {
  top: 32px;
}

.vertical .sections-row {
  left: 0;
  width: 32px;
}

.vertical .bars-row {
  left: 32px;
  width: 18px;
}

/* The loop strip sits under the bar numbers: one clickable cell per bar, lit inside the loop points. */
.loop-row {
  --loop-row-height: 14px;
}

.horizontal .loop-row {
  top: 50px;
  height: var(--loop-row-height);
  border-bottom: 1px solid var(--border);
}

.vertical .loop-row {
  --loop-row-height: 18px;
  left: 50px;
  width: var(--loop-row-height);
  border-right: 1px solid var(--border);
}

.loop-corner {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  line-height: 1;
  direction: ltr;
}

.horizontal .loop-corner {
  padding: 0 8px;
  height: var(--loop-row-height);
}

.vertical .loop-corner {
  flex-direction: column;
  padding: 8px 0;
}

.loop-title {
  font-weight: 600;
  color: var(--text-dim);
}

.vertical .loop-title {
  writing-mode: vertical-lr;
}

.orient-btt .loop-title {
  writing-mode: sideways-lr;
}

.loop-hint {
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* No room for the hint beside a vertical strip; the title and the cells' tooltips remain. */
.vertical .loop-hint {
  display: none;
}

.loop-clear {
  min-height: 0;
  font-size: 9px;
  line-height: 1;
  border-radius: 3px;
}

.horizontal .loop-clear {
  height: 12px;
  padding: 0 5px;
}

.vertical .loop-clear {
  width: 12px;
  padding: 5px 0;
}

.loop-cell {
  flex: 0 0 auto;
  background: var(--bg-elev);
  cursor: pointer;
  --start-width: 1px;
  --start-line: var(--border);
  --end-width: 1px;
  --end-line: transparent;
}

.loop-cell.in-loop {
  background: var(--accent);
  --start-line: var(--accent-dim);
}

.loop-cell.loop-start {
  --start-width: 2px;
  --start-line: var(--accent-bright);
}

.loop-cell.loop-end {
  --end-width: 2px;
  --end-line: var(--accent-bright);
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

/* A finger needs a thicker strip to hit. */
@media (pointer: coarse) {
  .horizontal .loop-row {
    --loop-row-height: 22px;
  }

  .vertical .loop-row {
    --loop-row-height: 24px;
  }

  .loop-clear {
    font-size: 11px;
  }

  .horizontal .loop-clear {
    height: 18px;
    padding: 0 8px;
  }

  .vertical .loop-clear {
    width: 18px;
    padding: 8px 0;
  }
}

/* The channel headers and the strips' corners stay in view too, across from the time axis. */
.corner,
.row-head {
  position: sticky;
  z-index: 2;
  background: var(--bg-elev);
}

.corner {
  z-index: 4;
}

.horizontal .corner,
.horizontal .row-head {
  left: 0;
  flex: 0 0 var(--row-head-width);
  width: var(--row-head-width);
  border-right: 1px solid var(--border);
}

.orient-rtl .corner,
.orient-rtl .row-head {
  left: auto;
  right: 0;
  border-right: 0;
  border-left: 1px solid var(--border);
}

/* Full row height, so gates scrolled underneath the sticky header never peek out below it. */
.horizontal .row-head {
  height: var(--row-height);
}

.vertical .corner,
.vertical .row-head {
  top: 0;
  flex: 0 0 var(--track-head-height);
  height: var(--track-head-height);
  border-bottom: 1px solid var(--border);
}

.orient-btt .corner,
.orient-btt .row-head {
  top: auto;
  bottom: 0;
  border-bottom: 0;
  border-top: 1px solid var(--border);
}

/* Section, bar and loop cells span their steps along the time axis. */
.horizontal .section-label,
.horizontal .bar-label,
.horizontal .loop-cell {
  width: calc(var(--cell-size) * var(--span));
}

.vertical .section-label,
.vertical .bar-label,
.vertical .loop-cell {
  height: calc(var(--cell-size) * var(--span));
}

.section-label {
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
  /* Readable text whichever way the row runs. */
  direction: ltr;
  /* A click puts the cursor under the pointer. */
  cursor: pointer;
}

@media (hover: hover) {
  .section-label:hover,
  .bar-label:hover {
    background: var(--accent-soft);
  }
}

.section-label:focus-visible,
.bar-label:focus-visible {
  outline: 2px solid var(--accent-bright);
  outline-offset: -2px;
}

.horizontal .section-label {
  height: 32px;
  padding: 2px 8px;
  border-left: 2px solid var(--accent);
}

.orient-rtl .section-label {
  border-left: 0;
  border-right: 2px solid var(--accent);
  text-align: right;
}

/* Down a column the name and the details read along the track, top to bottom or bottom to top. */
.vertical .section-label {
  width: 32px;
  padding: 6px 2px;
  line-height: 1.2;
  border-top: 2px solid var(--accent);
  writing-mode: vertical-lr;
}

.orient-btt .section-label {
  border-top: 0;
  border-bottom: 2px solid var(--accent);
  writing-mode: sideways-lr;
}

.section-name {
  font-weight: 600;
}

.section-meta {
  font-size: 10px;
  color: var(--text-dim);
}

.bar-label {
  font-size: 10px;
  color: var(--text-dim);
  direction: ltr;
  cursor: pointer;
}

.horizontal .bar-label {
  height: 18px;
  padding-left: 4px;
  border-left: 1px solid var(--border);
}

.orient-rtl .bar-label {
  padding-left: 0;
  padding-right: 4px;
  border-left: 0;
  border-right: 1px solid var(--border);
  text-align: right;
}

.vertical .bar-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 18px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
}

.orient-btt .bar-label {
  justify-content: flex-end;
  padding-top: 0;
  padding-bottom: 4px;
  border-top: 0;
  border-bottom: 1px solid var(--border);
}

.channel-row {
  /*
   * Each row carries its own hue (set inline from the track palette) and derives the
   * colours of its gates from it, so one track's gates never look like the next one's.
   */
  --track-color: oklch(var(--track-l) var(--track-c) var(--track-hue));
  --track-color-bright: oklch(var(--track-l-bright) var(--track-c-bright) var(--track-hue));
  --track-color-dim: oklch(var(--track-l-dim) var(--track-c-dim) var(--track-hue));
}

.horizontal .channel-row {
  height: var(--row-height);
  border-bottom: 1px solid var(--cell-line);
}

.vertical .channel-row {
  width: var(--track-width);
  border-right: 1px solid var(--cell-line);
}

.channel-row.is-muted .cell.on {
  background-color: var(--track-color-dim);
  opacity: 0.55;
}

/*
 * A cell's border on its "end" side separates it from the next step; a beat's first step
 * also gets one on its "start" side. Which physical sides those are depends on the
 * orientation (below); the state classes only say what the lines look like.
 */
.cell {
  flex: 0 0 var(--cell-size);
  background: var(--cell);
  cursor: crosshair;
  --start-width: 0px;
  --start-line: var(--border);
  --end-width: 1px;
  --end-line: var(--cell-line);
}

.horizontal .cell {
  width: var(--cell-size);
  height: var(--row-height);
}

.vertical .cell {
  height: var(--cell-size);
}

.cell.beat {
  --start-width: 1px;
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

/* Dark outline around the gate; the start/end edges are dropped where a run continues. */
.cell.on {
  --edge-start: 1px;
  --edge-end: 1px;
  background: var(--track-color);
  box-shadow: var(--gate-outline);
}

/*
 * A run of consecutive on-steps is one gate, so draw it as one bar: hide the grid line
 * between tied cells and the outline on the tied side. The border keeps its width so the
 * layout does not shift; a transparent border lets the cell's own background show through.
 */
.cell.on.tie-next {
  --edge-end: 0px;
  --end-line: transparent;
}

.cell.on.tie-prev {
  --edge-start: 0px;
  --start-line: transparent;
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

/*
 * The selected block: a wash of the accent laid over the cells, lit or not, as a background
 * image so it sits on top of whatever colour the cell has (a gate's track colour included).
 */
.cell.selected {
  background-image: linear-gradient(var(--selection), var(--selection));
}

/* Step boundaries per orientation: the "start" side faces the start of the song. */
.orient-ltr .cell,
.orient-ltr .loop-cell {
  border-left: var(--start-width) solid var(--start-line);
  border-right: var(--end-width) solid var(--end-line);
}

.orient-rtl .cell,
.orient-rtl .loop-cell {
  border-right: var(--start-width) solid var(--start-line);
  border-left: var(--end-width) solid var(--end-line);
}

.orient-ttb .cell,
.orient-ttb .loop-cell {
  border-top: var(--start-width) solid var(--start-line);
  border-bottom: var(--end-width) solid var(--end-line);
}

.orient-btt .cell,
.orient-btt .loop-cell {
  border-bottom: var(--start-width) solid var(--start-line);
  border-top: var(--end-width) solid var(--end-line);
}

.orient-ltr .cell {
  --gate-outline:
    inset 0 1px 0 0 var(--cell-on-edge),
    inset 0 -1px 0 0 var(--cell-on-edge),
    inset var(--edge-start) 0 0 0 var(--cell-on-edge),
    inset calc(-1 * var(--edge-end)) 0 0 0 var(--cell-on-edge);
}

.orient-rtl .cell {
  --gate-outline:
    inset 0 1px 0 0 var(--cell-on-edge),
    inset 0 -1px 0 0 var(--cell-on-edge),
    inset calc(-1 * var(--edge-start)) 0 0 0 var(--cell-on-edge),
    inset var(--edge-end) 0 0 0 var(--cell-on-edge);
}

.orient-ttb .cell {
  --gate-outline:
    inset 1px 0 0 0 var(--cell-on-edge),
    inset -1px 0 0 0 var(--cell-on-edge),
    inset 0 var(--edge-start) 0 0 var(--cell-on-edge),
    inset 0 calc(-1 * var(--edge-end)) 0 0 var(--cell-on-edge);
}

.orient-btt .cell {
  --gate-outline:
    inset 1px 0 0 0 var(--cell-on-edge),
    inset -1px 0 0 0 var(--cell-on-edge),
    inset 0 calc(-1 * var(--edge-start)) 0 0 var(--cell-on-edge),
    inset 0 var(--edge-end) 0 0 var(--cell-on-edge);
}
</style>
