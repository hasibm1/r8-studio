// First connection (BRIEF.md B7.5, A3, A4). Replaces the whole shell.
// The app cannot read anything back from the R-8, so every claim about the
// R-8 on this screen is either a tick or an answer from the user.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Lane } from '../../../core/types'
import * as A from '../actions'
import { useStore } from '../store'
import { Chip, Icon, Label, Led, Pill } from '../ui'
import '../styles/setup.css'

const STEPS = ['Wire it up', 'Choose the output', 'Prepare the R-8', 'Hear the kick', 'Map the other instruments']

/** "R-8" never breaks across lines (B11). */
const R8 = <span className="nowrap">R-8</span>
const r8 = (text: string): ReactNode => {
  const parts = text.split('R-8')
  return parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && R8}</span>)
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function Intro({ step, title, children }: { step: number; title: string; children: ReactNode }): ReactNode {
  return (
    <div className="su-intro">
      <Label>step {step + 1} of {STEPS.length}</Label>
      <h1>{r8(title)}</h1>
      <p>{children}</p>
    </div>
  )
}

function SignalPath({ focus }: { focus?: 'interface' | 'r8' }): ReactNode {
  const status = useStore((s) => s.midi.status)
  const name = useStore((s) => s.midi.selectedName)
  return (
    <div className="su-path" role="group" aria-label="Signal path">
      <div className="su-node"><b>Mac</b><span className="label">{R8} Studio</span></div>
      <span className="label">usb →</span>
      <div className="su-node" data-focus={focus === 'interface' || undefined}><b>{name ?? 'MIDI interface'}</b><span className="su-port">MIDI OUT</span></div>
      <span className="label">5-pin →</span>
      <div className="su-node" data-focus={focus === 'r8' || undefined}><b>Roland {R8}</b><span className="su-port">MIDI IN</span></div>
      <span className="spacer" />
      <span className="su-found" data-state={status === 'ok' ? 'ok' : status === 'starting' ? 'wait' : 'warn'} role="status">
        <Led tone={status === 'ok' ? 'ok' : status === 'starting' ? 'hollow' : 'warn'} />
        {status === 'ok' ? 'interface found' : status === 'starting' ? 'looking for an interface' : 'interface not found'}
      </span>
    </div>
  )
}

function Tick({ on, onChange, title, sub, ring, children }: {
  on: boolean; onChange: (on: boolean) => void; title: string; sub: string; ring?: boolean; children?: ReactNode
}): ReactNode {
  return (
    <div className="su-tick" data-ring={ring || undefined}>
      <label className="su-tick-main">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span className="su-tick-text"><b>{r8(title)}</b><span>{r8(sub)}</span></span>
      </label>
      {children && <div className="su-tick-extra">{children}</div>}
    </div>
  )
}

/** A whole-number field. Out-of-range input is shown as invalid and is not saved. */
function NumField({ label, spoken, value, min, max, onCommit }: {
  label: string; spoken: string; value: number; min: number; max: number; onCommit: (n: number) => void
}): ReactNode {
  const [text, setText] = useState(String(value))
  const parsed = /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN
  const valid = parsed >= min && parsed <= max
  // Follow changes made elsewhere (undo, the instrument map).
  useEffect(() => { setText((t) => (Number(t.trim()) === value ? t : String(value))) }, [value])
  return (
    <label className="su-field">
      <Label>{label}</Label>
      <input
        className="su-num" inputMode="numeric" value={text} aria-label={spoken} aria-invalid={!valid || undefined}
        title={`${min}–${max}`}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          const n = /^\d+$/.test(t.trim()) ? Number(t.trim()) : NaN
          if (n >= min && n <= max && n !== value) onCommit(n)
        }}
        onBlur={() => { if (!valid) setText(String(value)) }}
      />
      {!valid && <span className="su-field-error">{min}–{max}</span>}
    </label>
  )
}

// ── Steps ───────────────────────────────────────────────────────────────────

function WireStep(): ReactNode {
  return (
    <>
      <Intro step={0} title="Wire it up">Two cables: USB from the Mac to the MIDI interface, and a 5-pin MIDI cable from the interface to the {R8}.</Intro>
      <SignalPath />
      <div className="su-list">
        <div className="su-note" data-ring>
          <b>OUT goes to IN</b>
          <span>Connect the interface's MIDI OUT to the {R8}'s MIDI IN, not OUT to OUT.</span>
        </div>
        <div className="su-note">
          <b>If macOS doesn't see the interface</b>
          <span>Open Audio MIDI Setup → Window → Show MIDI Studio and check whether it appears there.</span>
        </div>
      </div>
    </>
  )
}

