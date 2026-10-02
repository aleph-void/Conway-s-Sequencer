import { describe, expect, it } from 'vitest'
import { createSection } from './song'
import {
  barStartTime,
  buildTimeline,
  formatDuration,
  locate,
  locateStep,
  loopRangeSeconds,
  resolveTempos,
  stepDurationSeconds,
  stepStartTime,
  totalBars,
  totalDuration,
  totalSteps,
} from './timing'

describe('resolveTempos', () => {
  it('inherits the previous section tempo when null', () => {
    expect(resolveTempos([{ tempo: 100 }, { tempo: null }, { tempo: 140 }, { tempo: null }])).toEqual([
      100, 100, 140, 140,
    ])
  })

  it('falls back to the default when the first section has no tempo', () => {
    expect(resolveTempos([{ tempo: null }, { tempo: null }])).toEqual([120, 120])
    expect(resolveTempos([{ tempo: null }], 90)).toEqual([90])
  })

  it('ignores non-positive tempos', () => {
    expect(resolveTempos([{ tempo: 100 }, { tempo: 0 }, { tempo: -5 }])).toEqual([100, 100, 100])
  })
})

describe('stepDurationSeconds', () => {
  it('is a sixteenth note at 4/4 with subdivision 4', () => {
    expect(stepDurationSeconds(120, { beats: 4, unit: 4 }, 4)).toBeCloseTo(0.125)
  })

  it('treats the beat as an eighth note in x/8 time', () => {
    // At 120 BPM a quarter note is 0.5s, an eighth 0.25s, subdivided by 2 → 0.125s
    expect(stepDurationSeconds(120, { beats: 7, unit: 8 }, 2)).toBeCloseTo(0.125)
  })

  it('scales with tempo', () => {
    expect(stepDurationSeconds(60, { beats: 4, unit: 4 }, 1)).toBeCloseTo(1)
    expect(stepDurationSeconds(240, { beats: 4, unit: 4 }, 1)).toBeCloseTo(0.25)
  })
})

describe('buildTimeline', () => {
  const sections = [
    createSection({ id: 'a', tempo: 120, bars: 1 }), // 16 steps × 0.125 = 2s
    createSection({ id: 'b', tempo: null, bars: 2, timeSignature: { beats: 3, unit: 4 } }), // 24 steps × 0.125 = 3s
    createSection({ id: 'c', tempo: 60, bars: 1, subdivision: 1 }), // 4 steps × 1s = 4s
  ]

  it('accumulates start steps and start times', () => {
    const tl = buildTimeline({ sections })
    expect(tl.map((t) => t.tempo)).toEqual([120, 120, 60])
    expect(tl.map((t) => t.startStep)).toEqual([0, 16, 40])
    expect(tl.map((t) => t.startBar)).toEqual([0, 1, 3])
    expect(totalBars(tl)).toBe(4)
    expect(tl.map((t) => t.stepCount)).toEqual([16, 24, 4])
    expect(tl.map((t) => t.startTime)).toEqual([0, 2, 5])
    expect(tl.map((t) => t.duration)).toEqual([2, 3, 4])
    expect(totalSteps(tl)).toBe(44)
    expect(totalDuration(tl)).toBe(9)
  })

  it('maps bars on the whole-song bar axis to their start time', () => {
    const tl = buildTimeline({ sections })
    // Section a: one 4/4 bar of 2 s; b: two 3/4 bars of 1.5 s; c: one bar of 4 s.
    expect([0, 1, 2, 3].map((bar) => barStartTime(tl, bar))).toEqual([0, 2, 3.5, 5])
    // The bar after the last one is the end of the song, so a range's `end` converts too.
    expect(barStartTime(tl, 4)).toBe(9)
    expect(barStartTime(tl, 99)).toBe(9)
    expect(barStartTime([], 0)).toBe(0)
  })

  it('converts a loop range to seconds and reports none for no range', () => {
    const tl = buildTimeline({ sections })
    expect(loopRangeSeconds(tl, null)).toBeNull()
    expect(loopRangeSeconds(tl, { start: 1, end: 3 })).toEqual({ start: 2, end: 5 })
    expect(loopRangeSeconds(tl, { start: 0, end: 4 })).toEqual({ start: 0, end: 9 })
    // A range past the end of the song covers no time at all.
    expect(loopRangeSeconds(tl, { start: 4, end: 6 })).toBeNull()
    expect(loopRangeSeconds([], { start: 0, end: 1 })).toBeNull()
  })

  it('is empty for an empty song', () => {
    expect(buildTimeline({ sections: [] })).toEqual([])
    expect(totalSteps([])).toBe(0)
    expect(totalBars([])).toBe(0)
    expect(totalDuration([])).toBe(0)
  })

  it('locates a time within the right section and step', () => {
    const tl = buildTimeline({ sections })
    expect(locate(tl, 0)).toEqual({ sectionIndex: 0, stepInSection: 0, globalStep: 0 })
    expect(locate(tl, 0.125)).toEqual({ sectionIndex: 0, stepInSection: 1, globalStep: 1 })
    expect(locate(tl, 1.999)).toEqual({ sectionIndex: 0, stepInSection: 15, globalStep: 15 })
    expect(locate(tl, 2)).toEqual({ sectionIndex: 1, stepInSection: 0, globalStep: 16 })
    expect(locate(tl, 5.5)).toEqual({ sectionIndex: 2, stepInSection: 0, globalStep: 40 })
    expect(locate(tl, 8.9)).toEqual({ sectionIndex: 2, stepInSection: 3, globalStep: 43 })
    expect(locate(tl, 9)).toBeNull()
    expect(locate(tl, -1)).toBeNull()
    expect(locate([], 0)).toBeNull()
  })

  it('locates a step on the whole-song step axis', () => {
    const tl = buildTimeline({ sections })
    expect(locateStep(tl, 0)).toEqual({ sectionIndex: 0, stepInSection: 0, globalStep: 0 })
    expect(locateStep(tl, 15)).toEqual({ sectionIndex: 0, stepInSection: 15, globalStep: 15 })
    expect(locateStep(tl, 16)).toEqual({ sectionIndex: 1, stepInSection: 0, globalStep: 16 })
    expect(locateStep(tl, 43)).toEqual({ sectionIndex: 2, stepInSection: 3, globalStep: 43 })
    expect(locateStep(tl, 44)).toBeNull()
    expect(locateStep(tl, -1)).toBeNull()
    expect(locateStep(tl, 1.5)).toBeNull()
    expect(locateStep([], 0)).toBeNull()
  })

  it('maps a step to its start time, and the step after the last one to the end', () => {
    const tl = buildTimeline({ sections })
    expect(stepStartTime(tl, 0)).toBe(0)
    expect(stepStartTime(tl, 1)).toBe(0.125)
    expect(stepStartTime(tl, 16)).toBe(2)
    expect(stepStartTime(tl, 41)).toBe(6)
    expect(stepStartTime(tl, 44)).toBe(9)
    expect(stepStartTime(tl, 100)).toBe(9)
    expect(stepStartTime(tl, -3)).toBe(0)
    expect(stepStartTime([], 0)).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formats m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65.9)).toBe('1:05')
    expect(formatDuration(-3)).toBe('0:00')
  })
})
