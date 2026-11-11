// Sequencer (BRIEF.md B7.1): program a pattern and see everything about every
// step without opening panels.

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import * as A from '../actions'
import { duplicateTarget } from '../../../core/edits'
import { isSilent } from '../../../core/events'
import { PARAMS, formatParam, getParam, isEdited, paramDefault, speakParam } from '../../../core/params'
import type { ParamDef } from '../../../core/params'
import { pad2 } from '../../../core/project'
import { MAX_BARS } from '../../../core/types'
import type { Hit, Lane } from '../../../core/types'
import { Knob, Label, Led, RoundButton, Switch } from '../ui'
import { pattern, playWithin, useStore, viewBar } from '../store'
import '../styles/sequencer.css'

const GROUPS = [0, 1, 2, 3]
const STEPS = Array.from({ length: 16 }, (_, i) => i)

/** Sixteen cells laid out as four groups of four, like the pads. */
function Groups({ cell }: { cell: (step: number) => ReactNode }): ReactNode {
  return GROUPS.map((g) => (
    <div className="grp" key={g}>{STEPS.slice(g * 4, g * 4 + 4).map(cell)}</div>
  ))
}

function Pad({ lane, step, hit, silent, head, selected }: {
  lane: Lane; step: number; hit: Hit | null; silent: boolean; head: boolean; selected: boolean
}): ReactNode {
  return (
    <button
      type="button" className="pad" role="gridcell" aria-selected={selected} tabIndex={selected ? 0 : -1}
      data-hit={hit ? '' : undefined} data-silent={silent || undefined} data-head={head || undefined}
      data-sel={selected || undefined} data-chance={hit && hit.chance < 100 ? '' : undefined}
      aria-label={`${lane.name}, step ${step + 1}${hit ? `, velocity ${hit.velocity}` : ', empty'}`}
      onClick={() => A.clickPad(lane.id, step)}
    >
      {hit && (
        <span className="pad-fill" style={{ height: `${Math.max(14, Math.round((hit.velocity / 127) * 100))}%` }}>
          {Array.from({ length: hit.ratchet }, (_, k) => <span key={k} />)}
        </span>
      )}
      {hit && isEdited(hit) && <span className="pad-dot" />}
    </button>
  )
}

/** Every step's value for the open lane, aligned under its pad. */
function Drawer({ lane, row, bar, selStep }: { lane: Lane; row: (Hit | null)[]; bar: number; selStep: number }): ReactNode {
  const cell = (p: ParamDef) => (step: number): ReactNode => {
    const hit = row[step]
    const sel = step === selStep
    const v = hit ? getParam(hit, p.key) : null
    const text = v === null ? '' : formatParam(p.key, v)
    const label = `${p.label}, step ${step + 1}${v === null ? '' : v === p.def && p.key !== 'velocity' ? ', default' : `, ${text}`}`
    return (
      <button type="button" key={step} tabIndex={-1} className={p.key === 'velocity' ? 'dcell vel' : 'dcell'} data-sel={sel || undefined} aria-label={label} onClick={() => A.selectStep(lane.id, step)}>
        {v !== null && p.key === 'velocity' && <>{text}<span className="meter"><span style={{ width: `${Math.round((v / 127) * 100)}%` }} /></span></>}
        {v !== null && p.key !== 'velocity' && (v === p.def ? <span className="ddot" /> : <span className={p.live ? 'dchip live' : 'dchip stored'}>{text}</span>)}
      </button>
    )
  }
  return (
    <div className="drawer">
      <div className="drawer-head">
        <span>every step · {lane.name.toLowerCase()} · bar {bar + 1}</span>
        <span className="legend"><span className="ddot" />default<span className="dchip live" style={{ marginLeft: 8 }}>+8%</span>edited</span>
      </div>
      {PARAMS.map((p) => (
        <div key={p.key} style={{ display: 'contents' }}>
          {p.key === 'pitch' && <div className="drawer-div"><span /></div>}
          <div className={p.key === 'velocity' ? 'drow vel' : 'drow'}><Groups cell={cell(p)} /></div>
        </div>
      ))}
    </div>
  )
}

