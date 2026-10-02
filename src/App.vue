<script setup lang="ts">
import { computed } from 'vue'
import AppHeader from './components/AppHeader.vue'
import MidiPanel from './components/MidiPanel.vue'
import TransportBar from './components/TransportBar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import EditorPanel from './components/EditorPanel.vue'
import SectionsPanel from './components/SectionsPanel.vue'
import SequencerGrid from './components/SequencerGrid.vue'
import ModuleView from './components/ModuleView.vue'
import SongIO from './components/SongIO.vue'
import SongBrowser from './components/SongBrowser.vue'
import BrandLogo from './components/BrandLogo.vue'
import PwaStatus from './components/PwaStatus.vue'
import { isVerticalOrientation, useUiStore } from './stores/ui'
import { useFullscreen } from './composables/useFullscreen'

const ui = useUiStore()
const fullscreen = useFullscreen()
const year = new Date().getFullYear()
/** Vertical tracks run down the page instead of scrolling inside the grid (see the styles). */
const tracksVertical = computed(() => isVerticalOrientation(ui.trackOrientation))
</script>

<template>
  <div class="app" :class="{ 'tracks-vertical': tracksVertical }">
    <AppHeader />
    <SongBrowser />
    <main class="layout">
      <div class="toolbar panel">
        <MidiPanel />
        <span class="divider" aria-hidden="true" />
        <TransportBar />
        <div class="toolbar-actions">
          <button
            class="settings-toggle"
            :class="{ active: ui.settingsOpen }"
            :aria-expanded="ui.settingsOpen"
            aria-controls="settings-drawer"
            data-testid="toggle-settings"
            @click="ui.toggleSettings()"
          >
            <span class="chevron" aria-hidden="true">{{ ui.settingsOpen ? '▾' : '▸' }}</span>
            Settings
          </button>
          <button
            :class="{ active: ui.moduleViewOpen }"
            :aria-pressed="ui.moduleViewOpen"
            aria-controls="module-view"
            :title="ui.moduleViewOpen ? 'Hide the module view' : 'Show the module\'s outputs and which are high'"
            data-testid="toggle-module-view"
            @click="ui.toggleModuleView()"
          >
            <span class="glyph" aria-hidden="true">▦</span>
            Module
          </button>
          <button
            v-if="fullscreen.supported"
            :class="{ active: fullscreen.active.value }"
            :aria-pressed="fullscreen.active.value"
            :title="fullscreen.active.value ? 'Exit full screen' : 'Show the sequencer full screen'"
            data-testid="toggle-fullscreen"
            @click="fullscreen.toggle()"
          >
            <span class="glyph" aria-hidden="true">{{ fullscreen.active.value ? '⤡' : '⤢' }}</span>
            {{ fullscreen.active.value ? 'Exit full screen' : 'Full screen' }}
          </button>
        </div>
      </div>
      <div v-if="ui.settingsOpen" id="settings-drawer" class="drawer" data-testid="settings-drawer">
        <SectionsPanel />
        <div class="drawer-side">
          <SettingsPanel />
          <EditorPanel />
          <SongIO />
        </div>
      </div>
      <div class="workspace">
        <SequencerGrid />
        <ModuleView v-if="ui.moduleViewOpen" />
      </div>
    </main>
    <footer class="footer">
      <a class="footer-brand" href="https://alephvoid.com" target="_blank" rel="noopener">
        <BrandLogo :size="22" />
        <span>Aleph Void</span>
      </a>
      <span class="footer-copy">
        Built for the
        <a href="https://www.nervoussquirrel.com/conways_game.html" target="_blank" rel="noopener">Nervous Squirrel
          Conway's Game</a>
        eurorack module.
      </span>
      <span class="footer-copy">
        &copy; {{ year }} <a href="https://alephvoid.com" target="_blank" rel="noopener">Aleph Void, LLC</a>. All rights
        reserved.
      </span>
    </footer>
    <PwaStatus />
  </div>
</template>

<style scoped>
/* The shell is viewport-sized; the grid takes whatever the toolbar and drawer leave over. */
.app {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}

.layout {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* Extra room on the left for the Song browser's tab. */
  padding: 12px 16px 12px 40px;
  width: 100%;
}

.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 18px;
  padding: 10px 14px;
}

.divider {
  width: 1px;
  align-self: stretch;
  background: var(--border);
}

