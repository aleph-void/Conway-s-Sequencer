import { test as base, expect, type Page } from '@playwright/test'

export interface MidiLogEntry {
  port: string
  data: number[]
  timestamp: number | undefined
}

declare global {
  interface Window {
    __midiLog: MidiLogEntry[]
    __midiStateChange?: () => void
  }
}

/**
 * Installs a fake Web MIDI implementation before any page script runs.
 * Every message sent to a fake output is recorded in window.__midiLog.
 */
export async function installFakeMidi(page: Page, outputs: Array<{ id: string; name: string }> = []) {
  await page.addInitScript((ports) => {
    window.__midiLog = []
    const map = new Map()
    for (const p of ports) {
      map.set(p.id, {
        id: p.id,
        name: p.name,
        manufacturer: 'Fake Devices',
        state: 'connected',
        type: 'output',
        send(data: number[] | Uint8Array, timestamp?: number) {
          window.__midiLog.push({ port: p.id, data: Array.from(data), timestamp })
        },
      })
    }
    const access = { outputs: map, inputs: new Map(), sysexEnabled: false, onstatechange: null as null | (() => void) }
    window.__midiStateChange = () => access.onstatechange?.()
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      configurable: true,
      value: () => Promise.resolve(access),
    })
  }, outputs)
}

export const test = base.extend<{ midiPage: Page }>({
  midiPage: async ({ page }, use) => {
    await installFakeMidi(page, [
      { id: 'conway', name: 'Conway Interface' },
      { id: 'other', name: 'Some Other Synth' },
    ])
    await page.goto('/')
    await use(page)
  },
})

export { expect }
export type { Page }

export async function enableMidi(page: Page, outputId = 'conway') {
  await page.getByTestId('enable-midi').click()
  await page.getByTestId('midi-output').selectOption(outputId)
  await expect(page.getByTestId('midi-status')).toContainText('Sending to')
}

export async function midiLog(page: Page): Promise<MidiLogEntry[]> {
  return page.evaluate(() => window.__midiLog)
}

/** The shape of an autosaved song that the specs assert on; `{}` when nothing is stored. */
export interface StoredSong {
  name?: string
  channels?: Array<{ id: string; name: string }>
  sections?: Array<{
    steps: Record<string, number[]>
    divisions?: Record<string, Record<string, number>>
    swing?: number | null
  }>
  settings?: { velocity: number }
}

/** The open song's autosaved JSON, parsed, as the song library stores it. */
export async function storedSong(page: Page): Promise<StoredSong> {
  return page.evaluate(() => {
    const index = JSON.parse(localStorage.getItem('conways-sequencer:library') ?? '{}')
    const id = index.currentId
    return JSON.parse((id && localStorage.getItem(`conways-sequencer:song:${id}`)) || '{}')
  })
}
