// Everything the UI can do. Components call these; they never touch the
// scheduler, the MIDI port or storage directly.

import * as E from '../../core/edits'
import { formatMessage, noteOff, noteOn, parseMessage } from '../../core/midi'
import type { ParamKey } from '../../core/params'
import { setParam as writeParam } from '../../core/params'
import { clampTempo, currentPattern, newProject, pad2 } from '../../core/project'
import { tapTempo } from '../../core/tempo'
import type { Lane, LaneId, Project } from '../../core/types'
import { parseProject, serialiseProject } from '../../core/validate'
import { Scheduler, msPerStep } from '../../engine/scheduler'
import type { SendMeta } from '../../engine/scheduler'
import { webMidi } from './host/midi'
import { storage } from './host/storage'
import { getState, pattern, set, viewBar } from './store'
import type { AppState, MonitorRow, Screen, Settings } from './store'

const UNDO_LIMIT = 50
const TOAST_MS = 2600
const HISTORY_EVERY_MS = 120_000
const MONITOR_ROWS = 200

// ── Messages ────────────────────────────────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout> | undefined

export function toast(msg: string): void {
  clearTimeout(toastTimer)
  set({ toast: msg })
  toastTimer = setTimeout(() => set({ toast: '' }), TOAST_MS)
}

export const setError = (msg: string): void => set({ error: msg })
export const clearError = (): void => set({ error: '' })
export const go = (screen: Screen): void => set({ screen })

// ── MIDI out ────────────────────────────────────────────────────────────────

const midi = webMidi()
let rowId = 0
let pendingRows: MonitorRow[] = []
let pendingLast = ''
let flushQueued = false

/** Note Offs and clock pulses go out but are not listed: they would bury the notes. */
function log(bytes: number[], meta?: SendMeta): void {
  const m = parseMessage(bytes)
  if (m.type === 'CLOCK' || m.type === 'NOTE OFF') return
  pendingLast = formatMessage(bytes)
  pendingRows.push({ id: ++rowId, pos: meta ? `${meta.bar + 1}.${pad2(meta.step + 1)}` : '—', type: m.type, ch: m.channel, note: m.note, vel: m.velocity })
  if (flushQueued) return
  flushQueued = true
  setTimeout(() => {
    flushQueued = false
    const s = getState()
    const rows = s.monitorPaused ? s.monitor : [...pendingRows.reverse(), ...s.monitor].slice(0, MONITOR_ROWS)
    pendingRows = []
    set({ lastOut: pendingLast, monitor: rows })
  }, 0)
}

function send(bytes: number[], atMs?: number, meta?: SendMeta): boolean {
  const ok = midi.send(bytes, atMs)
  if (ok) log(bytes, meta)
  return ok
}

/** One note, now. Returns false if there is no interface to send it to. */
function sendNote(channel: number, note: number, velocity: number, atMs?: number, meta?: SendMeta): boolean {
  const t = atMs ?? performance.now()
  const ok = send(noteOn(channel, note, velocity), t, meta)
  if (ok) send(noteOff(channel, note), t + 30)
  return ok
}

const NOT_SENDING = 'not sent · no interface'

export const rescanMidi = (): Promise<void> => midi.rescan()
export const selectOutput = (name: string): void => midi.select(name)
export const clearMonitor = (): void => set({ monitor: [] })
export const toggleMonitorPause = (): void => set({ monitorPaused: !getState().monitorPaused })

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  const settings = { ...getState().settings, [key]: value }
  set({ settings })
  localStorage.setItem('r8.settings', JSON.stringify(settings))
}

// ── Transport ───────────────────────────────────────────────────────────────

const scheduler = new Scheduler({
  now: () => performance.now(),
  send: (bytes, at, meta) => { send(bytes, at, meta) },
  clear: () => midi.clear(),
  state: () => {
    const s = getState()
    return { lanes: s.project.lanes, pattern: pattern(s), tempo: s.project.tempo, lookaheadMs: s.settings.lookaheadMs, offsetMs: s.settings.offsetMs, clock: s.settings.clock }
  }
})

const ticker = new Worker(new URL('./tick.worker.ts', import.meta.url), { type: 'module' })
// The worker tick drives both scheduling and the on-screen position, so the
// playhead keeps moving even when the window is not being painted.
ticker.onmessage = () => {
  scheduler.tick()
  if (!scheduler.playing) return
  const step = Math.floor(scheduler.position())
  if (step !== getState().playStep) set({ playStep: step })
}

