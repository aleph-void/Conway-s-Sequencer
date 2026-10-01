/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The site is served from the root of a custom domain, so base defaults to "/".
// BASE_PATH remains overridable for serving from a sub-path if that changes.
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
