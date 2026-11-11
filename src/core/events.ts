// Pattern → note events, as a pure function of a position range.
//
// Positions are in steps (16th notes) counted from the moment playback
// started, and may be fractional. Nothing here knows about wall-clock time,
// timers or MIDI ports, so the same function can be driven by the desktop
// scheduler today and by a plugin's audio callback later.

import { STEPS_PER_BAR } from './types'
import type { Lane, Pattern } from './types'

export interface NoteEvent {
  at: number // step position, fractional
  laneId: string
  channel: number
  note: number
  velocity: number
  ratchet: number // how many notes share this step (for gate length)
  bar: number // 0-based, within the pattern
  step: number // 0–15
}

export const totalSteps = (p: Pattern): number => p.bars * STEPS_PER_BAR

/** A lane is silent when it is off, muted, or another lane is soloed. */
export function isSilent(lane: Lane, lanes: Lane[]): boolean {
  if (!lane.enabled || lane.mute) return true
  return !lane.solo && lanes.some((l) => l.enabled && l.solo)
}

/** Deterministic roll in [0, 100) for one lane at one absolute step. */
export function chanceRoll(seed: number, absStep: number, laneIndex: number): number {
  let h = (seed ^ Math.imul(absStep + 1, 0x9e3779b1) ^ Math.imul(laneIndex + 1, 0x85ebca6b)) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967296) * 100
}

/**
 * Every note that falls in [from, to). Adjacent ranges never overlap and
 * never leave gaps, so calling this tick after tick sends each note once.
 */
export function collectEvents(lanes: Lane[], pattern: Pattern, from: number, to: number, seed = 0): NoteEvent[] {
  const total = totalSteps(pattern)
  const out: NoteEvent[] = []
  if (!(to > from) || total <= 0) return out
  // A hit at step n can sound anywhere in [n − 0.5, n + 1.5): micro ±50 % plus ratchets.
  const first = Math.max(0, Math.ceil(from - 1.5))
  const last = Math.floor(to + 0.5)
  for (let n = first; n <= last; n++) {
    const within = n % total
    const bar = Math.floor(within / STEPS_PER_BAR)
    const step = within % STEPS_PER_BAR
    for (let li = 0; li < lanes.length; li++) {
      const lane = lanes[li]
      const hit = pattern.steps[lane.id]?.[bar]?.[step]
      if (!hit || isSilent(lane, lanes)) continue
      if (hit.chance < 100 && chanceRoll(seed, n, li) >= hit.chance) continue
      const r = Math.max(1, Math.min(4, hit.ratchet))
      for (let k = 0; k < r; k++) {
        // The very first step can't play before playback starts.
        const at = Math.max(0, n + hit.micro / 100 + k / r)
        if (at >= from && at < to) {
          out.push({ at, laneId: lane.id, channel: lane.channel, note: lane.note, velocity: hit.velocity, ratchet: r, bar, step })
        }
      }
    }
  }
  return out.sort((a, b) => a.at - b.at)
}