function StepEditor({ lane, hit, bar, step }: { lane: Lane; hit: Hit | null; bar: number; step: number }): ReactNode {
  const knob = (p: ParamDef): ReactNode => {
    const def = paramDefault(p.key, lane)
    const v = hit ? getParam(hit, p.key) : def
    return (
      <Knob
        key={p.key} label={p.label} value={v} min={p.min} max={p.max} bipolar={p.bipolar}
        kind={p.live ? 'live' : 'stored'} disabled={!hit} changed={!!hit && (p.key === 'velocity' || v !== def)}
        display={formatParam(p.key, v)} spoken={speakParam(p.key, v)}
        onChange={(n) => A.setParam(p.key, n)} onReset={() => A.setParam(p.key, def)}
        onDragStart={A.beginGesture} onDragEnd={A.endGesture}
      />
    )
  }
  const heard = lane.heard === 'heard'
  return (
    <section className="module step-editor" aria-label="Step editor">
      <div className="se-head">
        <div className="se-top">
          <Label>step</Label>
          <span className="label se-status"><Led tone={heard ? 'ok' : 'hollow'} /><span className="nowrap">{heard ? 'heard on R‑8' : 'not tested on R‑8'}</span></span>
        </div>
        <div className="se-id"><span className="mono">{bar + 1}.{pad2(step + 1)}</span><span>{lane.name}</span></div>
        <span className="label" style={hit ? undefined : { color: 'var(--text)' }}>
          {hit ? `ch ${lane.channel} · note ${lane.note} · default vel ${lane.defaultVelocity}` : 'no hit here · click the pad to add one'}
        </span>
      </div>

      <div className="se-group">
        <div className="section-dot"><Led tone="accent" />played now</div>
        <div className="se-knobs">{PARAMS.filter((p) => p.live).map(knob)}</div>
      </div>

      <div className="se-group">
        <div className="section-dot"><span className="led hollow-stored" />kept for R‑8<span className="muted">· not heard yet</span></div>
        <div className="se-knobs">{PARAMS.filter((p) => !p.live).map(knob)}</div>
      </div>

      <div className="se-actions">
        <RoundButton large icon="ping" label="Preview: send this hit to the R‑8 once" disabled={!hit} onClick={A.previewSelectedHit} />
        <RoundButton large icon="reset" label="Reset parameters, keep velocity" disabled={!hit} onClick={A.resetSelectedHit} />
        <span className="spacer" />
        <RoundButton large icon="remove" tone="danger" label="Remove this hit" disabled={!hit} onClick={A.removeSelectedHit} />
      </div>
    </section>
  )
}

