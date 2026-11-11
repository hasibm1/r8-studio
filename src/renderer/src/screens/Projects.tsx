// Patterns & projects (BRIEF.md B7.4). Everything here reads real state.

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { PATTERN_SLOTS } from '../../../core/edits'
import { patternId } from '../../../core/project'
import type { Lane, Pattern } from '../../../core/types'
import * as A from '../actions'
import { useStore } from '../store'
import { Chip, Label, Led, Pill, RoundButton } from '../ui'
import type { LedTone } from '../ui'
import '../styles/projects.css'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
const two = (n: number): string => (n < 10 ? '0' : '') + n
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "just now", "2 min ago", "today 09:40", "yesterday 14:05", "3 Nov 14:05". */
function relativeTime(iso: string, now: number): string {
  const t = new Date(iso)
  const ms = t.getTime()
  if (Number.isNaN(ms)) return '—'
  const mins = Math.floor((now - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const clock = `${two(t.getHours())}:${two(t.getMinutes())}`
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  if (ms >= midnight.getTime()) return `today ${clock}`
  if (ms >= midnight.getTime() - 86_400_000) return `yesterday ${clock}`
  const year = t.getFullYear() === midnight.getFullYear() ? '' : ` ${t.getFullYear()}`
  return `${t.getDate()} ${MONTHS[t.getMonth()]}${year} ${clock}`
}

/** Re-render now and then so relative times stay true. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

const byNewest = <T,>(list: T[], when: (x: T) => string): T[] =>
  [...list].sort((a, b) => (Date.parse(when(b)) || 0) - (Date.parse(when(a)) || 0))

// ── Project module ──────────────────────────────────────────────────────────

type Asking = 'save-as' | 'version' | null

function InlineField({ kind, initial, onClose }: { kind: 'save-as' | 'version'; initial: string; onClose: () => void }): ReactNode {
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const saveAs = kind === 'save-as'
  const bad = saveAs && text.trim() !== '' && (/[\\/:]/.test(text) || text.trim().startsWith('.'))

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    let done = true
    try {
      if (saveAs) done = await A.saveAs(text)
      else await A.saveVersion(text)
    } catch {
      done = false
      A.setError(saveAs ? 'could not save the project under that name' : 'could not save the version')
    }
    setBusy(false)
    if (done) onClose()
  }

  return (
    <form className="pj-ask" onSubmit={(e) => void submit(e)} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <label className="pj-ask-field">
        <Label>{saveAs ? 'save as · new project name' : 'version note · optional'}</Label>
        <input
          className="input" autoFocus value={text} maxLength={60} spellCheck={false}
          placeholder={saveAs ? 'Project name' : 'What changed'}
          aria-invalid={bad || undefined}
          onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()}
        />
      </label>
      <Pill kind="primary" type="submit" disabled={busy || (saveAs && text.trim() === '')}>Save</Pill>
      <Pill onClick={onClose} disabled={busy}>Cancel</Pill>
    </form>
  )
}

function ProjectModule(): ReactNode {
  const project = useStore((s) => s.project)
  const [asking, setAsking] = useState<Asking>(null)
  const facts = [
    `${project.tempo.toFixed(1)} bpm`, project.timeSignature,
    plural(project.lanes.length, 'lane'), plural(project.patterns.length, 'pattern')
  ].join(' · ')

  return (
    <section className="pj-project" aria-label="Project">
      <div className="pj-title">
        <Label>project</Label>
        <h1>{project.name}</h1>
        <Label>{facts}</Label>
      </div>
      {asking ? (
        <InlineField key={asking} kind={asking} initial={asking === 'save-as' ? `${project.name} copy`.slice(0, 60) : ''} onClose={() => setAsking(null)} />
      ) : (
        <div className="pj-actions">
          <RoundButton icon="import" label="Import project (JSON)" onClick={() => void A.importProject()} />
          <RoundButton icon="export" label="Export project (JSON)" onClick={() => void A.exportProject()} />
          <span className="sep" style={{ alignSelf: 'center' }} />
          <Pill onClick={() => void A.createProject()}>New project</Pill>
          <Pill onClick={() => setAsking('save-as')}>Save as…</Pill>
          <Pill kind="primary" style={{ padding: '0 16px' }} onClick={() => setAsking('version')}>Save version</Pill>
        </div>
      )}
    </section>
  )
}

// ── Patterns ────────────────────────────────────────────────────────────────

const STEPS = Array.from({ length: 16 }, (_, i) => i)

function PatternCard({ pat, lanes, current }: { pat: Pattern; lanes: Lane[]; current: boolean }): ReactNode {
  const bars = plural(pat.bars, 'bar')
  return (
    <button
      type="button" className="pj-card" aria-current={current || undefined}
      aria-label={`Open ${pat.id} ${pat.name}, ${bars}${current ? ', open now' : ''}`}
      onClick={() => A.openPattern(pat.id)}
    >
      <span className="pj-card-head"><b>{pat.id}</b><span>{bars}</span></span>
      <span className="pj-card-name">{pat.name}</span>
      <span className="pj-preview" aria-hidden="true">
        {lanes.map((lane, row) => (
          <span key={lane.id} className="pj-dots" data-row={row}>
            {STEPS.map((i) => <i key={i} data-on={pat.steps[lane.id]?.[0]?.[i] ? '' : undefined} />)}
          </span>
        ))}
      </span>
    </button>
  )
}

function PatternsModule(): ReactNode {
  const project = useStore((s) => s.project)
  const lanes = useMemo(() => project.lanes.slice(0, 3), [project.lanes])
  const slots = Array.from({ length: PATTERN_SLOTS }, (_, i) => patternId(i))

  return (
    <section className="pj-patterns" aria-label="Patterns">
      <div className="pj-patterns-head">
        <Label>patterns · {project.patterns.length} of {PATTERN_SLOTS}</Label>
        <Label>click to open</Label>
      </div>
      <div className="pj-grid-scroll">
        <div className="pj-grid">
          {slots.map((id, i) => {
            const pat = project.patterns.find((p) => p.id === id)
            return pat ? (
              <PatternCard key={id} pat={pat} lanes={lanes} current={id === project.currentPatternId} />
            ) : (
              <button key={id} type="button" className="pj-empty" aria-label={`New pattern in slot ${id}`} title={`New pattern in slot ${id}`} onClick={() => A.addPattern(i)}>
                <span className="mono">{id}</span>
                <span className="pj-plus" aria-hidden="true">+</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Right column ────────────────────────────────────────────────────────────

const SAVE: Record<'saved' | 'saving' | 'failed', { tone: LedTone; text: string }> = {
  saved: { tone: 'ok', text: 'All changes autosaved' },
  saving: { tone: 'accent', text: 'Saving' },
  failed: { tone: 'warn', text: 'Not saved — see the message below' }
}

function SavedModule(): ReactNode {
  const saveState = useStore((s) => s.saveState)
  const location = useStore((s) => s.location)
  const fileName = useStore((s) => s.fileName)
  const path = `${location ? location.replace(/\/$/, '') + '/' : ''}${fileName}.r8s`
  return (
    <section className="pj-side" aria-label="Saved state" style={{ gap: 10 }}>
      <Label>saved</Label>
      <div className="pj-saved">
        <Led tone={SAVE[saveState].tone} size={8} />
        <span className="pj-saved-text">
          <b role="status">{SAVE[saveState].text}</b>
          <span className="label pj-path" title={path}>{path}</span>
        </span>
      </div>
    </section>
  )
}

function HistoryModule({ now }: { now: number }): ReactNode {
  const history = useStore((s) => s.history)
  const rows = useMemo(() => byNewest(history, (h) => h.at), [history])
  return (
    <section className="pj-side pj-history" aria-label="Autosave history">
      <Label style={{ marginBottom: 4 }}>autosave history</Label>
      {rows.length === 0 ? (
        <p className="muted pj-none">No history yet. Entries appear as you work.</p>
      ) : (
        <div className="pj-history-list">
          {rows.map((h) => (
            <div key={h.id} className="pj-history-row">
              <span className="pj-history-text">
                <span className="pj-what">{h.what}</span>
                <span className="pj-when">
                  <span className="label">{relativeTime(h.at, now)}</span>
                  {h.named && <Chip kind="stored">version</Chip>}
                </span>
              </span>
              <RoundButton icon="reset" label={`Restore “${h.what}”`} onClick={() => void A.restoreHistory(h.id)} />
            </div>
          ))}
        </div>
      )}
      <Label style={{ marginTop: 6, lineHeight: 1.4 }}>restoring keeps the current version in history</Label>
    </section>
  )
}

function RecentsModule({ now }: { now: number }): ReactNode {
  const recents = useStore((s) => s.recents)
  const fileName = useStore((s) => s.fileName)
  const rows = useMemo(() => byNewest(recents, (f) => f.modifiedAt), [recents])
  return (
    <section className="pj-side pj-recents" aria-label="Recent projects">
      <Label style={{ marginBottom: 4 }}>recent projects</Label>
      {rows.length === 0 && <p className="muted pj-none">No saved projects yet.</p>}
      {rows.map((f) =>
        f.name === fileName ? (
          <div key={f.name} className="pj-recent" aria-current="page">
            <span className="pj-recent-name">{f.name}</span>
            <span className="label">open now</span>
          </div>
        ) : (
          <button key={f.name} type="button" className="pj-recent" aria-label={`Open ${f.name}`} onClick={() => void A.openProject(f.name)}>
            <span className="pj-recent-name">{f.name}</span>
            <span className="label">{relativeTime(f.modifiedAt, now)}</span>
          </button>
        )
      )}
    </section>
  )
}

export function Projects(): ReactNode {
  const now = useNow()
  return (
    <>
      <ProjectModule />
      <div className="pj-body">
        <PatternsModule />
        <div className="pj-column">
          <SavedModule />
          <HistoryModule now={now} />
          <RecentsModule now={now} />
        </div>
      </div>
    </>
  )
}
