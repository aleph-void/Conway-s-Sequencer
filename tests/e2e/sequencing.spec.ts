import { enableMidi, expect, midiLog, storedSong, test, type MidiLogEntry } from './fixtures'

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
  test('reorders sections by dragging their handles and duplicates them', async ({ midiPage: page }) => {
    const rows = page.getByTestId('sections-table').locator('tbody tr')
    await page.getByTestId('add-section').click()
    await page.getByTestId('add-section').click()
    await rows.nth(1).getByTestId('section-name').fill('B')
    await rows.nth(1).getByTestId('section-name').press('Tab')
    await rows.nth(2).getByTestId('section-name').fill('C')
    await rows.nth(2).getByTestId('section-name').press('Tab')
    const names = () => rows.locator('[data-testid="section-name"]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
    expect(await names()).toEqual(['A', 'B', 'C'])

    // Give A a gate so the grid proves the section itself moved, not just its name.
    await page.getByTestId('cell-0-0-0').click()

    // Drag A's handle to the lower half of C's row: A lands last.
    const handle = rows.nth(0).getByTestId('section-handle')
    const target = (await rows.nth(2).boundingBox())!
    const grip = (await handle.boundingBox())!
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 10, { steps: 3 })
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.8, { steps: 10 })
    // One more nudge so the browser delivers a dragover at the final position.
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.8 + 1)
    await expect(rows.nth(2)).toHaveClass(/drop-after/)
    await page.mouse.up()
    expect(await names()).toEqual(['B', 'C', 'A'])
    await expect(page.getByTestId('grid-section-2')).toContainText('A')
    await expect(page.getByTestId('cell-0-2-0')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('cell-0-0-0')).toHaveAttribute('aria-checked', 'false')
    // Nothing is left in a drag state.
    await expect(rows.nth(2)).not.toHaveClass(/dragging|drop-/)

    // Duplicate C: the copy lands right after it with the same settings and notes.
    await page.getByTestId('cell-0-1-5').click()
    await rows.nth(1).getByTestId('section-duplicate').click()
    expect(await names()).toEqual(['B', 'C', 'C copy', 'A'])
    await expect(page.getByTestId('cell-0-1-5')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('cell-0-2-5')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('cell-0-3-0')).toHaveAttribute('aria-checked', 'true')

    // The new order survives a reload.
    await page.reload()
    expect(await names()).toEqual(['B', 'C', 'C copy', 'A'])
  })

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
    await expect(page.getByTestId('autosave-status')).toContainText('Autosaved at')
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'saved')
    await expect.poll(async () => (await storedSong(page)).channels?.[0]?.name).toBe('Kick')

    await page.reload()
    for (const s of [4, 5, 6, 7]) await expect(cell(1, s)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('channel-name').first()).toHaveValue('Kick')
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'idle')
  })

  test('autosaves every kind of edit, including settings and sections', async ({ midiPage: page }) => {
    const stored = () => storedSong(page)
    await page.getByTestId('song-name').fill('Everything')
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'saved')
    await expect.poll(async () => (await stored()).name).toBe('Everything')

    await page.getByTestId('velocity').fill('77')
    await page.getByTestId('velocity').press('Tab')
    await expect.poll(async () => (await stored()).settings?.velocity).toBe(77)

    await page.getByTestId('add-section').click()
    await expect.poll(async () => (await stored()).sections?.length).toBe(2)

    await page.getByTestId('cell-5-1-2').click()
    await expect.poll(async () => (await stored()).sections?.[1]?.steps).toEqual({
      [(await stored()).channels![5]!.id]: [2],
    })
  })

  test('supports up to 62 channels', async ({ midiPage: page }) => {
    const add = page.getByTestId('add-channel')
    for (let i = 8; i < 62; i++) await add.click()
    await expect(page.getByTestId('channel-count')).toContainText('62 / 62 channels')
    await expect(add).toBeDisabled()
    await expect(page.getByTestId('channel-output').last()).toHaveValue('62')
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

    // Wait until a full beat of the clock (16 pulses) plus the start of the next has gone out.
    const clockOns = (log: MidiLogEntry[]) => log.filter((e) => e.data[0] === 0x90 && e.data[1] === 99)
    await expect.poll(async () => clockOns(await midiLog(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(17)
    const log = await midiLog(page)
    expect(log.every((e) => e.port === 'conway')).toBe(true)
    // The play gate (note 100) goes high before the first step. The clock is checked separately below.
    const gates = log.filter((e) => e.data[1] !== 99)
    const first = gates.slice(0, 5).map((e) => e.data)
    expect(first).toEqual([
      [0x90, 100, 100],
      [0x90, 36, 100],
      [0x80, 36, 0],
      [0x90, 38, 100],
      [0x80, 38, 0],
    ])
    expect(gates[1]!.timestamp).toBeDefined()
    expect(gates[3]!.timestamp! - gates[1]!.timestamp!).toBeCloseTo(500, -1)

    // The x16 clock (note 99) pulses 16 times per 500 ms beat, each pulse followed by its note-off.
    const clock = log.filter((e) => e.data[1] === 99)
    expect(clock[0]!.data).toEqual([0x90, 99, 100])
    expect(clock[1]!.data).toEqual([0x80, 99, 0])
    const ons = clockOns(log)
    const t0 = ons[0]!.timestamp!
    expect(t0).toBeCloseTo(gates[1]!.timestamp!, 1)
    expect(ons.filter((e) => e.timestamp! < t0 + 499).length).toBe(16)
    expect(ons[1]!.timestamp! - t0).toBeCloseTo(31.25, 1)
    expect(ons[16]!.timestamp! - t0).toBeCloseTo(500, 1)

    await page.getByTestId('play').click()
    await expect(page.getByTestId('play')).toContainText('Play')
    await expect(page.getByTestId('position')).toHaveText('0:00')
    // Stopping releases the play gate.
    expect((await midiLog(page)).at(-1)!.data).toEqual([0x80, 100, 0])
  })

  test('solo plays only the soloed channels and marks the rest as muted', async ({ midiPage: page }) => {
    await enableMidi(page)
    await page.getByTestId('cell-0-0-0').click()
    await page.getByTestId('cell-1-0-0').click()
    await page.getByTestId('cell-2-0-0').click()

    const solo = (i: number) => page.getByTestId(`channel-header-${i}`).getByTestId('channel-solo')
    const mute = (i: number) => page.getByTestId(`channel-header-${i}`).getByTestId('channel-mute')

    await solo(1).click()
    await expect(solo(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(mute(0)).toHaveAttribute('title', 'Muted by solo')
    await expect(mute(2)).toHaveAttribute('title', 'Muted by solo')
    await expect(mute(1)).toHaveAttribute('title', 'Mute')

    // A second solo joins the first: its implied mute is lifted.
    await solo(2).click()
    await expect(mute(2)).toHaveAttribute('title', 'Mute')
    await expect(mute(0)).toHaveAttribute('title', 'Muted by solo')

    await page.getByTestId('play').click()
    await expect.poll(async () => (await midiLog(page)).length, { timeout: 5000 }).toBeGreaterThanOrEqual(2)
    await page.getByTestId('play').click()
    const notesOn = (await midiLog(page)).filter((e) => e.data[0] === 0x90).map((e) => e.data[1])
    expect(notesOn).toContain(37)
    expect(notesOn).toContain(38)
    expect(notesOn).not.toContain(36)
  })

  test('space toggles playback and panic sends note-offs for all outputs', async ({ midiPage: page }) => {
    await enableMidi(page)
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Space')
    await expect(page.getByTestId('play')).toContainText('Stop')
    expect((await midiLog(page))[0]!.data).toEqual([0x90, 100, 100])
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('play')).toContainText('Play')
    const log = await midiLog(page)
    // Stop releases the play gate, then panic floods all 62 outputs, the clock and the play gate.
    const flood = log.slice(-65).map((e) => e.data)
    expect(log.at(-66)!.data).toEqual([0x80, 100, 0])
    expect(flood[0]).toEqual([0x80, 36, 0])
    expect(flood[61]).toEqual([0x80, 97, 0])
    expect(flood[62]).toEqual([0x80, 99, 0])
    expect(flood[63]).toEqual([0x80, 100, 0])
    expect(flood[64]).toEqual([0xb0, 123, 0])
  })

  test('uses the configured MIDI channel and base note', async ({ midiPage: page }) => {
    await enableMidi(page)
    await page.getByTestId('midi-channel').fill('5')
    await page.getByTestId('midi-channel').press('Tab')
    await page.getByTestId('base-note').fill('60')
    await page.getByTestId('base-note').press('Tab')
    await page.getByTestId('cell-3-0-0').click()
    await page.getByTestId('play').click()
    await expect.poll(async () => (await midiLog(page)).length).toBeGreaterThanOrEqual(3)
    const log = await midiLog(page)
    expect(log[0]!.data).toEqual([0x94, 100, 100])
    expect(log[1]!.data).toEqual([0x94, 63, 100])
    // The clock ignores the base note and uses the configured channel.
    expect(log[2]!.data).toEqual([0x94, 99, 100])
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
