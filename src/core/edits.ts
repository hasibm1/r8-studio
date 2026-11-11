// Project edits. Each mutator changes a draft in place; `update` clones first
// so callers always get a new Project and the old one stays valid for undo.

import { MAX_BARS, MAX_LANE_NAME, STEPS_PER_BAR } from './types'
import type { BarSteps, Hit, Lane, LaneId, Pattern, Project } from './types'
import { blankHit, currentPattern, emptyBar, newLane, newPattern, normaliseSteps, patternId } from './project'

export function update(p: Project, fn: (draft: Project) => void): Project {
  const draft = structuredClone(p)
  fn(draft)
  return draft
}

export type BarClip = Record<LaneId, BarSteps>

const cloneBar = (bar: BarSteps): BarSteps => bar.map((h) => (h ? structuredClone(h) : null))

export function hitAt(p: Project, laneId: LaneId, bar: number, step: number): Hit | null {
  return currentPattern(p).steps[laneId]?.[bar]?.[step] ?? null
}

export function setHit(d: Project, laneId: LaneId, bar: number, step: number, hit: Hit | null): void {
  const row = currentPattern(d).steps[laneId]?.[bar]
  if (row && step >= 0 && step < STEPS_PER_BAR) row[step] = hit
}

export function addHit(d: Project, laneId: LaneId, bar: number, step: number): void {
  const lane = d.lanes.find((l) => l.id === laneId)
  if (lane) setHit(d, laneId, bar, step, blankHit(lane))
}

export function resetHit(d: Project, laneId: LaneId, bar: number, step: number): void {
  const hit = hitAt(d, laneId, bar, step)
  if (!hit) return
  hit.micro = 0
  hit.chance = 100
  hit.ratchet = 1
  hit.stored = { pitch: 0, decay: 0, nuance: 0, pan: 0 }
}

export function copyBar(p: Project, bar: number): BarClip {
  const pat = currentPattern(p)
  const clip: BarClip = {}
  for (const lane of p.lanes) clip[lane.id] = cloneBar(pat.steps[lane.id]?.[bar] ?? emptyBar())
  return clip
}

export function pasteBar(d: Project, bar: number, clip: BarClip): void {
  const pat = currentPattern(d)
  if (bar < 0 || bar >= pat.bars) return
  for (const lane of d.lanes) pat.steps[lane.id][bar] = cloneBar(clip[lane.id] ?? emptyBar())
}

/** Where Duplicate will put bar N: the next bar, a new bar if there's room, else bar 1. */
export function duplicateTarget(pat: Pattern, bar: number): number {
  if (bar + 1 < pat.bars) return bar + 1
  return pat.bars < MAX_BARS ? pat.bars : 0
}

export function duplicateBar(d: Project, bar: number): number {
  const pat = currentPattern(d)
  const target = duplicateTarget(pat, bar)
  if (target >= pat.bars) addBar(d)
  if (target !== bar) pasteBar(d, target, copyBar(d, bar))
  return target
}

export function clearBar(d: Project, bar: number): void {
  const pat = currentPattern(d)
  for (const lane of d.lanes) if (pat.steps[lane.id]?.[bar]) pat.steps[lane.id][bar] = emptyBar()
}

export function addBar(d: Project): boolean {
  const pat = currentPattern(d)
  if (pat.bars >= MAX_BARS) return false
  pat.bars += 1
  normaliseSteps(d)
  return true
}

export function addLane(d: Project): Lane {
  const used = new Set(d.lanes.map((l) => l.note))
  let note = 36
  while (used.has(note) && note < 127) note += 1
  const lane = newLane(`Lane ${d.lanes.length + 1}`, note, 100, d.lanes[0]?.channel ?? 10)
  d.lanes.push(lane)
  normaliseSteps(d)
  return lane
}

export function removeLane(d: Project, laneId: LaneId): void {
  d.lanes = d.lanes.filter((l) => l.id !== laneId)
  normaliseSteps(d)
}

type LaneField = 'name' | 'channel' | 'note' | 'defaultVelocity' | 'enabled' | 'mute' | 'solo' | 'heard'

/** Changing what a lane sends means the app can no longer know it works. */
export function setLaneField<K extends LaneField>(d: Project, laneId: LaneId, key: K, value: Lane[K]): void {
  const lane = d.lanes.find((l) => l.id === laneId)
  if (!lane) return
  if (key === 'name') {
    lane.name = String(value).slice(0, MAX_LANE_NAME)
    return
  }
  if (lane[key] === value) return
  lane[key] = value
  if (key === 'channel' || key === 'note' || key === 'defaultVelocity') lane.heard = 'not-tested'
}

export const PATTERN_SLOTS = 16

export function addPattern(d: Project, slot: number): Pattern | null {
  const id = patternId(slot)
  if (slot < 0 || slot >= PATTERN_SLOTS || d.patterns.some((p) => p.id === id)) return null
  const pat = newPattern(id, `Pattern ${slot + 1}`, d.lanes, 1)
  d.patterns.push(pat)
  d.patterns.sort((a, b) => a.id.localeCompare(b.id))
  return pat
}
