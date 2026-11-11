// MIDI & clock screen (BRIEF.md B7.3). Everything shown here is read from the
// store; nothing claims to know what the R-8 itself is doing.

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import * as A from '../actions'
import { useStore } from '../store'
import { Chip, Icon, Label, Led, RoundButton, Switch } from '../ui'
import '../styles/midi.css'

const R8 = <span className="nowrap">R-8</span>

function Output(): ReactNode {
  const midi = useStore((s) => s.midi)
  const { status, outputs, selectedName } = midi
  const missing = selectedName !== null && !outputs.some((o) => o.name === selectedName)
  const names = [...outputs.map((o) => o.name), ...(missing && selectedName !== null ? [selectedName] : [])]
  const listable = status === 'ok' || status === 'missing' || status === 'no-outputs'

  // Radio group keys: arrows move the choice, as in a native radio group.
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    const live = outputs.map((o) => o.name)
    if (!live.length) return
    e.preventDefault()
    const at = selectedName === null ? -1 : live.indexOf(selectedName)
    const next = live[at < 0 ? (d > 0 ? 0 : live.length - 1) : (at + d + live.length) % live.length]
    A.selectOutput(next)
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons[names.indexOf(next)]?.focus()
  }
  const tabStop = selectedName !== null && names.includes(selectedName) ? selectedName : names[0]

  return (
    <section className="module" aria-label="Output">
      <div className="midi-head">
        <Label>output</Label>
        <RoundButton icon="rescan" label="Rescan MIDI ports" onClick={() => void A.rescanMidi()} />
      </div>

      {status === 'starting' && <p className="midi-state muted" role="status">Looking for MIDI outputs</p>}
      {status === 'unsupported' && <p className="midi-state" role="status">This window can't use MIDI.</p>}
      {status === 'denied' && (
        <p className="midi-state" role="status">
          MIDI access was refused, so nothing can be sent. Quit and reopen the app and it asks again.
          The desktop app allows MIDI on its own, so this normally only appears in a browser.
        </p>
      )}
      {status === 'no-outputs' && (
        <p className="midi-state" role="status">No MIDI outputs found. Plug in the interface or check Audio MIDI Setup.</p>
      )}

      {listable && names.length > 0 && (
        <div className="midi-outs" role="radiogroup" aria-label="MIDI output" onKeyDown={onKey}>
          {outputs.map((o) => {
            const sel = o.name === selectedName
            return (
              <button
                key={o.id} type="button" className="midi-out" role="radio" aria-checked={sel}
                tabIndex={o.name === tabStop ? 0 : -1} onClick={() => A.selectOutput(o.name)}
              >
                <span className="dot" aria-hidden="true" />
                <span className="text">
                  <span className="name">{o.name}</span>
                  <span className="sub">{[o.manufacturer.trim().toLowerCase(), 'connected'].filter(Boolean).join(' · ')}</span>
                </span>
                {sel && <span className="state" aria-hidden="true"><Led tone="ok" /></span>}
              </button>
            )
          })}
          {missing && selectedName !== null && (
            <button type="button" className="midi-out" role="radio" aria-checked="true" tabIndex={selectedName === tabStop ? 0 : -1}>
              <span className="dot" aria-hidden="true" />
              <span className="text">
                <span className="name">{selectedName}</span>
                <span className="sub">not found</span>
              </span>
              <span className="state"><Led tone="warn" /></span>
            </button>
          )}
        </div>
      )}

      <p className="muted">If the interface is unplugged, sending pauses and the status light turns amber. It reconnects on its own.</p>
    </section>
  )
}

function Monitor(): ReactNode {
  const rows = useStore((s) => s.monitor)
  const paused = useStore((s) => s.monitorPaused)
  const lanes = useStore((s) => s.project.lanes)

  const noteText = (ch: number | null, note: number | null): string => {
    if (note === null) return ''
    const lane = lanes.find((l) => l.channel === ch && l.note === note)
    return lane ? `${lane.name} · ${note}` : String(note)
  }

  return (
    <section className="module grow midi-monitor" aria-label="MIDI monitor">
      <div className="midi-head">
        <Label>monitor · outgoing · newest first{paused ? ' · paused' : ''}</Label>
        <div className="tools">
          <RoundButton icon={paused ? 'play' : 'pause'} label={paused ? 'Resume monitor' : 'Pause monitor'} pressed={paused} onClick={A.toggleMonitorPause} />
          <RoundButton icon="clear" tone="muted" label="Clear monitor" disabled={rows.length === 0} onClick={A.clearMonitor} />
        </div>
      </div>
      <div className="midi-log">
        <div className="midi-log-scroll" role="table" aria-label="Outgoing MIDI messages" tabIndex={0}>
          <div className="midi-row head" role="row">
            <span role="columnheader">pos</span>
            <span role="columnheader">type</span>
            <span role="columnheader">ch</span>
            <span role="columnheader">note</span>
            <span role="columnheader" className="vel">vel</span>
          </div>
          {rows.length === 0 && (
            <div className="midi-empty">
              {paused ? 'Paused. Nothing is listed until you resume.' : 'Nothing sent yet. Press Play or send a test note.'}
            </div>
          )}
          {rows.map((m) => (
            <div className="midi-row" role="row" key={m.id}>
              <span role="cell" className="pos">{m.pos}</span>
              <span role="cell">{m.type}</span>
              <span role="cell">{m.ch ?? ''}</span>
              <span role="cell" className="note">
                {m.type === 'NOTE ON' && <Led tone="accent" />}
                <span>{noteText(m.ch, m.note)}</span>
              </span>
              <span role="cell" className="vel">{m.vel ?? ''}</span>
            </div>
          ))}
        </div>
      </div>
      <span className="fine">Note-offs and clock pulses are sent but not listed.</span>
    </section>
  )
}