export function play(): void {
  if (getState().playing) return
  scheduler.start()
  ticker.postMessage(25)
  set({ playing: true, playStep: -1, clockRunning: scheduler.sendingClock })
}

/** Stops and returns to the start of the pattern. */
export function stop(): void {
  scheduler.stop()
  ticker.postMessage(0)
  const s = getState()
  set({ playing: false, playStep: -1, clockRunning: false, bar: s.follow ? 0 : s.bar })
}

export const togglePlay = (): void => (getState().playing ? stop() : play())

/** Tempo is not part of undo. It applies during playback. */
export function setTempo(bpm: number): void {
  tweak((d) => { d.tempo = clampTempo(bpm) })
}

export const nudgeTempo = (by: number): void => setTempo(Math.round(getState().project.tempo) + by)

let taps: number[] = []
export function tap(): void {
  const r = tapTempo(taps, performance.now())
  taps = r.taps
  if (r.bpm !== null) setTempo(r.bpm)
}

// ── Project edits, undo and autosave ────────────────────────────────────────

let gesture: { before: Project; changed: boolean } | null = null
let lastKey = ''
let lastEditAt = 0
let lastLabel = 'project opened'
let saveTimer: ReturnType<typeof setTimeout> | undefined
let lastHistoryAt = Date.now()

function fixSelection(p: Project, s: AppState): Partial<AppState> {
  const pat = currentPattern(p)
  const selLane = p.lanes.some((l) => l.id === s.selLane) ? s.selLane : p.lanes[0].id
  return {
    selLane,
    openLane: s.openLane && p.lanes.some((l) => l.id === s.openLane) ? s.openLane : null,
    selBar: Math.min(s.selBar, pat.bars - 1),
    bar: Math.min(s.bar, pat.bars - 1)
  }
}

function setProject(project: Project, extra: Partial<AppState> = {}): void {
  set({ project, ...fixSelection(project, { ...getState(), ...extra }), ...extra })
}

function markDirty(label: string): void {
  lastLabel = label
  set({ saveState: 'saving' })
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void persist(), 500)
}

async function persist(): Promise<void> {
  clearTimeout(saveTimer)
  saveTimer = undefined
  const s = getState()
  const text = serialiseProject(s.project)
  try {
    await storage.write(s.fileName, text)
    if (Date.now() - lastHistoryAt > HISTORY_EVERY_MS) {
      lastHistoryAt = Date.now()
      set({ history: await storage.addHistory(s.fileName, lastLabel, text, false) })
    }
    set({ saveState: 'saved', error: getState().error.startsWith('autosave failed') ? '' : getState().error })
  } catch (e) {
    set({ saveState: 'failed', error: `autosave failed · ${e instanceof Error ? e.message : 'could not write the project file'}` })
  }
}

/** Save now if an autosave is waiting. */
async function flush(): Promise<void> {
  if (saveTimer) await persist()
}

/**
 * An undoable project edit. Edits with the same `coalesce` key made in quick
 * succession (typing in a field) count as one undo step.
 */
export function edit(label: string, fn: (draft: Project) => void, coalesce = '', extra: Partial<AppState> = {}): void {
  const s = getState()
  const next = E.update(s.project, fn)
  const now = Date.now()
  const merge = gesture ? gesture.changed : coalesce !== '' && coalesce === lastKey && now - lastEditAt < 1500
  if (gesture) gesture.changed = true
  lastKey = coalesce
  lastEditAt = now
  if (merge) setProject(next, extra)
  else setProject(next, { undo: [...s.undo, { project: s.project, label }].slice(-UNDO_LIMIT), redo: [], ...extra })
  markDirty(label)
}

/** A project change that is saved but is not an undo step (tempo, mute, solo, ping results). */
export function tweak(fn: (draft: Project) => void): void {
  setProject(E.update(getState().project, fn))
  markDirty(lastLabel)
}

/** Call around a knob drag so the whole drag is one undo step. */
export function beginGesture(): void {
  gesture = { before: getState().project, changed: false }
}
export function endGesture(): void {
  gesture = null
  lastKey = ''
}

