<script setup lang="ts">
import { computed } from 'vue'
import { useSongStore } from '../stores/song'
import BrandLogo from './BrandLogo.vue'

const store = useSongStore()
const name = computed({
  get: () => store.song.name,
  set: (value: string) => store.rename(value),
})
</script>

<template>
  <header class="header">
    <div class="header-inner">
      <a class="brand" href="https://alephvoid.com" target="_blank" rel="noopener" aria-label="Aleph Void, LLC">
        <BrandLogo :size="44" />
        <span class="brand-name">Aleph Void</span>
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
    </div>
  </header>
</template>

<style scoped>
/* Matches the fixed nav on alephvoid.com: translucent near-black with a hairline border. */
.header {
  position: relative;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(12px);
  overflow: hidden;
}

/* The site's hero glow, toned down to a faint violet wash behind the header. */
.header::before {
  content: '';
  position: absolute;
  top: -260px;
  left: 50%;
  transform: translateX(-50%);
  width: 620px;
  height: 420px;
  background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
  pointer-events: none;
}

.header-inner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 28px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--text);
}

.brand:hover {
  color: var(--text);
}

.brand-name {
  font-weight: 600;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}

.title {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
  padding-left: 28px;
  border-left: 1px solid var(--border);
}

h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.song-name {
  width: 220px;
  background: transparent;
  border-color: transparent;
  color: var(--text-dim);
}

.song-name:hover,
.song-name:focus {
  border-color: var(--border);
  background: var(--bg);
  color: var(--text);
}

@media (max-width: 767px) {
  .header {
    padding: 10px 12px;
  }

  .brand-name {
    display: none;
  }

  .header-inner {
    gap: 12px;
  }

  .title {
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    padding-left: 12px;
  }

  h1 {
    font-size: 16px;
  }

  .song-name {
    width: auto;
    max-width: 100%;
  }
}
</style>
