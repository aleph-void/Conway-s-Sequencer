<script setup lang="ts">
import { MAX_BARS, MAX_TEMPO, MIN_BARS, MIN_TEMPO, SUBDIVISIONS, TIME_SIGNATURE_UNITS, type Section } from '../core/song'
import { formatDuration } from '../core/timing'
import { useSongStore } from '../stores/song'

const store = useSongStore()

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
    <table v-else class="sections" data-testid="sections-table">
      <thead>
        <tr>
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
        <tr v-for="(section, index) in store.song.sections" :key="section.id" :data-testid="`section-row-${index}`">
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
</style>
