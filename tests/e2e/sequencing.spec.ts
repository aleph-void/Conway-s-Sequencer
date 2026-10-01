import { enableMidi, expect, midiLog, test } from './fixtures'

test.describe('sections', () => {
  test('adds sections that inherit tempo and reshape the grid', async ({ midiPage: page }) => {
    await page.getByTestId('add-section').click()
    const rows = page.getByTestId('sections-table').locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(1).getByTestId('tempo-inherited')).toContainText('120')

    await rows.nth(0).getByTestId('section-tempo').fill('90')
    await rows.nth(0).getByTestId('section-tempo').press('Tab')
    await expect(rows.nth(1).getByTestId('tempo-inherited')).toContainText('90')
    await expect(page.getByTestId('grid-section-1')).toContainText('90 BPM')

    await rows.nth(1).getByTestId('section-beats').fill('7')
    await rows.nth(1).getByTestId('section-beats').press('Tab')
    await rows.nth(1).getByTestId('section-unit').selectOption('8')
    await rows.nth(1).getByTestId('section-bars').fill('2')
    await rows.nth(1).getByTestId('section-bars').press('Tab')
    await rows.nth(1).getByTestId('section-subdivision').selectOption('2')
    await expect(rows.nth(1)).toContainText('28 steps')
    await expect(page.getByTestId('grid-section-1')).toContainText('7/8 · 2 bars')
    await expect(page.locator('[data-testid="channel-row-0"] .cell')).toHaveCount(64 + 28)

    await rows.nth(1).getByTestId('section-tempo').fill('140')
    await rows.nth(1).getByTestId('section-tempo').press('Tab')
    await expect(rows.nth(1).getByTestId('tempo-inherited')).toHaveCount(0)
    await expect(page.getByTestId('grid-section-1')).toContainText('140 BPM')
  })
})

test.describe('drawing gates', () => {
  test('click toggles, drag paints, and the song survives a reload', async ({ midiPage: page }) => {
    const cell = (c: number, s: number) => page.getByTestId(`cell-${c}-0-${s}`)
    await cell(0, 0).click()
    await expect(cell(0, 0)).toHaveAttribute('aria-checked', 'true')
    await cell(0, 0).click()
    await expect(cell(0, 0)).toHaveAttribute('aria-checked', 'false')

    // Drag across four cells on channel 1.
    const start = await cell(1, 4).boundingBox()
    const end = await cell(1, 7).boundingBox()
    if (!start || !end) throw new Error('cells not laid out')
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 })
    await page.mouse.up()
    for (const s of [4, 5, 6, 7]) await expect(cell(1, s)).toHaveAttribute('aria-checked', 'true')
    await expect(cell(1, 8)).toHaveAttribute('aria-checked', 'false')

    await page.getByTestId('channel-name').first().fill('Kick')
    await page.getByTestId('channel-name').first().press('Tab')
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('conways-sequencer:song') ?? ''))
      .toContain('"Kick"')

    await page.reload()
    for (const s of [4, 5, 6, 7]) await expect(cell(1, s)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('channel-name').first()).toHaveValue('Kick')
  })

  test('supports up to 64 channels', async ({ midiPage: page }) => {
    const add = page.getByTestId('add-channel')
    for (let i = 8; i < 64; i++) await add.click()
    await expect(page.getByTestId('channel-count')).toContainText('64 / 64 channels')
    await expect(add).toBeDisabled()
    await expect(page.getByTestId('channel-output').last()).toHaveValue('64')
  })
})

test.describe('playback', () => {
  test('sends gates for drawn steps to the selected interface and silences on stop', async ({ midiPage: page }) => {
    await enableMidi(page)
    await page.getByTestId('cell-0-0-0').click()
    await page.getByTestId('cell-2-0-4').click()
    await page.getByTestId('play').click()
    await expect(page.getByTestId('play')).toContainText('Stop')
    await expect(page.getByTestId('section-readout')).toContainText('A · bar 1')

    await expect.poll(async () => (await midiLog(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(4)
    const log = await midiLog(page)
    expect(log.every((e) => e.port === 'conway')).toBe(true)
    const first = log.slice(0, 4).map((e) => e.data)
    expect(first).toEqual([
      [0x90, 36, 100],
      [0x80, 36, 0],
      [0x90, 38, 100],
      [0x80, 38, 0],
    ])
    expect(log[0]!.timestamp).toBeDefined()
    expect(log[2]!.timestamp! - log[0]!.timestamp!).toBeCloseTo(500, -1)

    await page.getByTestId('play').click()
    await expect(page.getByTestId('play')).toContainText('Play')
    await expect(page.getByTestId('position')).toHaveText('0:00')
  })

  test('space toggles playback and panic sends note-offs for all outputs', async ({ midiPage: page }) => {
    await enableMidi(page)
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Space')
    await expect(page.getByTestId('play')).toContainText('Stop')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('play')).toContainText('Play')
    const log = await midiLog(page)
    const offs = log.filter((e) => e.data[0] === 0x80)
    expect(offs).toHaveLength(64)
    expect(offs[0]!.data).toEqual([0x80, 36, 0])
    expect(offs[63]!.data).toEqual([0x80, 99, 0])
    expect(log.at(-1)!.data).toEqual([0xb0, 123, 0])
  })

  test('uses the configured MIDI channel and base note', async ({ midiPage: page }) => {
    await enableMidi(page)
    await page.getByTestId('midi-channel').fill('5')
    await page.getByTestId('midi-channel').press('Tab')
    await page.getByTestId('base-note').fill('60')
    await page.getByTestId('base-note').press('Tab')
    await page.getByTestId('cell-3-0-0').click()
    await page.getByTestId('play').click()
    await expect.poll(async () => (await midiLog(page)).length).toBeGreaterThanOrEqual(2)
    const log = await midiLog(page)
    expect(log[0]!.data).toEqual([0x94, 63, 100])
    await page.getByTestId('play').click()
  })
})

test.describe('song files', () => {
  test('exports and re-imports JSON', async ({ midiPage: page }) => {
    await page.getByTestId('song-name').fill('Round Trip')
    await page.getByTestId('cell-0-0-2').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('export-song').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('round-trip.conway-seq.json')
    const path = await download.path()
    if (!path) throw new Error('download has no path')

    page.on('dialog', (d) => d.accept())
    await page.getByTestId('new-song').click()
    await expect(page.getByTestId('song-name')).toHaveValue('Untitled')
    await expect(page.getByTestId('cell-0-0-2')).toHaveAttribute('aria-checked', 'false')

    await page.getByTestId('import-file').setInputFiles(path)
    await expect(page.getByTestId('song-name')).toHaveValue('Round Trip')
    await expect(page.getByTestId('cell-0-0-2')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('io-message')).toContainText('Loaded "Round Trip"')
  })

  test('rejects a broken file without losing the current song', async ({ midiPage: page }) => {
    await page.getByTestId('song-name').fill('Keep me')
    await page.getByTestId('import-file').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"channels": "nope"}'),
    })
    await expect(page.getByTestId('io-error')).toContainText('channels')
    await expect(page.getByTestId('song-name')).toHaveValue('Keep me')
  })
})
