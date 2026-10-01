<script setup lang="ts">
import AppHeader from './components/AppHeader.vue'
import MidiPanel from './components/MidiPanel.vue'
import TransportBar from './components/TransportBar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SectionsPanel from './components/SectionsPanel.vue'
import SequencerGrid from './components/SequencerGrid.vue'
import SongIO from './components/SongIO.vue'
import SongBrowser from './components/SongBrowser.vue'
import BrandLogo from './components/BrandLogo.vue'
import { useUiStore } from './stores/ui'
import { useFullscreen } from './composables/useFullscreen'

const ui = useUiStore()
const fullscreen = useFullscreen()
const year = new Date().getFullYear()
</script>

<template>
  <div class="app">
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
          <SongIO />
        </div>
      </div>
      <SequencerGrid />
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
  max-width: 1600px;
  width: 100%;
  margin: 0 auto;
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

/* On short screens the drawer must not squeeze the grid out entirely. */
@media (max-height: 760px) {
  .drawer {
    max-height: 45vh;
    overflow: auto;
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
</style>