export function Sequencer(): ReactNode {
  const s = useStore((x) => x)
  const pat = pattern(s)
  const lanes = s.project.lanes
  const vb = viewBar(s)
  const within = playWithin(s)
  const playBar = within >= 0 ? Math.floor(within / 16) : -1
  const playStep = playBar === vb ? within % 16 : -1
  const selVisible = s.selBar === vb
  const selLane = lanes.find((l) => l.id === s.selLane) ?? lanes[0]
  const selHit = pat.steps[selLane.id]?.[s.selBar]?.[s.selStep] ?? null
  const n = vb + 1
  const dupTo = duplicateTarget(pat, vb)

  // Keep keyboard focus on the selected pad while moving around the grid.
  useEffect(() => {
    const grid = document.querySelector('[data-grid]')
    if (grid?.contains(document.activeElement)) grid.querySelector<HTMLElement>('.pad[data-sel]')?.focus()
  }, [s.selLane, s.selStep, vb])

  return (
    <>
      <div className="row">
        <div className="module compact seq-pattern">
          <Label>pattern</Label>
          <div className="seq-pattern-row">
            <span className="lcd-chip">{pat.id}</span>
            <label htmlFor="pname" className="sr-only">Pattern name</label>
            <input id="pname" className="input seq-pname" value={pat.name} maxLength={60} spellCheck={false} onChange={(e) => A.renamePattern(e.target.value)} />
          </div>
        </div>

        <div className="module compact seq-bars">
          <div className="seq-bars-head">
            <Label>bars</Label>
            <Switch on={s.follow} onChange={A.toggleFollow} label="Follow playhead">follow playhead</Switch>
          </div>
          <div className="bar-tabs" role="group" aria-label="Bars">
            {Array.from({ length: pat.bars }, (_, b) => (
              <button type="button" key={b} className="bar-tab" aria-label={`Bar ${b + 1}`} aria-pressed={b === vb} onClick={() => A.showBar(b)}>
                <span className="bar-tab-name"><Led tone={b === playBar ? 'accent' : b === vb ? 'cream' : 'off'} />bar {b + 1}</span>
                <span className="bar-dots">
                  {STEPS.map((k) => <span key={k} data-on={lanes.some((l) => pat.steps[l.id]?.[b]?.[k]) || undefined} />)}
                </span>
              </button>
            ))}
            <button type="button" className="bar-add" aria-label="Add bar" title={pat.bars >= MAX_BARS ? 'A pattern has up to 4 bars' : 'Add bar'} disabled={pat.bars >= MAX_BARS} onClick={A.addBar}>+</button>
          </div>
        </div>

        <div className="module compact seq-edit">
          <Label>edit · bar {n}</Label>
          <div className="seq-edit-row">
            <RoundButton icon="undo" label="Undo" disabled={!s.undo.length} onClick={A.undo} />
            <RoundButton icon="redo" label="Redo" disabled={!s.redo.length} onClick={A.redo} />
            <span className="sep" />
            <RoundButton icon="copy" label={`Copy bar ${n}`} onClick={() => A.barOp('copy')} />
            <RoundButton icon="paste" label={`Paste into bar ${n}`} disabled={!s.clip} onClick={() => A.barOp('paste')} />
            <RoundButton icon="duplicate" label={`Duplicate bar ${n} into bar ${dupTo + 1}`} disabled={dupTo === vb} onClick={() => A.barOp('duplicate')} />
            <span className="sep" />
            <RoundButton icon="clear" tone="danger" label={`Clear bar ${n}`} onClick={() => A.barOp('clear')} />
          </div>
        </div>
      </div>

      <div className="seq-body">
        <div className="seq-grid-scroll">
          <div className="seq-grid">
            <section className="module tracks" aria-label="Tracks">
              <div className="tracks-head"><Label>tracks</Label></div>
              {lanes.map((l, i) => {
                const open = l.id === s.openLane
                const silent = isSilent(l, lanes)
                return (
                  <div className="lane-wrap" data-open={open || undefined} key={l.id}>
                    <div className="track-row">
                      <button type="button" className="track-btn" aria-expanded={open} title={open ? 'Hide parameters' : 'Show every step’s parameters'} onClick={() => A.toggleDrawer(l.id)}>
                        <span className="badge" data-sel={l.id === selLane.id || undefined}>{pad2(i + 1)}</span>
                        <span className="track-name" data-silent={silent || undefined}>{l.name}</span>
                        {open && <svg className="track-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </button>
                      <button type="button" className="ms" data-kind="mute" aria-label={`Mute ${l.name}`} aria-pressed={l.mute} onClick={() => A.toggleMute(l.id)}>M</button>
                      <button type="button" className="ms" data-kind="solo" aria-label={`Solo ${l.name}`} aria-pressed={l.solo} onClick={() => A.toggleSolo(l.id)}>S</button>
                    </div>
                    {open && (
                      <div className="drawer-names">
                        <div className="dn-head"><Led tone="accent" />played now</div>
                        <div className="dn vel">velocity</div><div className="dn">micro</div><div className="dn">chance</div><div className="dn">ratchet</div>
                        <div className="dn-head"><span className="led hollow-stored" />kept for R‑8</div>
                        <div className="dn">pitch</div><div className="dn">decay</div><div className="dn">nuance</div><div className="dn">pan</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>

            <section className="module steps" aria-label="Steps" role="grid" data-grid>
              <div className="steps-head" aria-hidden="true">
                <Groups cell={(i) => (
                  <div className="step-num" key={i} data-head={i === playStep || undefined} data-beat={i % 4 === 0 || undefined} data-sel={(selVisible && i === s.selStep) || undefined}>
                    <i /><span>{pad2(i + 1)}</span>
                  </div>
                )} />
              </div>
              {lanes.map((l) => {
                const open = l.id === s.openLane
                const row = pat.steps[l.id]?.[vb] ?? []
                const silent = isSilent(l, lanes)
                const isSel = l.id === selLane.id && selVisible
                return (
                  <div className="lane-wrap" data-open={open || undefined} key={l.id}>
                    <div className="pad-row" role="row">
                      <Groups cell={(i) => (
                        <Pad key={i} lane={l} step={i} hit={row[i] ?? null} silent={silent} head={i === playStep} selected={isSel && i === s.selStep} />
                      )} />
                    </div>
                    {open && <Drawer lane={l} row={row} bar={vb} selStep={isSel ? s.selStep : -1} />}
                  </div>
                )
              })}
            </section>
          </div>
        </div>

        <StepEditor lane={selLane} hit={selHit} bar={s.selBar} step={s.selStep} />
      </div>
    </>
  )
}

/** Footer legend: teaches the three pad clicks with tiny pad pictures. */
export function SequencerHint(): ReactNode {
  return (
    <span className="seq-hint" role="note" aria-label="Click an empty pad to add a hit, a hit to select it, the selected hit to remove it, and a track name to see its parameters">
      <span aria-hidden="true"><i className="mini" />add</span>
      <span aria-hidden="true"><i className="mini hit" />select</span>
      <span aria-hidden="true"><i className="mini hit sel" />remove</span>
      <span aria-hidden="true">track name → parameters</span>
    </span>
  )
}
