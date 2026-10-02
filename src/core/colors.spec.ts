import { describe, expect, it } from 'vitest'
import { TRACK_HUES, trackHue } from './colors'

describe('trackHue', () => {
  it('gives every row in the palette a distinct hue', () => {
    const hues = TRACK_HUES.map((_, i) => trackHue(i))
    expect(new Set(hues).size).toBe(TRACK_HUES.length)
    expect(hues[0]).toBe(295)
  })

  it('keeps neighbouring rows well apart on the colour wheel', () => {
    for (let i = 0; i < TRACK_HUES.length; i++) {
      const a = trackHue(i)
      const b = trackHue(i + 1)
      const distance = Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
      expect(distance).toBeGreaterThanOrEqual(90)
    }
  })

  it('wraps around past the end of the palette', () => {
    expect(trackHue(TRACK_HUES.length)).toBe(trackHue(0))
    expect(trackHue(TRACK_HUES.length * 3 + 5)).toBe(trackHue(5))
    expect(trackHue(-1)).toBe(trackHue(TRACK_HUES.length - 1))
  })
})
