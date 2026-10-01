import { DEFAULT_TEMPO, stepCount, stepsPerBar, type Section, type Song, type TimeSignature } from './song'

/**
 * Resolve each section's effective tempo. A `null` tempo inherits from the
 * previous section; if the very first section has no tempo, DEFAULT_TEMPO is used.
 */
export function resolveTempos(sections: readonly Pick<Section, 'tempo'>[], fallback = DEFAULT_TEMPO): number[] {
  let last = fallback
  return sections.map((s) => {
    if (s.tempo !== null && Number.isFinite(s.tempo) && s.tempo > 0) last = s.tempo
    return last
  })
}

/** Seconds per step. Tempo is quarter-notes per minute; a beat is 4/unit quarter notes. */
export function stepDurationSeconds(tempo: number, timeSignature: TimeSignature, subdivision: number): number {
  const quarterSeconds = 60 / tempo
  const beatSeconds = quarterSeconds * (4 / timeSignature.unit)
  return beatSeconds / subdivision
}

export interface SectionTiming {
  sectionId: string
  index: number
  tempo: number
  stepDuration: number
  stepsPerBar: number
  stepCount: number
  /** Index of this section's first step in the whole-song step axis. */
  startStep: number
  /** Seconds from song start. */
  startTime: number
  duration: number
}

export function buildTimeline(song: Pick<Song, 'sections'>): SectionTiming[] {
  const tempos = resolveTempos(song.sections)
  let startStep = 0
  let startTime = 0
  return song.sections.map((section, index) => {
    const tempo = tempos[index] ?? DEFAULT_TEMPO
    const stepDuration = stepDurationSeconds(tempo, section.timeSignature, section.subdivision)
    const count = stepCount(section)
    const duration = count * stepDuration
    const timing: SectionTiming = {
      sectionId: section.id,
      index,
      tempo,
      stepDuration,
      stepsPerBar: stepsPerBar(section),
      stepCount: count,
      startStep,
      startTime,
      duration,
    }
    startStep += count
    startTime += duration
    return timing
  })
}

export function totalSteps(timeline: readonly SectionTiming[]): number {
  const last = timeline[timeline.length - 1]
  return last ? last.startStep + last.stepCount : 0
}

export function totalDuration(timeline: readonly SectionTiming[]): number {
  const last = timeline[timeline.length - 1]
  return last ? last.startTime + last.duration : 0
}

export interface Position {
  sectionIndex: number
  stepInSection: number
  globalStep: number
}

/** Map a time (seconds from song start, already wrapped if looping) to a step. */
export function locate(timeline: readonly SectionTiming[], timeSeconds: number): Position | null {
  if (timeline.length === 0 || timeSeconds < 0) return null
  const EPS = 1e-9
  for (const t of timeline) {
    if (timeSeconds < t.startTime + t.duration - EPS) {
      const stepInSection = Math.min(t.stepCount - 1, Math.floor((timeSeconds - t.startTime + EPS) / t.stepDuration))
      return { sectionIndex: t.index, stepInSection, globalStep: t.startStep + stepInSection }
    }
  }
  return null
}

export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const m = Math.floor(whole / 60)
  const s = whole % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
