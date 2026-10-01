/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// BASE_PATH is set by the GitHub Pages deploy workflow to "/<repo-name>/".
// Locally it defaults to "/" so `npm run dev` and `npm run preview` just work.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/main.ts', 'src/**/*.spec.ts', 'src/**/*.d.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
})
