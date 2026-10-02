<script setup lang="ts">
import { ref } from 'vue'
import { MAX_BARS, MAX_TEMPO, MIN_BARS, MIN_TEMPO, SUBDIVISIONS, TIME_SIGNATURE_UNITS, type Section } from '../core/song'
import { formatDuration } from '../core/timing'
import { useSongStore } from '../stores/song'

const store = useSongStore()

// ---- drag-and-drop reordering ---------------------------------------------
// Only the grip is draggable, so selecting text in the name input or dragging
// a number spinner never starts a row drag. Native HTML5 drag events do the
// rest; the drop target is the gap above or below the hovered row, whichever
// half the pointer is in.
type DropSide = 'before' | 'after'
interface DropTarget {
  index: number
  side: DropSide
}

/** Section currently being dragged. */
const draggingId = ref<string | null>(null)
const dropTarget = ref<DropTarget | null>(null)

function onDragStart(section: Section, event: DragEvent) {
  draggingId.value = section.id
  const dt = event.dataTransfer
  if (dt) {
    dt.effectAllowed = 'move'
    // Firefox refuses to start a drag without data.
    dt.setData('text/plain', section.id)
    // Show the whole row under the pointer rather than just the grip.
    const row = event.currentTarget as HTMLElement | null
    if (row && typeof dt.setDragImage === 'function') dt.setDragImage(row, 12, row.offsetHeight / 2)
  }
}

function onDragOver(index: number, event: DragEvent) {
  if (!draggingId.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const row = event.currentTarget as HTMLElement | null
  const rect = row?.getBoundingClientRect()
  const side: DropSide = rect && Number.isFinite(event.clientY) && event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  const next = { index, side }
  if (dropTarget.value?.index !== next.index || dropTarget.value?.side !== next.side) dropTarget.value = next
}

function onDragLeave(index: number, event: DragEvent) {
  // dragleave bubbles up from every cell the pointer crosses; only a move
  // out of the row itself should clear the indicator.
  const row = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget
  if (row && next instanceof Node && row.contains(next)) return
  if (dropTarget.value?.index === index) dropTarget.value = null
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  const id = draggingId.value
  const target = dropTarget.value
  if (id && target) {
    const sections = store.song.sections
    const from = sections.findIndex((s) => s.id === id)
    const insertAt = target.side === 'before' ? target.index : target.index + 1
    // The dragged row leaves the list before it is re-inserted.
    const to = insertAt > from ? insertAt - 1 : insertAt
    store.moveSectionTo(id, to)
  }
  endDrag()
}

function endDrag() {
  draggingId.value = null
  dropTarget.value = null
}

function dropClass(index: number): Record<string, boolean> {
  const target = dropTarget.value
  return {
    'drop-before': target?.index === index && target.side === 'before',
    'drop-after': target?.index === index && target.side === 'after',
  }
}

/** Arrow keys on the handle nudge the section, as a keyboard alternative to dragging. */
function onHandleKey(section: Section, event: KeyboardEvent) {
  const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!delta) return
  event.preventDefault()
  store.moveSection(section.id, delta)
}

