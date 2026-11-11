import { useEffect } from 'react'
import type { ReactNode } from 'react'
import * as A from './actions'
import { pad2 } from '../../core/project'
import { Icon, Led, RoundButton } from './ui'
import { getState, interfaceName, pattern, playWithin, useStore, viewBar } from './store'
import type { Screen } from './store'
import { Sequencer, SequencerHint } from './screens/Sequencer'
import { Instruments } from './screens/Instruments'
import { Midi } from './screens/Midi'
import { Projects } from './screens/Projects'
import { Setup } from './screens/Setup'

// Kit joins this list in Phase 2, when the Kit designer does what its name says.
const NAV: { id: Screen; label: string }[] = [
  { id: 'sequencer', label: 'Sequencer' },
  { id: 'instruments', label: 'Instruments' },
  { id: 'midi', label: 'MIDI' },
  { id: 'projects', label: 'Projects' }
]

const HINTS: Record<Screen, string> = {
  sequencer: '',
  instruments: 'ping a lane, then say whether the R-8 played it',
  midi: 'outgoing only · the R-8 sends nothing back on this cable',
  projects: 'every edit is autosaved',
  setup: ''
}

function Header(): ReactNode {
  const screen = useStore((s) => s.screen)
  const playing = useStore((s) => s.playing)
  const tempo = useStore((s) => s.project.tempo)
  const pos = useStore((s) => {
    const w = playWithin(s)
    const vb = viewBar(s)
    return `${vb + 1}.${w >= 0 && Math.floor(w / 16) === vb ? pad2((w % 16) + 1) : '--'}`
  })
  const status = useStore((s) => s.midi.status)
  const name = useStore(interfaceName)
  const clock = useStore((s) => (s.clockRunning ? 'clock on' : s.settings.clock ? 'clock on at play' : 'clock off'))
  const ok = status === 'ok'
  const line = ok ? `out · ${clock}` : status === 'missing' ? 'not found' : status === 'denied' ? 'MIDI access refused' : status === 'starting' ? 'looking for outputs' : 'no MIDI outputs'

  return (
    <div className="row">
      <div className="brand-nav">
        <div className="brand"><i />R-8 STUDIO</div>
        <nav className="nav" aria-label="Screens">
          {NAV.map((n) => (
            <button key={n.id} type="button" aria-current={screen === n.id ? 'page' : undefined} onClick={() => A.go(n.id)}>{n.label}</button>
          ))}
        </nav>
      </div>

      <div className="header-group" role="group" aria-label="Transport">
        <RoundButton large icon="stop" label="Stop" onClick={A.stop} />
        <RoundButton large icon="play" label="Play" pressed={playing} className="play" onClick={A.play} />
      </div>

      <div className="header-group tempo" role="group" aria-label="Tempo and position">
        <RoundButton label="Tempo down" onClick={() => A.nudgeTempo(-1)}>−</RoundButton>
        <div className="lcd"><span className="big">{tempo.toFixed(1)}</span><span className="cap">bpm</span></div>
        <RoundButton label="Tempo up" onClick={() => A.nudgeTempo(1)}>+</RoundButton>
        <button type="button" className="pill" onClick={A.tap}>Tap</button>
        <span className="sep" style={{ height: 24 }} />
        <div className="lcd" style={{ gap: 16, padding: '0 14px' }}>
          <span className="stack"><span className="cap">pos</span><span className="mid">{pos}</span></span>
          <span className="stack"><span className="cap">sig</span><span className="mid">4/4</span></span>
        </div>
      </div>

      <button type="button" className="status-link" onClick={() => A.go('midi')} aria-label={`MIDI interface: ${name}, ${line}. Open MIDI settings`}>
        <Led tone={ok ? 'ok' : 'warn'} size={8} />
        <span className="lines">
          <b>{ok || status === 'missing' ? name : 'No interface'}</b>
          <span className="label">{line}</span>
        </span>
      </button>
    </div>
  )
}

function Footer(): ReactNode {
  const screen = useStore((s) => s.screen)
  const save = useStore((s) => s.saveState)
  const lastOut = useStore((s) => s.lastOut)
  const toast = useStore((s) => s.toast)
  const error = useStore((s) => s.error)
  const sending = useStore((s) => s.midi.status === 'ok' || s.midi.status === 'starting')
  return (
    <footer className="footer">
      <span><Led tone={save === 'saved' ? 'ok' : save === 'failed' ? 'clash' : 'hollow'} />{save === 'saved' ? 'autosaved' : save === 'failed' ? 'not saved' : 'saving'}</span>
      <span title="Last message sent"><Icon name="last-out" size={12} /><span className="sr-only">Last out:</span>{lastOut}</span>
      <span className="spacer" />
      <span aria-live="polite" role="status">
        {toast ? <span className="toast" key={toast}>{toast}</span>
          : error ? <span className="error">{error} <button type="button" onClick={A.clearError}>dismiss</button></span>
          : !sending ? <span className="error">not sending · no interface</span>
          : screen === 'sequencer' ? <SequencerHint /> : HINTS[screen]}
      </span>
    </footer>
  )
}

function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = getState().screen
      const t = e.target as HTMLElement
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return
        e.preventDefault()
        if (e.shiftKey) A.redo(); else A.undo()
        return
      }
      if (typing || s === 'setup') return
      if (e.key === ' ') {
        e.preventDefault()
        A.togglePlay()
        return
      }
      if (s !== 'sequencer') return
      if (mod && !e.shiftKey) {
        const k = e.key.toLowerCase()
        if (k === 'c') A.barOp('copy')
        else if (k === 'v') A.barOp('paste')
        else if (k === 'd') A.barOp('duplicate')
        else return
        e.preventDefault()
        return
      }
      if (mod || e.altKey) return
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); A.removeSelectedHit(); return }
      const onGrid = t === document.body || !!t.closest('[data-grid]')
      if (!onGrid) return
      if (e.key === 'ArrowLeft') A.moveSelection(-1, 0)
      else if (e.key === 'ArrowRight') A.moveSelection(1, 0)
      else if (e.key === 'ArrowUp') A.moveSelection(0, -1)
      else if (e.key === 'ArrowDown') A.moveSelection(0, 1)
      else if (e.key === 'Enter') A.toggleSelectedHit()
      else return
      e.preventDefault()
    }
    // Space plays and stops; it must not also press whichever button has focus.
    const onKeyUp = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (e.key === ' ' && t.tagName === 'BUTTON' && getState().screen !== 'setup') e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
  }, [])
}

export function App(): ReactNode {
  const screen = useStore((s) => s.screen)
  const ready = useStore((s) => s.ready)
  const name = useStore((s) => pattern(s).name)
  useKeyboard()
  useEffect(() => { document.title = `R-8 Studio — ${name}` }, [name])
  if (!ready) return <div className="app" />
  if (screen === 'setup') return <div className="app"><Setup /></div>
  return (
    <div className="app">
      <Header />
      <div className="main">
        {screen === 'sequencer' && <Sequencer />}
        {screen === 'instruments' && <Instruments />}
        {screen === 'midi' && <Midi />}
        {screen === 'projects' && <Projects />}
      </div>
      <Footer />
    </div>
  )
}
