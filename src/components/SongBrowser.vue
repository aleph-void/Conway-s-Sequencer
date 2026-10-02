<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { LibraryEntry } from '../core/library'
import { useSongStore } from '../stores/song'
import { useTransportStore } from '../stores/transport'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useSongStore()
const transport = useTransportStore()
const open = ref(false)
const tab = ref<HTMLButtonElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const panelId = 'song-browser-panel'
/** The song whose deletion is awaiting confirmation, and the button that asked. */
const pendingDelete = ref<{ entry: LibraryEntry; trigger: HTMLElement | null } | null>(null)

async function show() {
  open.value = true
  await nextTick()
  closeButton.value?.focus()
}

function hide(restoreFocus = false) {
  if (!open.value) return
  open.value = false
  if (restoreFocus) tab.value?.focus()
}

function toggle() {
  if (open.value) hide(true)
  else void show()
}

function displayName(entry: Pick<LibraryEntry, 'name'>): string {
  return entry.name.trim() || 'Untitled'
}

/** "12:34" for today, otherwise a short date. */
function formatEdited(ms: number): string {
  const date = new Date(ms)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function select(entry: LibraryEntry) {
  if (entry.id !== store.currentId) {
    transport.stop()
    if (!store.selectSong(entry.id)) return
  }
  hide(true)
}

function duplicate(entry: LibraryEntry) {
  transport.stop()
  if (store.duplicateSong(entry.id) === null) return
  hide(true)
}

function askRemove(entry: LibraryEntry, event: Event) {
  pendingDelete.value = { entry, trigger: event.currentTarget as HTMLElement | null }
}

// Focus moves back into the drawer only after it has re-rendered as no longer inert.
async function cancelRemove() {
  const trigger = pendingDelete.value?.trigger
  pendingDelete.value = null
  await nextTick()
  if (trigger?.isConnected) trigger.focus()
  else closeButton.value?.focus()
}

async function confirmRemove() {
  const entry = pendingDelete.value?.entry
  pendingDelete.value = null
  if (!entry) return
  if (entry.id === store.currentId) transport.stop()
  store.deleteSong(entry.id)
  await nextTick()
  closeButton.value?.focus()
}

function create() {
  transport.stop()
  store.newSong()
  hide(true)
}

function onKey(event: KeyboardEvent) {
  // While the delete box is up it owns Escape (and stops it reaching here).
  if (event.key === 'Escape' && open.value && !pendingDelete.value) hide(true)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="song-browser" :class="{ open }" data-testid="song-browser" :data-open="open">
    <div v-if="open" class="backdrop" data-testid="song-browser-backdrop" @click="hide()" />
    <aside class="drawer" :inert="pendingDelete !== null">
      <button
        ref="tab"
        class="tab"
        type="button"
        :aria-expanded="open"
        :aria-controls="panelId"
        data-testid="song-browser-tab"
        @click="toggle"
      >
        <span class="tab-label">Songs</span>
        <span class="tab-count mono" aria-hidden="true">{{ store.library.length }}</span>
      </button>
      <div
        :id="panelId"
        class="sheet"
        role="region"
        aria-labelledby="song-browser-heading"
        :aria-hidden="!open"
        :inert="!open"
        data-testid="song-browser-panel"
      >
        <div class="head">
          <h2 id="song-browser-heading">Song browser</h2>
          <button
            ref="closeButton"
            class="icon"
            type="button"
            aria-label="Close song browser"
            data-testid="song-browser-close"
            @click="hide(true)"
          >
            ×
          </button>
        </div>
        <p class="muted intro">Songs saved in this browser. Pick one to work on it.</p>
        <button class="primary new" type="button" data-testid="browser-new-song" @click="create">+ New song</button>
        <p v-if="store.saveState === 'unavailable'" class="status-warn msg" data-testid="browser-unavailable">
          Browser storage is unavailable, so songs cannot be saved or listed here.
        </p>
        <p v-else-if="store.library.length === 0" class="muted msg" data-testid="browser-empty">No songs saved yet.</p>
        <ul v-else class="songs" data-testid="song-list">
          <li
            v-for="entry in store.library"
            :key="entry.id"
            class="song"
            :class="{ current: entry.id === store.currentId }"
            data-testid="song-entry"
            :data-song-id="entry.id"
          >
            <button
              class="pick"
              type="button"
              :aria-current="entry.id === store.currentId ? 'true' : undefined"
              :title="entry.id === store.currentId ? 'Open now' : `Open ${displayName(entry)}`"
              data-testid="song-pick"
              @click="select(entry)"
            >
              <span class="name">{{ displayName(entry) }}</span>
              <span class="meta">
                {{ plural(entry.channels, 'channel') }} · {{ plural(entry.sections, 'section') }} · edited
                {{ formatEdited(entry.updatedAt) }}
              </span>
            </button>
            <button
              class="icon"
              type="button"
              :aria-label="`Duplicate ${displayName(entry)}`"
              title="Duplicate (opens the copy)"
              data-testid="song-duplicate"
              @click="duplicate(entry)"
            >
              ⧉
            </button>
            <button
              class="icon danger"
              type="button"
              :aria-label="`Delete ${displayName(entry)}`"
              title="Delete from this browser"
              data-testid="song-delete"
              @click="askRemove(entry, $event)"
            >
              ×
            </button>
          </li>
        </ul>
      </div>
    </aside>
    <ConfirmDialog
      v-if="pendingDelete"
      :title="`Delete “${displayName(pendingDelete.entry)}”?`"
      confirm-label="Delete"
      danger
      @confirm="confirmRemove"
      @cancel="cancelRemove"
    >
      <p>This removes the song from this browser. It cannot be undone.</p>
      <p v-if="pendingDelete.entry.id === store.currentId" data-testid="confirm-current-note">
        It is the open song, so
        {{ store.library.length > 1 ? 'the most recently edited remaining song' : 'a fresh song' }} will open
        instead.
      </p>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.song-browser {
  --drawer-width: min(380px, 88vw);
  --tab-width: 32px;
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(3, 6, 10, 0.55);
}

.drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 41;
  width: var(--drawer-width);
  transform: translateX(calc(-1 * var(--drawer-width)));
  transition: transform 0.25s ease;
}

.song-browser.open .drawer {
  transform: translateX(0);
  box-shadow: 12px 0 32px rgba(0, 0, 0, 0.45);
}

@media (prefers-reduced-motion: reduce) {
  .drawer {
    transition: none;
  }
}

.tab {
  position: absolute;
  top: 120px;
  left: 100%;
  width: var(--tab-width);
  padding: 14px 0 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border-left: none;
  border-radius: 0 var(--radius) var(--radius) 0;
  background: var(--bg-elev);
  color: var(--text);
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.35);
}

.tab:hover:not(:disabled) {
  border-color: var(--accent-dim);
  background: var(--bg-elev-2);
}

.tab-label {
  writing-mode: vertical-rl;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
  font-weight: 600;
}

.tab-count {
  font-size: 11px;
  min-width: 18px;
  padding: 1px 4px;
  border-radius: 9px;
  background: var(--accent-dim);
  color: var(--text);
}

.sheet {
  height: 100%;
  overflow-y: auto;
  padding: 16px 18px 24px;
  background: var(--bg-elev);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.head h2 {
  margin: 0;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.intro,
.msg {
  margin: 0;
  font-size: 12px;
}

.new {
  align-self: flex-start;
}

.songs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.song {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.pick {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  text-align: left;
  padding: 8px 12px;
  background: var(--bg);
}

.song.current .pick {
  border-color: var(--accent);
  background: var(--cell-alt);
}

.name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.song.current .name::before {
  content: '▶ ';
  color: var(--accent);
}

.meta {
  font-size: 11px;
  color: var(--text-dim);
}

.song .icon {
  align-self: center;
}
</style>
