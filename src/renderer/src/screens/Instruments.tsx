// Instrument map (BRIEF.md B7.2): match each lane to the R-8 and confirm it by ear.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { countHits, noteClashes, pad2 } from '../../../core/project'
import { MAX_LANE_NAME } from '../../../core/types'
import type { Lane, LaneId } from '../../../core/types'
import * as A from '../actions'
import { useStore } from '../store'
import { Chip, Label, Led, Pill, RoundButton, Switch } from '../ui'
import '../styles/instruments.css'

const R8 = 'R‑8' // non-breaking hyphen: "R-8" never wraps

type NumKey = 'channel' | 'note' | 'defaultVelocity'
const NUM: Record<NumKey, { min: number; max: number; word: string }> = {
  channel: { min: 1, max: 16, word: 'channel' },
  note: { min: 0, max: 127, word: 'note' },
  defaultVelocity: { min: 1, max: 127, word: 'default velocity' }
}

type Errors = Record<string, string>
type Report = (key: string, message: string | null) => void

/** Whole number in range, or null. */
function parseWhole(text: string, min: number, max: number): number | null {
  const t = text.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= min && n <= max ? n : null
}

function NumField({ lane, field, clash, describedBy, report }: {
  lane: Lane; field: NumKey; clash?: boolean; describedBy?: string; report: Report
}): ReactNode {
  const id = useId()
  const { min, max, word } = NUM[field]
  const value = lane[field]
  const key = `${lane.id}:${field}`
  const [draft, setDraft] = useState(String(value))
  const draftRef = useRef(draft)
  draftRef.current = draft

  // The store changed underneath (undo, redo, project opened): show its value.
  useEffect(() => {
    if (parseWhole(draftRef.current, min, max) !== value) {
      setDraft(String(value))
      report(key, null)
    }
  }, [value, min, max, key, report])
  useEffect(() => () => report(key, null), [key, report])

  const invalid = parseWhole(draft, min, max) === null
  const name = lane.name.trim() || 'This lane'

  const change = (text: string): void => {
    setDraft(text)
    const n = parseWhole(text, min, max)
    if (n === null) {
      report(key, `${name}: ${word} must be a whole number from ${min} to ${max}. Still sending ${value}.`)
      return
    }
    report(key, null)
    if (n !== value) A.setLaneField(lane.id, field, n)
  }
  const revert = (): void => {
    setDraft(String(value))
    report(key, null)
  }

  return (
    <span className="im-cell">
      <label className="sr-only" htmlFor={id}>{`${name} ${field === 'channel' ? 'MIDI channel' : field === 'note' ? 'MIDI note' : word}, ${min} to ${max}`}</label>
      <input
        id={id} className="input num im-num" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={3}
        value={draft} aria-invalid={invalid || clash ? true : undefined} aria-describedby={invalid || clash ? describedBy : undefined}
        onChange={(e) => change(e.target.value)}
        onBlur={() => { if (invalid) revert() }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') revert()
          else if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </span>
  )
}

function NameField({ lane, index, describedBy, report }: { lane: Lane; index: number; describedBy?: string; report: Report }): ReactNode {
  const id = useId()
  const key = `${lane.id}:name`
  const [draft, setDraft] = useState(lane.name)
  const draftRef = useRef(draft)
  draftRef.current = draft

  // The store changed underneath (undo, redo, project opened): show its value.
  useEffect(() => {
    if (draftRef.current !== lane.name) {
      setDraft(lane.name)
      report(key, null)
    }
  }, [lane.name, key, report])
  useEffect(() => () => report(key, null), [key, report])

  const invalid = draft.trim() === ''
  const change = (text: string): void => {
    const next = text.slice(0, MAX_LANE_NAME)
    setDraft(next)
    if (next.trim() === '') {
      report(key, `Lane ${pad2(index + 1)} needs a name. Still called ${lane.name}.`)
      return
    }
    report(key, null)
    if (next !== lane.name) A.setLaneField(lane.id, 'name', next)
  }
  const revert = (): void => {
    setDraft(lane.name)
    report(key, null)
  }

  return (
    <>
      <label className="sr-only" htmlFor={id}>{`Lane ${pad2(index + 1)} name`}</label>
      <input
        id={id} className="input im-name" maxLength={MAX_LANE_NAME} autoComplete="off" spellCheck={false}
        value={draft} aria-invalid={invalid ? true : undefined} aria-describedby={invalid ? describedBy : undefined}
        onChange={(e) => change(e.target.value)}
        onBlur={() => { if (invalid) revert() }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') revert()
          else if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </>
  )
}

type RowState = 'waiting' | 'clash' | 'heard' | 'new'

function Row({ lane, index, state, clashWith, canRemove, confirming, errorId, clashId, report, askRemove, cancelRemove }: {
  lane: Lane; index: number; state: RowState; clashWith: Lane | undefined; canRemove: boolean; confirming: boolean
  errorId: string; clashId: string; report: Report
  askRemove: (id: LaneId) => void; cancelRemove: () => void
}): ReactNode {
  const project = useStore((s) => s.project)
  const name = lane.name.trim() || `Lane ${pad2(index + 1)}`
  const hits = confirming ? countHits(project, lane.id) : 0
  const keepRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (confirming) keepRef.current?.focus() }, [confirming])

  const status =
    state === 'waiting' ? 'waiting for your answer'
    : state === 'clash' ? `same note as ${clashWith?.name ?? 'another lane'}`
    : state === 'heard' ? `heard on ${R8}`
    : 'not tested'
  const tone = state === 'waiting' ? 'accent' : state === 'clash' ? 'clash' : state === 'heard' ? 'ok' : 'hollow'

  const confirmKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') { e.stopPropagation(); cancelRemove() }
  }

  return (
    <>
      <div className="im-row" data-state={state} data-off={!lane.enabled || undefined} data-confirming={confirming || undefined}>
        <span className="im-on">
          <Switch size="md" on={lane.enabled} label={`${name} enabled`} onChange={(v) => A.setLaneField(lane.id, 'enabled', v)} />
        </span>
        <div className="im-lane im-dim">
          <span className="im-badge" aria-hidden="true">{pad2(index + 1)}</span>
          <NameField lane={lane} index={index} describedBy={errorId} report={report} />
        </div>
        <RoundButton
          className="im-ping" icon="ping" label={lane.enabled ? `Ping ${name}` : `${name} is off, so it is not sent`}
          tone={state === 'waiting' ? 'accent' : undefined} disabled={!lane.enabled}
          onClick={() => A.pingLane(lane.id)}
        />
        <span className="im-dim"><NumField lane={lane} field="channel" describedBy={errorId} report={report} /></span>
        <span className="im-dim"><NumField lane={lane} field="note" clash={state === 'clash'} describedBy={state === 'clash' ? `${errorId} ${clashId}` : errorId} report={report} /></span>
        <span className="im-dim"><NumField lane={lane} field="defaultVelocity" describedBy={errorId} report={report} /></span>
        <span className="im-status">
          <span className="im-status-text im-dim" data-state={state}>
            <Led tone={tone} size={8} />
            <span>{status}</span>
          </span>
          {canRemove && (
            <RoundButton
              className="im-remove" icon="remove" tone="danger" label={`Remove ${name}`}
              aria-expanded={confirming}
              onClick={() => {
                if (confirming) cancelRemove()
                else if (countHits(project, lane.id) > 0) askRemove(lane.id)
                else A.removeLane(lane.id)
              }}
            />
          )}
        </span>
      </div>
      {confirming && (
        <div className="im-confirm" role="group" aria-label={`Remove ${name}`} onKeyDown={confirmKey}>
          <span className="im-confirm-text">
            <Led tone="clash" size={8} />
            <span>{`Remove ${name} and its ${hits} ${hits === 1 ? 'hit' : 'hits'}? You can undo this.`}</span>
          </span>
          <span className="im-confirm-actions">
            <Pill className="im-danger" onClick={() => { cancelRemove(); A.removeLane(lane.id) }}>Remove lane</Pill>
            <button type="button" ref={keepRef} className="pill" onClick={cancelRemove}>Keep it</button>
          </span>
        </div>
      )}
    </>
  )
}

