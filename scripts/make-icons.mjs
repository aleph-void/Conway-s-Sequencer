/**
 * Rasterises public/favicon.svg into the PNG icons the web app manifest and iOS need, and
 * renders the 1200x630 social-media preview card (public/og-image.png) that the Open Graph
 * and Twitter Card tags in index.html point at.
 * Run `node scripts/make-icons.mjs` after changing the logo or the card; the PNGs are committed.
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

/**
 * Renders the link-preview card: the logo tile and the app's name over a step grid with a
 * few lit gates, in the app's colours. 1200x630 is the size every major platform crops least.
 * Rendered offline, so the fonts are the same fallbacks the favicon names (Georgia, system sans).
 */
async function renderSocialCard(name, width = 1200, height = 630) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  const tile = svg.replace('<svg ', '<svg class="tile" ')

  // A background of 24x12 steps. Lit gates follow the app's per-track palette: twelve
  // well-separated oklch hues, one per row, and consecutive on-steps join into one bar.
  const cols = 24
  const rows = 12
  // Each row's lit step indices; a few runs so some gates read as long bars like in the app.
  const pattern = [
    [0, 4, 8, 12, 16, 20],
    [2, 6, 10, 14, 18, 22],
    [0, 1, 2, 8, 9, 10, 16, 17, 18],
    [5, 13, 21],
    [3, 7, 11, 12, 15, 19, 23],
    [0, 6, 12, 18],
    [4, 5, 10, 11, 16, 17, 22, 23],
    [1, 9, 17],
    [2, 3, 8, 14, 15, 20],
    [0, 12],
    [6, 7, 13, 19],
    [3, 11, 18, 19, 20],
  ]
  const trackHues = [295, 25, 85, 145, 205, 265, 325, 55, 115, 175, 235, 5]
  let cells = ''
  for (let r = 0; r < rows; r++) {
    const on = new Set(pattern[r])
    for (let c = 0; c < cols; c++) {
      if (!on.has(c)) {
        cells += '<i></i>'
        continue
      }
      const joinLeft = on.has(c - 1)
      const joinRight = on.has(c + 1)
      cells += `<i class="on${joinLeft ? ' jl' : ''}${joinRight ? ' jr' : ''}" style="--hue:${trackHues[r]}"></i>`
    }
  }

  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    html, body { width: ${width}px; height: ${height}px; overflow: hidden }
    body {
      position: relative; background: #0a0a0f; color: #e4e4e7;
      font-family: Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    /* The step grid fades out towards the left so the text stays legible. */
    .grid {
      position: absolute; inset: 0; display: grid;
      grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr);
      gap: 3px; padding: 24px;
      -webkit-mask-image: linear-gradient(100deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.9) 100%);
      mask-image: linear-gradient(100deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.9) 100%);
    }
    .grid i { display: block; background: #12121a; border-radius: 4px }
    .grid i:nth-child(${cols * 2}n + 1), .grid i:nth-child(${cols * 2}n + 2) { background: #16161f }
    .grid i.on {
      background: oklch(70% 0.17 var(--hue));
      box-shadow: 0 0 18px oklch(70% 0.17 var(--hue) / 0.35);
    }
    .grid i.on.jl { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: -3px }
    .grid i.on.jr { border-top-right-radius: 0; border-bottom-right-radius: 0 }
    .scrim {
      position: absolute; inset: 0;
      background: linear-gradient(100deg, rgba(10,10,15,0.97) 0%, rgba(10,10,15,0.92) 60%, rgba(10,10,15,0.6) 82%, rgba(10,10,15,0.15) 100%);
    }
    .content {
      position: absolute; inset: 0; display: flex; align-items: center; gap: 64px; padding: 0 96px;
    }
    .tile { width: 256px; height: 256px; flex: none; display: block;
      filter: drop-shadow(0 12px 40px rgba(139, 92, 246, 0.35)) }
    .text { display: flex; flex-direction: column; gap: 22px; max-width: 720px }
    .kicker { font-size: 22px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: #a78bfa }
    h1 { font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; font-weight: 400;
      font-size: 92px; line-height: 1; letter-spacing: -0.01em; color: #ffffff }
    p { font-size: 28px; line-height: 1.35; font-weight: 300; color: #a1a1aa; text-wrap: balance }
    .footer { position: absolute; left: 96px; right: 96px; bottom: 44px; display: flex;
      justify-content: space-between; font-size: 22px; color: #71717a }
    .footer b { font-weight: 500; color: #a1a1aa }
  </style></head><body>
    <div class="grid">${cells}</div>
    <div class="scrim"></div>
    <div class="content">
      ${tile}
      <div class="text">
        <div class="kicker">Eurorack · Web MIDI · Free</div>
        <h1>Conway’s Sequencer</h1>
        <p>A binary gate sequencer for the Nervous Squirrel Conway’s Game module. Runs in your browser, works offline.</p>
      </div>
    </div>
    <div class="footer"><span>conways-sequencer.alephvoid.com</span><span>by <b>Aleph Void</b></span></div>
  </body></html>`)
  const path = fileURLToPath(new URL(`../public/${name}`, import.meta.url))
  await page.screenshot({ path, type: 'png' })
  await page.close()
  console.log('wrote public/' + name)
}

await renderSocialCard('og-image.png')
await browser.close()