/** Things undo must not touch: tempo, the open pattern, mute, solo, and what the user has heard. */
function carryOver(snapshot: Project, current: Project): Project {
  return E.update(snapshot, (d) => {
    d.tempo = current.tempo
    if (d.patterns.some((p) => p.id === current.currentPatternId)) d.currentPatternId = current.currentPatternId
    for (const lane of d.lanes) {
      const now = current.lanes.find((l) => l.id === lane.id)
      if (!now) continue
      lane.mute = now.mute
      lane.solo = now.solo
      const same = now.channel === lane.channel && now.note === lane.note && now.defaultVelocity === lane.defaultVelocity
      if (same) lane.heard = now.heard
    }
  })
}

export function undo(): void {
  const s = getState()
  const last = s.undo[s.undo.length - 1]
  if (!last) return
  lastKey = ''
  setProject(carryOver(last.project, s.project), { undo: s.undo.slice(0, -1), redo: [...s.redo, { project: s.project, label: last.label }] })
  markDirty(`undo ${last.label}`)
  toast(`undid · ${last.label}`)
}

export function redo(): void {
  const s = getState()
  const last = s.redo[s.redo.length - 1]
  if (!last) return
  lastKey = ''
  setProject(carryOver(last.project, s.project), { redo: s.redo.slice(0, -1), undo: [...s.undo, { project: s.project, label: last.label }] })
  markDirty(`redo ${last.label}`)
  toast(`redid · ${last.label}`)
}

// ── Sequencer ───────────────────────────────────────────────────────────────

const lane = (id: LaneId): Lane | undefined => getState().project.lanes.find((l) => l.id === id)
const stepId = (bar: number, step: number): string => `${bar + 1}.${pad2(step + 1)}`

/** Empty pad: add a hit and select it. A hit: select it. The selected hit: remove it. */
export function clickPad(laneId: LaneId, step: number): void {
  const s = getState()
  const bar = viewBar(s)
  const l = lane(laneId)
  if (!l) return
  const here = E.hitAt(s.project, laneId, bar, step)
  const sel = { selLane: laneId, selBar: bar, selStep: step, bar }
  if (!here) edit(`add ${l.name} ${stepId(bar, step)}`, (d) => E.addHit(d, laneId, bar, step), '', sel)
  else if (s.selLane === laneId && s.selStep === step && s.selBar === bar) edit(`remove ${l.name} ${stepId(bar, step)}`, (d) => E.setHit(d, laneId, bar, step, null))
  else set(sel)
}

export function selectStep(laneId: LaneId, step: number): void {
  const bar = viewBar(getState())
  set({ selLane: laneId, selBar: bar, selStep: step, bar })
}

/** Lane name: open that lane's drawer (one at a time); click again to close it. */
export function toggleDrawer(laneId: LaneId): void {
  const s = getState()
  const bar = viewBar(s)
  set({ openLane: s.openLane === laneId ? null : laneId, selLane: laneId, selBar: bar, bar })
}

/** Clicking a bar tab while playing turns follow off. */
export function showBar(bar: number): void {
  const s = getState()
  set({ bar, follow: s.playing ? false : s.follow })
}

export function toggleFollow(): void {
  const s = getState()
  set({ follow: !s.follow, bar: viewBar(s) })
}

export function addBar(): void {
  const pat = pattern(getState())
  if (pat.bars >= 4) return
  edit('add bar', (d) => { E.addBar(d) }, '', { bar: pat.bars, follow: getState().playing ? false : getState().follow })
}

export function setParam(key: ParamKey, value: number): void {
  const s = getState()
  const l = lane(s.selLane)
  if (!l || !E.hitAt(s.project, s.selLane, s.selBar, s.selStep)) return
  edit(`${key} ${l.name} ${stepId(s.selBar, s.selStep)}`, (d) => {
    const h = E.hitAt(d, s.selLane, s.selBar, s.selStep)
    if (h) writeParam(h, key, value)
  }, `param:${key}:${s.selLane}:${s.selBar}:${s.selStep}`)
}

export function removeSelectedHit(): void {
  const s = getState()
  const l = lane(s.selLane)
  if (!l || !E.hitAt(s.project, s.selLane, s.selBar, s.selStep)) return
  edit(`remove ${l.name} ${stepId(s.selBar, s.selStep)}`, (d) => E.setHit(d, s.selLane, s.selBar, s.selStep, null))
}

/** Enter on the grid: add a hit at the selected step, or remove the one there. */
export function toggleSelectedHit(): void {
  const s = getState()
  const l = lane(s.selLane)
  if (!l) return
  if (E.hitAt(s.project, s.selLane, s.selBar, s.selStep)) removeSelectedHit()
  else edit(`add ${l.name} ${stepId(s.selBar, s.selStep)}`, (d) => E.addHit(d, s.selLane, s.selBar, s.selStep))
}