function OutputStep(): ReactNode {
  const midi = useStore((s) => s.midi)
  const [scanning, setScanning] = useState(false)
  const rescan = async (): Promise<void> => {
    setScanning(true)
    try { await A.rescanMidi() } catch { /* the status line below says what is wrong */ }
    setScanning(false)
  }
  const problem =
    midi.status === 'denied' ? {
      title: 'MIDI access was refused',
      text: <>{R8} Studio isn't allowed to use MIDI devices. Quit and reopen the app and allow MIDI access when asked, then rescan. Nothing can be sent until then.</>
    } : midi.status === 'unsupported' ? {
      title: 'MIDI is not available here',
      text: <>This build can't reach the Mac's MIDI devices, so nothing can be sent. Run the desktop app to continue.</>
    } : midi.status === 'no-outputs' ? {
      title: 'No MIDI outputs found',
      text: <>Plug in the interface or check Audio MIDI Setup → Window → Show MIDI Studio, then rescan.</>
    } : midi.status === 'missing' ? {
      title: `${midi.selectedName ?? 'The selected output'} is not found`,
      text: <>It was selected before but isn't connected now. Plug it back in and rescan, or choose another output.</>
    } : null

  return (
    <>
      <Intro step={1} title="Choose the output">Pick the MIDI interface that is wired to the {R8}. Notes go to this output only.</Intro>
      <div className="su-list">
        <div className="su-list-head">
          <Label>{midi.status === 'starting' ? 'looking for outputs' : `midi outputs · ${midi.outputs.length}`}</Label>
          <Pill icon="rescan" onClick={() => void rescan()} disabled={scanning}>Rescan</Pill>
        </div>
        {midi.outputs.length > 0 && (
          <div className="su-list" role="radiogroup" aria-label="MIDI output">
            {midi.outputs.map((o) => {
              const on = o.name === midi.selectedName
              return (
                <button key={o.id} type="button" className="su-output" role="radio" aria-checked={on} onClick={() => A.selectOutput(o.name)}>
                  <span className="su-radio" aria-hidden="true" />
                  <span className="su-output-text">
                    <b>{o.name}</b>
                    <span className="label">{o.manufacturer || 'MIDI output'}</span>
                  </span>
                  {on && <Chip kind={midi.status === 'ok' ? 'ok' : 'stored'} role="status">{midi.status === 'ok' ? 'selected · connected' : 'selected'}</Chip>}
                </button>
              )
            })}
          </div>
        )}
        {problem && (
          <div className="su-note" data-ring role="status">
            <b className="su-warn"><Led tone="warn" />{problem.title}</b>
            <span>{problem.text}</span>
          </div>
        )}
        {midi.status === 'ok' && (
          <p className="su-quiet">Connected means the Mac sees the interface. Whether the {R8} receives anything is checked in step 4.</p>
        )}
      </div>
    </>
  )
}

function PrepareStep({ lane, ticks, setTick }: { lane: Lane; ticks: boolean[]; setTick: (i: number, on: boolean) => void }): ReactNode {
  const next = ticks.indexOf(false)
  return (
    <>
      <Intro step={2} title="Get the R-8 ready to listen">Three checks on the {R8} itself. {R8} Studio can't read them back, so tick each one once you've checked it.</Intro>
      <SignalPath focus="r8" />
      <div className="su-list">
        <Tick on={ticks[0]} onChange={(on) => setTick(0, on)} ring={next === 0}
          title="Channel Message Switch is on" sub="Without it the R-8 ignores incoming notes." />
        <Tick on={ticks[1]} onChange={(on) => setTick(1, on)} ring={next === 1}
          title="Sync mode is INTERNAL" sub="R-8 Studio times every note itself, so the R-8 doesn't need clock for this test." />
        <Tick on={ticks[2]} onChange={(on) => setTick(2, on)} ring={next === 2}
          title="Kick's channel and note match" sub="Check which channel and note the R-8's kick receives on, then enter them here.">
          <NumField label="channel" spoken="Kick MIDI channel" value={lane.channel} min={1} max={16} onCommit={(n) => A.setLaneField(lane.id, 'channel', n)} />
          <NumField label="note" spoken="Kick MIDI note" value={lane.note} min={0} max={127} onCommit={(n) => A.setLaneField(lane.id, 'note', n)} />
        </Tick>
      </div>
    </>
  )
}