.toolbar-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.toolbar-actions button.active {
  border-color: var(--accent);
  color: var(--accent-light);
}

.glyph {
  font-size: 13px;
  line-height: 1;
  color: var(--text-muted);
}

button.active .glyph {
  color: var(--accent-light);
}

.chevron {
  font-size: 11px;
  width: 0.8em;
  display: inline-block;
  color: var(--text-muted);
}

.settings-toggle.active .chevron {
  color: var(--accent-light);
}

.drawer {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(420px, 2fr) minmax(280px, 1fr);
  align-items: start;
  gap: 12px;
}

/* Grid items default to min-width:auto, which would let the sections table widen the page. */
.drawer > * {
  min-width: 0;
}

/* The gate grid, with the module view beside it when shown. */
.workspace {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  gap: 12px;
}

/* The grid scrolls inside its panel; without this it would widen the row instead. */
.workspace > * {
  min-width: 0;
}

@media (max-width: 999px) {
  .workspace {
    flex-direction: column;
  }

  /* On a narrow screen the module view goes above the grid, where it stays on screen. */
  .workspace > :last-child:not(:first-child) {
    order: -1;
    flex: 0 0 auto;
  }
}

.drawer-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 1000px) {
  .drawer {
    grid-template-columns: 1fr;
  }

  .divider {
    display: none;
  }
}

/*
 * On short screens the drawer must not squeeze the grid out entirely: when the shell runs
 * out of height the drawer gives way first (a large shrink factor), scrolling inside what
 * is left, and the grid keeps the rest. Without this the overflow would spill under the
 * footer, which paints over the last channel rows.
 */
@media (max-height: 760px) {
  .drawer {
    flex: 0 100 auto;
    min-height: 180px;
    max-height: 45vh;
    overflow: auto;
  }
}

/*
 * Vertical tracks (top to bottom, bottom to top) run down the page. A song is far taller
 * than it is wide that way, so rather than scroll it inside a viewport-sized box the
 * shell grows with the grid and the page scrolls, as it does below desktop width. The
 * grid's own scroller then only ever scrolls sideways, across the channels.
 */
.app.tracks-vertical {
  height: auto;
  min-height: 100vh;
  min-height: 100dvh;
}

.tracks-vertical .drawer {
  flex: 0 0 auto;
  min-height: 0;
  max-height: none;
  overflow: visible;
}

/* The module view keeps its place at the top of the window while the song scrolls past. */
@media (min-width: 1000px) {
  .tracks-vertical .workspace > :last-child:not(:first-child) {
    position: sticky;
    top: 12px;
    align-self: flex-start;
    max-height: calc(100vh - 24px);
    max-height: calc(100dvh - 24px);
  }
}

/*
 * Tablets, small windows and landscape phones scroll as a page. The viewport-sized shell
 * only works when the toolbar, the open drawer and a useful slice of grid all fit, which
 * they do not below desktop width or on a very short screen. With the drawer closed the
 * grid still stretches to fill the screen.
 */
@media (max-width: 1199px), (max-height: 520px) {
  .app {
    height: auto;
    min-height: 100vh;
    min-height: 100dvh;
  }

  .drawer {
    flex: 0 0 auto;
    min-height: 0;
    max-height: none;
    overflow: visible;
  }
}

.footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 24px;
  padding: 8px 20px;
  color: var(--text-muted);
  font-size: 11.5px;
  border-top: 1px solid var(--border);
}

.footer-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: -0.01em;
}

.footer-brand:hover {
  color: var(--text);
}

.footer-copy a {
  color: var(--text-dim);
}

.footer-copy a:hover {
  color: var(--accent-light);
}

/* Phones: the toolbar stacks MIDI, transport and actions; everything else is a single column. */
@media (max-width: 767px) {
  .layout {
    gap: 8px;
    /* The Song browser tab still needs its gutter on the left; keep clear of notches. */
    padding: 8px calc(8px + env(safe-area-inset-right, 0px)) 8px calc(36px + env(safe-area-inset-left, 0px));
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 10px 12px;
  }

  .toolbar-actions {
    margin-left: 0;
  }

  .toolbar-actions button {
    flex: 1 1 0;
    justify-content: center;
  }

  .footer {
    justify-content: center;
    text-align: center;
    gap: 4px 16px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
