// Project data model. Pure data: no DOM, no Node, no Electron.
// This file is the contract a future plugin (VST) build would share.

export const FORMAT_VERSION = 1
export const STEPS_PER_BAR = 16
export const MAX_BARS = 4
export const MAX_LANE_NAME = 24

export type LaneId = string

export interface KitSettings {
  source: 'internal' | 'copy' | 'card'
  index: number // internal 1–68, copy 1–26, card 1–26
  pitch: number // −480…480, tens of cents
  decay: number // 0–127
  nuance: number // 0–15
  pan: number // −3…3
  output: number // 0 = stereo, 1–8 = multi out
  assign: 'mono' | 'poly' | 'exc'
  excGroup: number // 1–8
  senseCurve: number // 1–8
}

/** Phase 2. Stored only; never sent. */
export interface KitSound extends KitSettings {
  setOnR8: KitSettings | null
}

export interface Lane {
  id: LaneId
  name: string
  channel: number // 1–16
  note: number // 0–127
  defaultVelocity: number // 1–127
  enabled: boolean
  mute: boolean
  solo: boolean
  /** Confirmed by the user's ear via ping. Never inferred. */
  heard: 'heard' | 'not-tested'
  kit: KitSound | null
}

export interface StoredParams {
  pitch: number
  decay: number
  nuance: number
  pan: number
}

export interface Hit {
  velocity: number // 1–127, sent
  micro: number // −50…50, % of a step, applied by the engine
  chance: number // 0–100, applied by the engine
  ratchet: number // 1–4, applied by the engine
  stored: StoredParams // −50…50 placeholders, kept for the R-8, never sent
}

export type BarSteps = (Hit | null)[]

export interface Pattern {
  id: string // 'A01'
  name: string
  bars: number // 1–4
  steps: Record<LaneId, BarSteps[]> // [bar][step 0–15]
}

export interface CopyInstrument {
  slot: number
  name: string
  baseInternal: number
}

export interface Project {
  formatVersion: number
  name: string
  tempo: number // 40–250, 0.1 steps
  timeSignature: '4/4'
  lanes: Lane[]
  copies: CopyInstrument[]
  patterns: Pattern[]
  currentPatternId: string
}