export function resetSelectedHit(): void {
  const s = getState()
  const l = lane(s.selLane)
  if (!l || !E.hitAt(s.project, s.selLane, s.selBar, s.selStep)) return
  edit(`reset ${l.name} ${stepId(s.selBar, s.selStep)}`, (d) => E.resetHit(d, s.selLane, s.selBar, s.selStep))
}

/** Sends the selected hit once, ratchets included. Chance and micro don't apply to a single preview. */
export function previewSelectedHit(): void {
  const s = getState()
  const l = lane(s.selLane)
  const h = E.hitAt(s.project, s.selLane, s.selBar, s.selStep)
  if (!l || !h) return
  const gap = msPerStep(s.project.tempo) / h.ratchet
  const t0 = performance.now()
  let ok = true
  for (let k = 0; k < h.ratchet; k++) ok = sendNote(l.channel, l.note, h.velocity, t0 + k * gap) && ok
  toast(ok ? `preview · ${formatMessage(noteOn(l.channel, l.note, h.velocity))}${h.ratchet > 1 ? ' ×' + h.ratchet : ''}` : NOT_SENDING)
}

export function moveSelection(dStep: number, dLane: number): void {
  const s = getState()
  const lanes = s.project.lanes
  const li = Math.max(0, Math.min(lanes.length - 1, lanes.findIndex((l) => l.id === s.selLane) + dLane))
  const bar = viewBar(s)
  set({ selLane: lanes[li].id, selStep: Math.max(0, Math.min(15, s.selStep + dStep)), selBar: bar, bar })
}

export function barOp(kind: 'copy' | 'paste' | 'duplicate' | 'clear'): void {
  const s = getState()
  const bar = viewBar(s)
  const n = bar + 1
  if (kind === 'copy') {
    set({ clip: E.copyBar(s.project, bar) })
    toast(`bar ${n} copied`)
  } else if (kind === 'paste') {
    if (!s.clip) return
    const clip = s.clip
    edit(`paste into bar ${n}`, (d) => E.pasteBar(d, bar, clip))
    toast(`pasted into bar ${n}`)
  } else if (kind === 'duplicate') {
    const target = E.duplicateTarget(pattern(s), bar)
    if (target === bar) return
    edit(`duplicate bar ${n}`, (d) => { E.duplicateBar(d, bar) }, '', { bar: target, follow: false })
    toast(`bar ${n} copied to bar ${target + 1}`)
  } else {
    edit(`clear bar ${n}`, (d) => E.clearBar(d, bar))
    toast(`bar ${n} cleared · undo brings it back`)
  }
}

export const toggleMute = (id: LaneId): void => tweak((d) => { const l = d.lanes.find((x) => x.id === id); if (l) l.mute = !l.mute })
export const toggleSolo = (id: LaneId): void => tweak((d) => { const l = d.lanes.find((x) => x.id === id); if (l) l.solo = !l.solo })

export function renamePattern(name: string): void {
  edit('rename pattern', (d) => { currentPattern(d).name = name.slice(0, 60) }, 'pattern-name')
}

// ── Instrument map ──────────────────────────────────────────────────────────

type LaneField = 'name' | 'channel' | 'note' | 'defaultVelocity' | 'enabled'

/** Editing what a heard lane sends resets it to "not tested". */
export function setLaneField<K extends LaneField>(id: LaneId, key: K, value: Lane[K]): void {
  const l = lane(id)
  if (!l) return
  edit(`${key === 'defaultVelocity' ? 'default velocity' : key} · ${l.name}`, (d) => E.setLaneField(d, id, key, value), `lane:${id}:${key}`)
  if (getState().ping?.laneId === id && key !== 'name') set({ ping: null })
}

export function addLane(): void {
  edit('add lane', (d) => { E.addLane(d) })
}

/** The caller asks first when the lane has hits (see countHits). */
export function removeLane(id: LaneId): void {
  const l = lane(id)
  if (!l || getState().project.lanes.length <= 1) return
  edit(`remove ${l.name}`, (d) => E.removeLane(d, id))
  if (getState().ping?.laneId === id) set({ ping: null })
  toast(`${l.name} removed · undo brings it back`)
}