function num(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function onTempo(section: Section, event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim()
  store.updateSection(section.id, { tempo: raw === '' ? null : Number(raw) })
}

function onBeats(section: Section, event: Event) {
  store.updateSection(section.id, { timeSignature: { ...section.timeSignature, beats: num(event) } })
}

function onUnit(section: Section, event: Event) {
  const unit = num(event) as Section['timeSignature']['unit']
  store.updateSection(section.id, { timeSignature: { ...section.timeSignature, unit } })
}

function onSubdivision(section: Section, event: Event) {
  store.updateSection(section.id, { subdivision: num(event) as Section['subdivision'] })
}

function remove(section: Section) {
  const hasNotes = Object.keys(section.steps).length > 0
  if (hasNotes && typeof window !== 'undefined' && !window.confirm(`Delete section "${section.name}" and its notes?`)) return
  store.removeSection(section.id)
}
</script>

<template>
  <section class="panel" aria-labelledby="sections-heading">
    <div class="head">
      <h2 id="sections-heading">Sections</h2>
      <button class="primary" data-testid="add-section" @click="store.addSection()">+ Add section</button>
    </div>
    <p v-if="store.song.sections.length === 0" class="muted">No sections yet. Add one to start drawing gates.</p>
    <div v-else class="table-scroll">
      <table class="sections" data-testid="sections-table">
      <thead>
        <tr>
          <th class="sr-only">Reorder</th>
          <th>#</th>
          <th>Name</th>
          <th>Tempo</th>
          <th>Time sig.</th>
          <th>Bars</th>
          <th>Steps / beat</th>
          <th>Length</th>
          <th class="sr-only">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(section, index) in store.song.sections"
          :key="section.id"
          :class="[{ dragging: draggingId === section.id }, dropClass(index)]"
          :data-testid="`section-row-${index}`"
          @dragstart="onDragStart(section, $event)"
          @dragover="onDragOver(index, $event)"
          @dragleave="onDragLeave(index, $event)"
          @drop="onDrop($event)"
          @dragend="endDrag"
        >
          <td class="handle-cell">
            <button
              class="icon handle"
              type="button"
              draggable="true"
              title="Drag to reorder (↑/↓ keys also move)"
              :aria-label="`Reorder section ${section.name}`"
              data-testid="section-handle"
              @keydown="onHandleKey(section, $event)"
            >
              ⋮⋮
            </button>
          </td>
          <td class="mono muted">{{ index + 1 }}</td>
          <td>
            <input
              class="name"
              type="text"
              :value="section.name"
              aria-label="Section name"
              data-testid="section-name"
              @change="store.updateSection(section.id, { name: ($event.target as HTMLInputElement).value })"
            />
          </td>
          <td>
            <input
              type="number"
              :min="MIN_TEMPO"
              :max="MAX_TEMPO"
              step="0.5"
              :value="section.tempo ?? ''"
              :placeholder="`${store.resolvedTempos[index]}`"
              :title="section.tempo === null ? `Inherits ${store.resolvedTempos[index]} BPM` : 'BPM'"
              aria-label="Tempo"
              data-testid="section-tempo"
              @change="onTempo(section, $event)"
            />
            <span v-if="section.tempo === null" class="muted inherit" data-testid="tempo-inherited">
              ↳ {{ store.resolvedTempos[index] }}
            </span>
          </td>
          <td class="sig">
            <input
              type="number"
              min="1"
              max="32"
              :value="section.timeSignature.beats"
              aria-label="Beats per bar"
              data-testid="section-beats"
              @change="onBeats(section, $event)"
            />
            <span>/</span>
            <select :value="section.timeSignature.unit" aria-label="Beat unit" data-testid="section-unit" @change="onUnit(section, $event)">
              <option v-for="u in TIME_SIGNATURE_UNITS" :key="u" :value="u">{{ u }}</option>
            </select>
          </td>
          <td>
            <input
              type="number"
              :min="MIN_BARS"
              :max="MAX_BARS"
              :value="section.bars"
              aria-label="Bars"
              data-testid="section-bars"
              @change="store.updateSection(section.id, { bars: num($event) })"
            />
          </td>
          <td>
            <select :value="section.subdivision" aria-label="Steps per beat" data-testid="section-subdivision" @change="onSubdivision(section, $event)">
              <option v-for="s in SUBDIVISIONS" :key="s" :value="s">{{ s }}</option>
            </select>
          </td>
          <td class="mono muted">
            {{ store.timeline[index]?.stepCount }} steps · {{ formatDuration(store.timeline[index]?.duration ?? 0) }}
          </td>
          <td class="actions">
            <button class="icon" title="Move up" :disabled="index === 0" data-testid="section-up" @click="store.moveSection(section.id, -1)">↑</button>
            <button class="icon" title="Move down" :disabled="index === store.song.sections.length - 1" data-testid="section-down" @click="store.moveSection(section.id, 1)">↓</button>
            <button class="icon" title="Duplicate" data-testid="section-duplicate" @click="store.duplicateSection(section.id)">⧉</button>
            <button class="icon" title="Clear notes" data-testid="section-clear" @click="store.clearSection(section.id)">⌫</button>
            <button class="icon danger" title="Delete section" data-testid="section-delete" @click="remove(section)">✕</button>
          </td>
        </tr>
      </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.head h2 {
  margin: 0;
}

@media (max-width: 767px) {
  .head {
    flex-wrap: wrap;
    gap: 8px;
  }
}

/*
 * Eight columns of inputs do not fit a phone: the table scrolls sideways within the panel.
 * Positioned so the absolutely placed .sr-only header cells stay inside the scroll area
 * instead of widening the page.
 */
.table-scroll {
  position: relative;
  overflow-x: auto;
}

.sections {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.sections th {
  text-align: left;
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  padding: 4px 6px;
}

.sections td {
  padding: 4px 6px;
  vertical-align: middle;
  white-space: nowrap;
}

.name {
  width: 110px;
}

.sig {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sig input {
  width: 4em;
}

.inherit {
  font-size: 11px;
  margin-left: 4px;
}

.actions {
  display: flex;
  gap: 4px;
}

.handle-cell {
  width: 1px;
  padding-right: 0;
}

.handle {
  cursor: grab;
  color: var(--text-muted);
  letter-spacing: -0.3em;
  padding-right: 0.45em;
  touch-action: none;
  user-select: none;
}

.handle:hover {
  color: var(--text);
}

.handle:active,
tr.dragging .handle {
  cursor: grabbing;
}

tr.dragging {
  opacity: 0.4;
}

/* Insertion line between rows while dragging. */
tr.drop-before td {
  box-shadow: inset 0 2px 0 var(--accent-light);
}

tr.drop-after td {
  box-shadow: inset 0 -2px 0 var(--accent-light);
}
</style>
