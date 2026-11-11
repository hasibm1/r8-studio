import { FORMAT_VERSION, MAX_BARS, STEPS_PER_BAR } from './types'
import type { BarSteps, Hit, Lane, Pattern, Project } from './types'

export const TEMPO_MIN = 40
export const TEMPO_MAX = 250

export const clampTempo = (bpm: number): number =>
  Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(bpm * 10) / 10))

export const pad2 = (n: number): string => (n < 10 ? '0' : '') + n

let idCounter = 0
export function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

export const blankHit = (lane: Lane): Hit => ({
  velocity: lane.defaultVelocity,
  micro: 0,
  chance: 100,
  ratchet: 1,
  stored: { pitch: 0, decay: 0, nuance: 0, pan: 0 }
})

export const emptyBar = (): BarSteps => Array.from({ length: STEPS_PER_BAR }, () => null)

export function newLane(name: string, note: number, defaultVelocity = 100, channel = 10): Lane {
  return {
    id: newId('lane'), name, channel, note, defaultVelocity,
    enabled: true, mute: false, solo: false, heard: 'not-tested', kit: null
  }
}

export function patternId(index: number, bank = 'A'): string {
  return bank + pad2(index + 1)
}

export function newPattern(id: string, name: string, lanes: Lane[], bars = 1): Pattern {
  const steps: Pattern['steps'] = {}
  for (const lane of lanes) steps[lane.id] = Array.from({ length: bars }, emptyBar)
  return { id, name, bars: Math.max(1, Math.min(MAX_BARS, bars)), steps }
}

/**
 * Starting lanes. The note numbers are only a starting point: nothing is
 * assumed about the R-8's own assignments, and every lane starts "not tested".
 */
export function defaultLanes(): Lane[] {
  return [
    newLane('Kick', 36, 110), newLane('Snare', 38, 110),
    newLane('Closed HH', 42, 90), newLane('Open HH', 46, 90),
    newLane('Rim', 37, 80), newLane('Hand Clap', 39, 100),
    newLane('Low Tom', 45, 100), newLane('High Tom', 48, 100)
  ]
}

export function newProject(name = 'Untitled'): Project {
  const lanes = defaultLanes()
  const pattern = newPattern('A01', 'Pattern 1', lanes, 1)
  return {
    formatVersion: FORMAT_VERSION, name, tempo: 120, timeSignature: '4/4',
    lanes, copies: [], patterns: [pattern], currentPatternId: pattern.id
  }
}

export const currentPattern = (p: Project): Pattern =>
  p.patterns.find((x) => x.id === p.currentPatternId) ?? p.patterns[0]

/** Make sure every lane has a row of the right shape in every pattern. */
export function normaliseSteps(p: Project): void {
  for (const pat of p.patterns) {
    for (const lane of p.lanes) {
      const rows = pat.steps[lane.id] ?? []
      while (rows.length < pat.bars) rows.push(emptyBar())
      rows.length = pat.bars
      pat.steps[lane.id] = rows
    }
    for (const id of Object.keys(pat.steps)) {
      if (!p.lanes.some((l) => l.id === id)) delete pat.steps[id]
    }
  }
}

export function countHits(p: Project, laneId: string): number {
  let n = 0
  for (const pat of p.patterns) for (const bar of pat.steps[laneId] ?? []) for (const h of bar) if (h) n += 1
  return n
}

/** Lanes that send the same channel + note as another enabled lane. */
export function noteClashes(lanes: Lane[]): Map<string, Lane> {
  const out = new Map<string, Lane>()
  for (const a of lanes) {
    if (!a.enabled) continue
    const b = lanes.find((x) => x !== a && x.enabled && x.channel === a.channel && x.note === a.note)
    if (b) out.set(a.id, b)
  }
  return out
}
