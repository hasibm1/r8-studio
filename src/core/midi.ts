// MIDI 1.0 message builders and formatting. Channels are 1–16 here.

const clamp7 = (n: number): number => Math.max(0, Math.min(127, Math.round(n)))
const chan = (ch: number): number => Math.max(1, Math.min(16, Math.round(ch))) - 1

export const noteOn = (channel: number, note: number, velocity: number): number[] =>
  [0x90 | chan(channel), clamp7(note), Math.max(1, clamp7(velocity))]

export const noteOff = (channel: number, note: number): number[] => [0x80 | chan(channel), clamp7(note), 0]

export const CLOCK = [0xf8]
export const START = [0xfa]
export const STOP = [0xfc]

export interface ParsedMessage { type: string; channel: number | null; note: number | null; velocity: number | null }

export function parseMessage(bytes: number[]): ParsedMessage {
  const status = bytes[0] ?? 0
  if (status === 0xf8) return { type: 'CLOCK', channel: null, note: null, velocity: null }
  if (status === 0xfa) return { type: 'START', channel: null, note: null, velocity: null }
  if (status === 0xfb) return { type: 'CONTINUE', channel: null, note: null, velocity: null }
  if (status === 0xfc) return { type: 'STOP', channel: null, note: null, velocity: null }
  const kind = status & 0xf0
  const channel = (status & 0x0f) + 1
  if (kind === 0x90 && bytes[2] > 0) return { type: 'NOTE ON', channel, note: bytes[1], velocity: bytes[2] }
  if (kind === 0x80 || kind === 0x90) return { type: 'NOTE OFF', channel, note: bytes[1], velocity: 0 }
  return { type: '0x' + status.toString(16).toUpperCase(), channel: null, note: null, velocity: null }
}

/** e.g. "NOTE ON · CH10 · 38 · V110" */
export function formatMessage(bytes: number[]): string {
  const m = parseMessage(bytes)
  if (m.channel === null) return m.type
  return m.type === 'NOTE ON' ? `NOTE ON · CH${m.channel} · ${m.note} · V${m.velocity}` : `${m.type} · CH${m.channel} · ${m.note}`
}
