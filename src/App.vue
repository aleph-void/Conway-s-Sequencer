<script setup lang="ts">
import AppHeader from './components/AppHeader.vue'
import MidiPanel from './components/MidiPanel.vue'
import TransportBar from './components/TransportBar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SectionsPanel from './components/SectionsPanel.vue'
import SequencerGrid from './components/SequencerGrid.vue'
import SongIO from './components/SongIO.vue'
</script>

<template>
  <div class="app">
    <AppHeader />
    <main class="layout">
      <div class="top">
        <MidiPanel />
        <TransportBar />
        <SongIO />
      </div>
      <div class="middle">
        <SectionsPanel />
        <SettingsPanel />
      </div>
      <SequencerGrid />
    </main>
    <footer class="footer">
      <span>
        Built for the
        <a href="https://www.nervoussquirrel.com/conways_game.html" target="_blank" rel="noopener">Nervous Squirrel
          Conway's Game</a>
        eurorack module.
      </span>
      <span>
        &copy; <a href="https://alephvoid.com" target="_blank" rel="noopener">alephvoid.com</a>
      </span>
    </footer>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  max-width: 1600px;
  width: 100%;
  margin: 0 auto;
}

.top,
.middle {
  display: grid;
  gap: 14px;
}

.top {
  grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.4fr) minmax(220px, 0.8fr);
}

.middle {
  grid-template-columns: minmax(420px, 2fr) minmax(260px, 1fr);
}

@media (max-width: 1000px) {
  .top,
  .middle {
    grid-template-columns: 1fr;
  }
}

.footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px 20px;
  color: var(--text-dim);
  font-size: 12px;
  border-top: 1px solid var(--border);
}
</style>
