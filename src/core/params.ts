import type { Hit, Lane } from './types'

export type ParamKey = 'velocity' | 'micro' | 'chance' | 'ratchet' | 'pitch' | 'decay' | 'nuance' | 'pan'

export interface ParamDef {
  key: ParamKey
  label: string
  min: number
  max: number
  def: number // velocity's default comes from the lane
  bipolar: boolean
  /** true = the engine applies it when sending; false = kept for the R-8, never sent */
  live: boolean
}

export const PARAMS: ParamDef[] = [
  { key: 'velocity', label: 'velocity', min: 1, max: 127, def: 100, bipolar: false, live: true },
  { key: 'micro', label: 'micro', min: -50, max: 50, def: 0, bipolar: true, live: true },
  { key: 'chance', label: 'chance', min: 0, max: 100, def: 100, bipolar: false, live: true },
  { key: 'ratchet', label: 'ratchet', min: 1, max: 4, def: 1, bipolar: false, live: true },
  { key: 'pitch', label: 'pitch', min: -50, max: 50, def: 0, bipolar: true, live: false },
  { key: 'decay', label: 'decay', min: -50, max: 50, def: 0, bipolar: true, live: false },
  { key: 'nuance', label: 'nuance', min: -50, max: 50, def: 0, bipolar: true, live: false },
  { key: 'pan', label: 'pan', min: -50, max: 50, def: 0, bipolar: true, live: false }
]

export const paramDef = (key: ParamKey): ParamDef => PARAMS.find((p) => p.key === key)!

export function getParam(hit: Hit, key: ParamKey): number {
  switch (key) {
    case 'velocity': return hit.velocity
    case 'micro': return hit.micro
    case 'chance': return hit.chance
    case 'ratchet': return hit.ratchet
    default: return hit.stored[key]
  }
}

export function setParam(hit: Hit, key: ParamKey, value: number): void {
  const p = paramDef(key)
  const v = Math.max(p.min, Math.min(p.max, Math.round(value)))
  switch (key) {
    case 'velocity': hit.velocity = v; break
    case 'micro': hit.micro = v; break
    case 'chance': hit.chance = v; break
    case 'ratchet': hit.ratchet = v; break
    default: hit.stored[key] = v
  }
}

export const paramDefault = (key: ParamKey, lane: Lane): number =>
  key === 'velocity' ? lane.defaultVelocity : paramDef(key).def

/** True when anything other than velocity is off its default. */
export function isEdited(hit: Hit): boolean {
  return PARAMS.some((p) => p.key !== 'velocity' && getParam(hit, p.key) !== p.def)
}

const signed = (v: number, unit = ''): string => (v === 0 ? '0' : (v > 0 ? '+' : '−') + Math.abs(v) + unit)

export function formatParam(key: ParamKey, v: number): string {
  switch (key) {
    case 'velocity': return String(v)
    case 'chance': return v + '%'
    case 'ratchet': return '×' + v
    case 'pan': return v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + Math.abs(v)
    case 'micro': return signed(v, '%')
    default: return signed(v)
  }
}

/** Spoken form for screen readers, e.g. "plus 8 percent". */
export function speakParam(key: ParamKey, v: number): string {
  const s = (n: number): string => (n === 0 ? '0' : (n > 0 ? 'plus ' : 'minus ') + Math.abs(n))
  switch (key) {
    case 'velocity': return String(v)
    case 'chance': return v + ' percent'
    case 'ratchet': return v + ' times'
    case 'pan': return v === 0 ? 'centre' : (v < 0 ? 'left ' : 'right ') + Math.abs(v)
    case 'micro': return s(v) + ' percent'
    default: return s(v)
  }
}