function listChannels(chs: number[]): string {
  if (chs.length <= 1) return chs.join('')
  return `${chs.slice(0, -1).join(', ')} and ${chs[chs.length - 1]}`
}

export function Instruments(): ReactNode {
  const project = useStore((s) => s.project)
  const ping = useStore((s) => s.ping)
  const pingFailed = useStore((s) => s.pingFailed)
  const lanes = project.lanes

  const errorId = useId()
  const clashId = useId()
  const [errors, setErrors] = useState<Errors>({})
  const report = useCallback<Report>((key, message) => {
    setErrors((prev) => {
      if (message === null) {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      }
      return prev[key] === message ? prev : { ...prev, [key]: message }
    })
  }, [])

  const [confirmId, setConfirmId] = useState<LaneId | null>(null)
  const cancelRemove = useCallback(() => setConfirmId(null), [])
  useEffect(() => {
    if (confirmId && !lanes.some((l) => l.id === confirmId)) setConfirmId(null)
  }, [confirmId, lanes])

  const clashes = noteClashes(lanes)
  // One sentence per pair, named from the later lane: "High Tom and Open HH both send note 46".
  const clashPairs: string[] = []
  lanes.forEach((a, i) => {
    const b = clashes.get(a.id)
    if (b && lanes.indexOf(b) < i) clashPairs.push(`${a.name} and ${b.name} both send note ${a.note}`)
  })

  const channels = Array.from(new Set(lanes.filter((l) => l.enabled).map((l) => l.channel))).sort((x, y) => x - y)
  const messages = Object.values(errors)
  const waiting = ping ? lanes.find((l) => l.id === ping.laneId) : undefined
  const waitingIndex = waiting ? lanes.indexOf(waiting) : -1

  const rowState = (l: Lane): RowState =>
    waiting?.id === l.id ? 'waiting' : clashes.has(l.id) ? 'clash' : l.heard === 'heard' ? 'heard' : 'new'

  return (
    <div className="im">
      <section className="module im-map" aria-label="Instrument map">
        <div className="im-top">
          <Label>{`instrument map · ${lanes.length} ${lanes.length === 1 ? 'lane' : 'lanes'}`}</Label>
          {clashPairs.length > 0 && (
            <span className="im-clash" id={clashId}>
              <Chip kind="clash" role="status">
                <Led tone="clash" size={8} />
                {clashPairs[0]}
                {clashPairs.length > 1 ? ` · ${clashPairs.length - 1} more` : ''}
              </Chip>
            </span>
          )}
        </div>

        <div className="im-head">
          <div className="im-title">
            <h1>Match each lane to your {R8}</h1>
            <p className="muted">Each lane sends one note on one channel. Nothing is assumed from factory settings.</p>
          </div>
          <div className="im-actions">
            <RoundButton icon="import" label="Import project (JSON)" onClick={() => { void A.importProject() }} />
            <RoundButton icon="export" label="Export project (JSON)" onClick={() => { void A.exportProject() }} />
            <Pill className="im-all" icon="ping" title="Ping every lane, one after another" onClick={() => A.pingAll()}>All in order</Pill>
          </div>
        </div>

        <div className="im-scroll">
          <div className="im-table">
            <div className="im-cols label" aria-hidden="true">
              <span>on</span><span>lane</span><span>ping</span><span>channel</span><span>note</span><span>default vel</span><span>status</span>
            </div>
            {lanes.map((l, i) => (
              <Row
                key={l.id} lane={l} index={i} state={rowState(l)} clashWith={clashes.get(l.id)}
                canRemove={lanes.length > 1} confirming={confirmId === l.id}
                errorId={errorId} clashId={clashId} report={report}
                askRemove={setConfirmId} cancelRemove={cancelRemove}
              />
            ))}
            <button type="button" className="im-add" onClick={() => A.addLane()}>
              <span className="im-plus" aria-hidden="true">+</span>Add lane
            </button>
          </div>
        </div>

        <div className="im-notes" id={errorId} role="alert">
          {messages.map((m) => (
            <p key={m} className="im-error"><Led tone="clash" size={8} /><span>{m}</span></p>
          ))}
        </div>
        {channels.length > 1 && (
          <p className="im-quiet muted">
            {`Switched-on lanes send on channels ${listChannels(channels)} · The ${R8} hears instruments on one channel`}
          </p>
        )}
      </section>

      <div className="im-side">
        <section className="module im-ping-result" aria-label="Ping result" aria-live="polite">
          {waiting ? (
            <>
              <div className="im-ping-top label">
                <span>ping</span>
                <span className="im-waiting"><Led tone="accent" size={6} />waiting for you</span>
              </div>
              <div className="im-ping-lane">
                <span className="im-ping-name">{`${pad2(waitingIndex + 1)} ${waiting.name}`}</span>
                <span className="label nowrap">{`ch ${waiting.channel} · note ${waiting.note} · v ${waiting.defaultVelocity}`}</span>
              </div>
              <p className="muted im-copy">{`One note sent. Did the ${R8} play the ${waiting.name.trim().toLowerCase() || 'lane'}?`}</p>
              <div className="im-answers">
                <Pill kind="confirm" large onClick={() => A.answerPing(true)}>Yes, it played</Pill>
                <Pill large onClick={() => A.answerPing(false)}>Wrong or silent</Pill>
              </div>
            </>
          ) : (
            <>
              <Label>ping</Label>
              <p className="muted im-copy">Ping a lane to check it reaches the {R8}.</p>
            </>
          )}
        </section>

        <section className="module im-help" aria-label="If nothing plays" data-ring={pingFailed || undefined}>
          <Label>if nothing plays</Label>
          <ol className="im-checks">
            <li>The interface's MIDI OUT goes to the {R8}'s MIDI IN.</li>
            <li>On the {R8}, the Channel Message Switch is on.</li>
            <li>This lane's channel and note match the {R8}.</li>
            <li>The <button type="button" className="link im-link" onClick={() => A.go('midi')}>MIDI monitor</button> shows notes leaving the Mac.</li>
          </ol>
          <button type="button" className="link im-link im-guide" onClick={() => A.go('setup')}>Open the first-connection guide</button>
        </section>

        <section className="module im-about" aria-label="What this map controls">
          <Label>what this map controls</Label>
          <p className="muted im-copy">
            Only the note, channel and velocity each lane sends. Which {R8} sound a lane plays, and how it's tuned, is set on the {R8} itself for now.
          </p>
        </section>
      </div>
    </div>
  )
}
