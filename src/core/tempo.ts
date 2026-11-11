import { clampTempo } from './project'

export const TAP_WINDOW_MS = 2500

/** Averages taps within the window. Needs two taps; returns bpm to 0.1. */
export function tapTempo(taps: number[], now: number): { taps: number[]; bpm: number | null } {
  const kept = taps.filter((t) => now - t < TAP_WINDOW_MS).concat([now])
  if (kept.length < 2) return { taps: kept, bpm: null }
  const interval = (kept[kept.length - 1] - kept[0]) / (kept.length - 1)
  return { taps: kept, bpm: clampTempo(60000 / interval) }
}