/** Sends one Note On for the lane and waits for the user to say whether the R-8 played it. */
export function pingLane(id: LaneId): void {
  const l = lane(id)
  if (!l) return
  if (sendNote(l.channel, l.note, l.defaultVelocity)) set({ ping: { laneId: id }, pingFailed: false })
  else toast(NOT_SENDING)
}

export function answerPing(played: boolean): void {
  const p = getState().ping
  if (!p) return
  tweak((d) => { const l = d.lanes.find((x) => x.id === p.laneId); if (l) l.heard = played ? 'heard' : 'not-tested' })
  set({ ping: null, pingFailed: !played })
}

/** Plays every switched-on lane once, in order. It asks nothing and marks nothing as heard. */
export function pingAll(): void {
  const lanes = getState().project.lanes.filter((l) => l.enabled)
  const t0 = performance.now() + 20
  const ok = lanes.map((l, i) => sendNote(l.channel, l.note, l.defaultVelocity, t0 + i * 400)).every(Boolean)
  toast(ok ? `sent ${lanes.length} notes in lane order` : NOT_SENDING)
}

// ── MIDI test ───────────────────────────────────────────────────────────────

let repeatTimer: ReturnType<typeof setTimeout> | undefined

export const setTestLane = (id: LaneId): void => set({ testLane: id })

export function sendTestNote(): boolean {
  const s = getState()
  const l = lane(s.testLane ?? '') ?? s.project.lanes[0]
  const ok = sendNote(l.channel, l.note, l.defaultVelocity)
  if (!ok) toast(NOT_SENDING)
  return ok
}

export function toggleTestRepeat(): void {
  clearTimeout(repeatTimer)
  const on = !getState().testRepeat
  set({ testRepeat: on })
  const beat = (): void => {
    if (!getState().testRepeat) return
    sendTestNote()
    repeatTimer = setTimeout(beat, 60000 / getState().project.tempo)
  }
  if (on) beat()
}

// ── Patterns and projects ───────────────────────────────────────────────────

export function openPattern(id: string): void {
  const s = getState()
  if (!s.project.patterns.some((p) => p.id === id)) return
  tweak((d) => { d.currentPatternId = id })
  set({ bar: 0, selBar: 0, screen: 'sequencer' })
}

export function addPattern(slot: number): void {
  edit('add pattern', (d) => {
    const p = E.addPattern(d, slot)
    if (p) d.currentPatternId = p.id
  }, '', { bar: 0, selBar: 0 })
}

function resetFor(project: Project, fileName: string): Partial<AppState> {
  return {
    project, fileName, undo: [], redo: [], clip: null, bar: 0, selBar: 0, selStep: 0,
    selLane: project.lanes[0].id, openLane: project.lanes[0].id, ping: null, pingFailed: false, testLane: null, error: ''
  }
}

async function refreshLists(): Promise<void> {
  const name = getState().fileName
  const [recents, history] = await Promise.all([storage.list(), storage.history(name)])
  set({ recents, history })
}

function uniqueName(base: string, taken: string[]): string {
  const clean = base.replace(/[\\/:]/g, ' ').trim().slice(0, 60) || 'Untitled'
  if (!taken.includes(clean)) return clean
  for (let i = 2; ; i++) if (!taken.includes(`${clean} ${i}`)) return `${clean} ${i}`
}

async function adopt(project: Project, fileName: string): Promise<void> {
  if (getState().playing) stop()
  lastHistoryAt = Date.now()
  lastLabel = 'project opened'
  set(resetFor(project, fileName))
  localStorage.setItem('r8.lastFile', fileName)
  await storage.write(fileName, serialiseProject(project))
  await refreshLists()
}

export async function openProject(name: string): Promise<void> {
  await flush()
  const text = await storage.read(name)
  const r = text === null ? { ok: false as const, error: 'The file is missing.' } : parseProject(text)
  if (!r.ok) return setError(`could not open ${name} · ${r.error}`)
  await adopt(r.project, name)
  toast(`${name} opened`)
}

export async function createProject(): Promise<void> {
  await flush()
  const name = uniqueName('Untitled', (await storage.list()).map((f) => f.name))
  await adopt(newProject(name), name)
  toast(`${name} created`)
}

