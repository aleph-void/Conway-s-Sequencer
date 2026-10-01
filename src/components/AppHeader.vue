<script setup lang="ts">
import { computed } from 'vue'
import { useSongStore } from '../stores/song'

const store = useSongStore()
const name = computed({
  get: () => store.song.name,
  set: (value: string) => store.rename(value),
})
</script>

<template>
  <header class="header">
    <a class="brand" href="https://alephvoid.com" target="_blank" rel="noopener" aria-label="alephvoid.com">
      <span class="brand-mark" aria-hidden="true">
        <i /><i class="dim" /><i /><i class="dim" /><i /><i class="dim" /><i /><i class="dim" /><i />
      </span>
      <span class="brand-text">
        <span class="brand-name">alephvoid</span><span class="brand-tld">.com</span>
      </span>
    </a>
    <div class="title">
      <h1>Conway's Sequencer</h1>
      <input
        v-model="name"
        class="song-name"
        type="text"
        aria-label="Song name"
        placeholder="Untitled"
        data-testid="song-name"
      />
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, #0f151c, var(--bg));
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
}

.brand-mark {
  display: grid;
  grid-template-columns: repeat(3, 8px);
  gap: 2px;
}

.brand-mark i {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--accent);
}

.brand-mark i.dim {
  opacity: 0.3;
}

.brand-name {
  font-weight: 700;
  letter-spacing: 0.02em;
}

.brand-tld {
  color: var(--text-dim);
}

.title {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}

h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.song-name {
  width: 220px;
  background: transparent;
  border-color: transparent;
}

.song-name:hover,
.song-name:focus {
  border-color: var(--border);
  background: var(--bg);
}
</style>
