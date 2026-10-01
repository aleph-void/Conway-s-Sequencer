/**
 * Rasterises public/favicon.svg into the PNG icons the web app manifest and iOS need.
 * Run `node scripts/make-icons.mjs` after changing the logo; the PNGs are committed.
 * Uses the Chromium that Playwright installs (`npx playwright install chromium`), or the
 * binary named by PLAYWRIGHT_CHROMIUM_PATH.
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
  // Rendered offline: drop the Google Fonts @import so the renderer never waits on the network.
  .replace(/<defs>[\s\S]*?<\/defs>\s*/, '')

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
const browser = await chromium.launch(executablePath ? { executablePath } : {})

/** Renders the logo tile at `size` px. `padding` (0..1) is the share of the canvas left around the tile. */
async function render(name, size, { padding = 0, background = 'transparent' } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  const inner = Math.round(size * (1 - padding * 2))
  const tile = svg.replace('<svg ', `<svg style="width:${inner}px;height:${inner}px;display:block" `)
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${background};` +
      `display:flex;align-items:center;justify-content:center;overflow:hidden">${tile}</body></html>`,
  )
  const path = fileURLToPath(new URL(`../public/${name}`, import.meta.url))
  await page.screenshot({ path, omitBackground: background === 'transparent', type: 'png' })
  await page.close()
  console.log('wrote public/' + name)
}

await render('pwa-192x192.png', 192)
await render('pwa-512x512.png', 512)
// Maskable icons are cropped to a shape by the OS; keep the tile inside the 80 % safe zone.
await render('maskable-icon-512x512.png', 512, { padding: 0.15, background: '#0a0a0f' })
// iOS ignores transparency and the manifest icons; give it an opaque tile on the app's background.
await render('apple-touch-icon.png', 180, { padding: 0.08, background: '#0a0a0f' })
await browser.close()