export async function saveAs(rawName: string): Promise<boolean> {
  const name = rawName.trim()
  if (!name || /[\\/:]/.test(name) || name.startsWith('.') || name.length > 60) {
    toast('Use a name without / \\ or : and up to 60 characters')
    return false
  }
  if ((await storage.list()).some((f) => f.name === name)) {
    toast(`A project called ${name} already exists · choose another name`)
    return false
  }
  await flush()
  const project = E.update(getState().project, (d) => { d.name = name })
  set({ project, fileName: name })
  localStorage.setItem('r8.lastFile', name)
  await storage.write(name, serialiseProject(project))
  set({ history: await storage.addHistory(name, 'saved as a new project', serialiseProject(project), true) })
  await refreshLists()
  toast(`saved as ${name}`)
  return true
}

export async function saveVersion(label = ''): Promise<void> {
  await flush()
  const s = getState()
  try {
    const text = serialiseProject(s.project)
    await storage.write(s.fileName, text)
    set({ history: await storage.addHistory(s.fileName, label.trim() || 'saved version', text, true), saveState: 'saved' })
    lastHistoryAt = Date.now()
    toast('version saved · find it in the history')
  } catch (e) {
    setError(`could not save the version · ${e instanceof Error ? e.message : 'write failed'}`)
  }
}

/** Restoring first saves the current state as a new history entry, so nothing is discarded. */
export async function restoreHistory(id: string): Promise<void> {
  await flush()
  const s = getState()
  const entry = s.history.find((h) => h.id === id)
  const text = await storage.readHistory(s.fileName, id)
  const r = text === null ? { ok: false as const, error: 'That history entry is missing.' } : parseProject(text)
  if (!r.ok) return setError(`could not restore · ${r.error}`)
  await storage.addHistory(s.fileName, 'before restore', serialiseProject(s.project), false)
  const restored = E.update(r.project, (d) => { d.name = s.project.name })
  if (s.playing) stop()
  setProject(restored, { undo: [...s.undo, { project: s.project, label: 'restore' }].slice(-UNDO_LIMIT), redo: [], bar: 0, selBar: 0 })
  markDirty(`restored “${entry?.what ?? 'earlier version'}”`)
  await refreshLists()
  toast('restored · the version you had is in the history')
}

/** Checks the file first. On failure it says what is wrong and changes nothing. */
export async function importProject(): Promise<void> {
  let picked: { name: string; text: string } | null
  try {
    picked = await storage.importFile()
  } catch {
    return setError('import failed · the file could not be read')
  }
  if (!picked) return
  const r = parseProject(picked.text)
  if (!r.ok) return setError(`import failed · ${r.error} Nothing was changed.`)
  await flush()
  const name = uniqueName(r.project.name || picked.name, (await storage.list()).map((f) => f.name))
  await adopt(E.update(r.project, (d) => { d.name = name }), name)
  toast(`imported as ${name}`)
}

export async function exportProject(): Promise<void> {
  const s = getState()
  try {
    if (await storage.exportFile(s.fileName, serialiseProject(s.project))) toast('project exported')
  } catch {
    setError('export failed · the file could not be written')
  }
}

export function finishSetup(): void {
  localStorage.setItem('r8.setupDone', '1')
  set({ setupDone: true })
}

// ── Start-up ────────────────────────────────────────────────────────────────

export async function init(): Promise<void> {
  try {
    const saved = JSON.parse(localStorage.getItem('r8.settings') ?? 'null') as Partial<Settings> | null
    if (saved) set({ settings: { ...getState().settings, ...saved } })
  } catch { /* keep defaults */ }
  const setupDone = localStorage.getItem('r8.setupDone') === '1'
  set({ setupDone, screen: setupDone ? 'sequencer' : 'setup' })

  void midi.start((snapshot) => set({ midi: snapshot }))

  try {
    set({ location: await storage.location() })
    const files = await storage.list()
    const last = localStorage.getItem('r8.lastFile')
    const name = files.find((f) => f.name === last)?.name ?? files[0]?.name
    const text = name ? await storage.read(name) : null
    const r = text ? parseProject(text) : null
    if (name && r?.ok) {
      set(resetFor(r.project, name))
      localStorage.setItem('r8.lastFile', name)
      await refreshLists()
    } else {
      const fresh = uniqueName('Untitled', files.map((f) => f.name))
      await adopt(newProject(fresh), fresh)
      if (name && r && !r.ok) setError(`could not open ${name} · ${r.error} A new project was started instead; the file was left as it is.`)
    }
  } catch (e) {
    setError(`could not reach the projects folder · ${e instanceof Error ? e.message : 'unknown error'}`)
  }
  set({ ready: true })
  window.addEventListener('beforeunload', () => { scheduler.stop(); void flush() })
}