function HearStep({ lane, goTo }: { lane: Lane; goTo: (step: number) => void }): ReactNode {
  const ping = useStore((s) => s.ping)
  const failed = useStore((s) => s.pingFailed)
  const sending = useStore((s) => s.midi.status === 'ok')
  const waiting = ping?.laneId === lane.id
  const heard = lane.heard === 'heard'
  const message = `NOTE ON · CH${lane.channel} · ${lane.note} · V${lane.defaultVelocity}`

  return (
    <>
      <Intro step={3} title="Hear the kick">Send one note and listen. MIDI clock isn't needed for this: {R8} Studio sends the note itself, so the {R8} stays on INTERNAL sync.</Intro>
      <div className="su-ping">
        <button type="button" className="su-ping-btn" aria-label={`Send the ${lane.name} note`} title={`Send the ${lane.name} note`} onClick={() => A.pingLane(lane.id)}>
          <Icon name="ping" size={24} />
        </button>
        <div className="su-ping-text">
          <b>{waiting || heard || failed ? 'Send it again' : `Send the ${lane.name} note`}</b>
          <span className="label">{message}</span>
          {!sending && <span className="su-warn label"><Led tone="warn" />no interface · nothing will be sent · <button type="button" className="link" onClick={() => goTo(1)}>choose the output</button></span>}
        </div>
        <span className="spacer" />
        {waiting ? <Chip kind="live" role="status">waiting for your answer</Chip>
          : heard ? <Chip kind="ok" role="status"><Led tone="ok" size={8} />heard on {R8}</Chip>
          : <Chip kind="stored" role="status">not tested</Chip>}
      </div>

      {waiting && (
        <div className="su-question" role="group" aria-label="Ping answer">
          <b>Did the {R8} play the kick?</b>
          <div className="su-answers">
            <Pill kind="confirm" large onClick={() => A.answerPing(true)}>Yes, it played</Pill>
            <Pill large onClick={() => A.answerPing(false)}>Wrong or silent</Pill>
          </div>
        </div>
      )}

      {failed && !waiting && (
        <div className="su-note" data-ring>
          <Label>if nothing plays</Label>
          <ol className="su-checks">
            <li>The cable runs from the interface's MIDI OUT to the {R8}'s MIDI IN, not OUT to OUT.</li>
            <li>The {R8}'s Channel Message Switch is on.</li>
            <li>The {R8}'s kick receives on channel {lane.channel}, note {lane.note}. <button type="button" className="link" onClick={() => goTo(2)}>Change them in step 3</button>.</li>
            <li>The right output is chosen in <button type="button" className="link" onClick={() => goTo(1)}>step 2</button>, and the {R8}'s audio is turned up.</li>
          </ol>
          <span className="su-quiet">Then send the note again.</span>
        </div>
      )}

      {heard && !waiting && (
        <p className="su-quiet">You confirmed the {R8} played it. Changing the kick's channel or note resets this to not tested.</p>
      )}
    </>
  )
}

function MapStep({ kickHeard }: { kickHeard: boolean }): ReactNode {
  const lanes = useStore((s) => s.project.lanes)
  return (
    <>
      <Intro step={4} title="Map the other instruments">
        Each lane sends one note. The instrument map is where you match every lane's channel and note to the {R8}, ping it, and say whether you heard it.
      </Intro>
      <div className="su-list">
        <div className="su-note">
          <b>{lanes.length} lanes · {lanes.filter((l) => l.heard === 'heard').length} heard on {R8}</b>
          <span>
            {kickHeard ? 'The kick is confirmed by your ear.' : 'The kick is not tested yet; you can ping it from the map too.'}{' '}
            The other lanes start as not tested. Their note numbers are only a starting point, because {R8} Studio can't read the {R8}'s own assignments.
          </span>
        </div>
        <div className="su-note">
          <b>You can come back</b>
          <span>The map's "if nothing plays" checks link back to this guide.</span>
        </div>
      </div>
    </>
  )
}

// ── Screen ──────────────────────────────────────────────────────────────────

export function Setup(): ReactNode {
  const lane = useStore((s) => s.project.lanes[0])
  const toast = useStore((s) => s.toast)
  const error = useStore((s) => s.error)
  const [step, setStep] = useState(0)
  const [ticks, setTicks] = useState([false, false, false])
  const heard = lane.heard === 'heard'
  const last = STEPS.length - 1

  const skip = (): void => { A.finishSetup(); A.go('sequencer') }
  const finish = (): void => { A.finishSetup(); A.go('instruments') }
  const setTick = (i: number, on: boolean): void => setTicks((t) => t.map((v, k) => (k === i ? on : v)))

  const nextLabel = ['Next: choose the output', <>Next: prepare the {R8}</>, 'Next: hear the kick', heard ? 'Next' : 'Continue anyway', 'Open the instrument map'][step]

  return (
    <>
      <header className="su-top">
        <div className="su-top-left">
          <div className="brand"><i />R-8 STUDIO</div>
          <Label>first connection</Label>
        </div>
        <Pill onClick={skip}>Skip setup</Pill>
      </header>

      <div className="su-body">
        <nav className="su-steps" aria-label="Setup steps">
          <Label style={{ padding: '0 4px 8px' }}>{STEPS.length} steps</Label>
          {STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'now' : 'todo'
            return (
              <button key={label} type="button" className="su-step" data-state={state} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
                <span className="su-step-dot" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
                <span>{r8(label)}</span>
                {state === 'done' && <span className="sr-only"> · done</span>}
              </button>
            )
          })}
        </nav>

        <main className="su-main">
          <div className="su-column">
            {step === 0 && <WireStep />}
            {step === 1 && <OutputStep />}
            {step === 2 && <PrepareStep lane={lane} ticks={ticks} setTick={setTick} />}
            {step === 3 && <HearStep lane={lane} goTo={setStep} />}
            {step === 4 && <MapStep kickHeard={heard} />}

            <div className="su-foot">
              <Pill large disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Pill>
              <span className="su-message label" aria-live="polite" data-error={error ? '' : undefined}>{error || toast}</span>
              <Pill kind="primary" large style={{ padding: '0 20px' }} onClick={() => (step === last ? finish() : setStep(step + 1))}>{nextLabel}</Pill>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