function Clock(): ReactNode {
  const on = useStore((s) => s.settings.clock)
  const running = useStore((s) => s.clockRunning)
  const word = running ? 'sending' : on ? 'on at next play' : 'off'

  return (
    <section className="module grow" aria-label="MIDI clock">
      <div className="midi-head">
        <Label>midi clock</Label>
        <Switch size="lg" on={on} label="Send MIDI clock" onChange={(v) => A.setSetting('clock', v)}>
          <span className="midi-clock-word">{on ? 'on' : 'off'}</span>
        </Switch>
      </div>
      <p>
        Not needed to play notes. Turn it on only when the <span className="nowrap">R-8's</span> own sequencer should follow this tempo, with the {R8} set to MIDI sync.
      </p>
      <div className="midi-rows">
        <div>
          <span className="what">Clock pulses <span className="fine">F8 · 24 ppqn</span></span>
          <span className="word" data-live={running || undefined}>{word}</span>
        </div>
        <div>
          <span className="what">Start · Stop <span className="fine">FA FC</span></span>
          <span className="word" data-live={running || undefined}>{word}</span>
        </div>
        <div>
          <span className="what">Song Position Pointer <Chip kind="stored">not yet tested on R‑8</Chip></span>
          <span className="word">off</span>
        </div>
      </div>
      <span className="fine">The switch is read when you press Play. Stop always returns to the top, so Continue is never sent.</span>
    </section>
  )
}

function Slider(p: {
  label: string; min: number; max: number; value: number; display: string; ends: string[]
  /** Fill from the middle (a signed value) instead of from the left. */
  centred?: boolean
  onChange: (v: number) => void
}): ReactNode {
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100
  const lo = p.centred ? Math.min(50, pct) : 0
  const hi = p.centred ? Math.max(50, pct) : pct
  const fill = { '--lo': `${lo}%`, '--hi': `${hi}%` } as CSSProperties
  return (
    <div className="midi-slider">
      <div className="top"><span>{p.label}</span><span className="value">{p.display}</span></div>
      <input
        className="midi-range" type="range" min={p.min} max={p.max} step={1} value={p.value} style={fill}
        aria-label={p.label} aria-valuetext={p.display}
        onChange={(e) => p.onChange(Number(e.currentTarget.value))}
      />
      <div className="ends" aria-hidden="true">{p.ends.map((t) => <span key={t}>{t}</span>)}</div>
    </div>
  )
}

function Timing(): ReactNode {
  const offset = useStore((s) => s.settings.offsetMs)
  const ahead = useStore((s) => s.settings.lookaheadMs)
  const signed = offset > 0 ? `+${offset}` : offset < 0 ? `−${-offset}` : '0'
  return (
    <section className="module grow midi-timing" aria-label="Timing">
      <Label>timing</Label>
      <Slider
        label="Output offset" min={-50} max={50} value={offset} display={`${signed} ms`} centred
        ends={['earlier', '0', 'later']} onChange={(v) => A.setSetting('offsetMs', v)}
      />
      <Slider
        label="Scheduler look-ahead" min={25} max={250} value={ahead} display={`${ahead} ms`}
        ends={['edits heard sooner', 'steadier timing']} onChange={(v) => A.setSetting('lookaheadMs', v)}
      />
    </section>
  )
}

function Test(): ReactNode {
  const lanes = useStore((s) => s.project.lanes)
  const testLane = useStore((s) => s.testLane)
  const repeat = useStore((s) => s.testRepeat)
  const current = lanes.find((l) => l.id === testLane) ?? lanes[0]
  return (
    <section className="module grow" aria-label="Test one instrument">
      <Label>test one instrument</Label>
      <div className="midi-test">
        <select className="input" aria-label="Instrument" value={current?.id ?? ''} disabled={!current} onChange={(e) => A.setTestLane(e.currentTarget.value)}>
          {lanes.map((l, i) => (
            <option key={l.id} value={l.id}>{String(i + 1).padStart(2, '0')} {l.name} · ch {l.channel} · note {l.note}</option>
          ))}
        </select>
        <RoundButton large tone="accent" icon="ping" label="Send one note" disabled={!current} onClick={() => { A.sendTestNote() }} />
        <RoundButton large icon="repeat" label="Repeat on every quarter note" pressed={repeat} disabled={!current} onClick={A.toggleTestRepeat} />
      </div>
    </section>
  )
}

export function Midi(): ReactNode {
  return (
    <div className="midi">
      <div className="midi-col left">
        <Output />
        <Monitor />
      </div>
      <div className="midi-col right">
        <Clock />
        <Timing />
        <Test />
        <section className="module midi-sysex" aria-label="System exclusive">
          <div className="text">
            <Label>system exclusive</Label>
            <span>Off. Pattern and bulk transfer come later.</span>
          </div>
          <span className="midi-lock" role="img" aria-label="Locked" title="Locked"><Icon name="lock" /></span>
        </section>
      </div>
    </div>
  )
}
