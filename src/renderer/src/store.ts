import { useSyncExternalStore } from 'react'
import type { BarClip } from '../../core/edits'
import { currentPattern, newProject } from '../../core/project'
import { totalSteps } from '../../core/events'
import type { LaneId, Pattern, Project } from '../../core/types'
import type { FileInfo, HistoryEntry, MidiSnapshot } from './host/types'

export type Screen = 'sequencer' | 'instruments' | 'midi' | 'projects' | 'setup'

export interface MonitorRow {
  id: number
  pos: string // "1.08" or "—"
  type: string // "NOTE ON", "START", "STOP"
  ch: number | null
  note: number | null
  vel: number | null
}

export interface Settings {
  clock: boolean // send MIDI clock; read when Play is pressed
  offsetMs: number // −50…50
  lookaheadMs: number // 25–250
}

export interface AppState {
  ready: boolean
  project: Project
  fileName: string
  screen: Screen
  setupDone: boolean

  // Sequencer view state (not part of the project, not undoable)
  bar: number // bar in view when not following the playhead
  follow: boolean
  openLane: LaneId | null // lane whose drawer is open
  selLane: LaneId
  selBar: number
  selStep: number
  clip: BarClip | null

  playing: boolean
  playStep: number // whole steps since Play; −1 when stopped
  clockRunning: boolean // clock is actually going out right now

  undo: { project: Project; label: string }[]
  redo: { project: Project; label: string }[]

  toast: string // short confirmation, clears itself
  error: string // stays until the cause is fixed or dismissed

  saveState: 'saved' | 'saving' | 'failed'
  location: string
  history: HistoryEntry[]
  recents: FileInfo[]

  midi: MidiSnapshot
  lastOut: string
  monitor: MonitorRow[] // newest first
  monitorPaused: boolean
  settings: Settings

  ping: { laneId: LaneId } | null // a ping was sent; waiting for the user's answer
  pingFailed: boolean // last answer was "Wrong or silent"
  testLane: LaneId | null
  testRepeat: boolean
}

const first = newProject()

let state: AppState = {
  ready: false,
  project: first,
  fileName: first.name,
  screen: 'sequencer',
  setupDone: true,
  bar: 0, follow: true, openLane: null,
  selLane: first.lanes[0].id, selBar: 0, selStep: 0, clip: null,
  playing: false, playStep: -1, clockRunning: false,
  undo: [], redo: [],
  toast: '', error: '',
  saveState: 'saved', location: '', history: [], recents: [],
  midi: { status: 'starting', outputs: [], selectedName: null },
  lastOut: '—', monitor: [], monitorPaused: false,
  settings: { clock: false, offsetMs: 0, lookaheadMs: 100 },
  ping: null, pingFailed: false, testLane: null, testRepeat: false
}

const listeners = new Set<() => void>()

export const getState = (): AppState => state

export function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * Subscribe a component to part of the state. The selector must return a
 * primitive or a reference that already exists in the state (never a new
 * object or array), or the component will re-render forever.
 */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

// ── Derived values ──────────────────────────────────────────────────────────

export const pattern = (s: AppState): Pattern => currentPattern(s.project)

/** Playhead position inside the pattern, or −1. */
export function playWithin(s: AppState): number {
  return s.playing && s.playStep >= 0 ? s.playStep % totalSteps(pattern(s)) : -1
}

/** The bar on screen: the playhead's bar when following, else the chosen one. */
export function viewBar(s: AppState): number {
  const w = playWithin(s)
  if (s.follow && w >= 0) return Math.floor(w / 16)
  return Math.min(s.bar, pattern(s).bars - 1)
}

/** Name of the selected interface for display, e.g. "UM-ONE". */
export const interfaceName = (s: AppState): string => s.midi.selectedName ?? 'No interface'

export const isSending = (s: AppState): boolean => s.midi.status === 'ok'
