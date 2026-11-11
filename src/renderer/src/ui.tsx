// Shared building blocks (BRIEF.md B5). Screens compose these; they hold no app state.

import { useRef } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'

const icons = import.meta.glob<string>('./assets/icons/*.svg', { query: '?raw', import: 'default', eager: true })

export type IconName =
  | 'play' | 'stop' | 'pause' | 'undo' | 'redo' | 'copy' | 'paste' | 'duplicate' | 'clear' | 'ping' | 'reset'
  | 'remove' | 'last-out' | 'import' | 'export' | 'rescan' | 'repeat' | 'lock' | 'check' | 'close'
  | 'chevron-left' | 'chevron-right' | 'chevron-down'

/** One icon means one thing everywhere (B6). Colour follows the text colour. */
export function Icon({ name, size = 14 }: { name: IconName; size?: number }): ReactNode {
  return <span className="icon" aria-hidden="true" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: icons[`./assets/icons/${name}.svg`] ?? '' }} />
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label'>

/** Icon-only button. `label` is both the tooltip and the accessible name. */
export function RoundButton({ icon, label, large, tone, pressed, children, ...rest }: ButtonProps & {
  icon?: IconName; label: string; large?: boolean; tone?: 'danger' | 'accent' | 'muted'; pressed?: boolean
}): ReactNode {
  const cls = ['btn-round', large ? 'lg' : '', tone ?? '', rest.className ?? ''].join(' ')
  return (
    <button type="button" {...rest} className={cls} title={label} aria-label={label} aria-pressed={pressed}>
      {icon ? <Icon name={icon} size={large ? 16 : 14} /> : children}
    </button>
  )
}

export function Pill({ kind, large, icon, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: 'primary' | 'confirm'; large?: boolean; icon?: IconName
}): ReactNode {
  return (
    <button type="button" {...rest} className={['pill', kind ?? '', large ? 'lg' : '', rest.className ?? ''].join(' ')}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

/** `size`: sm 30×16, md 32×18 (quiet, for table rows), lg 44×26. */
export function Switch({ on, onChange, label, size = 'sm', children, disabled }: {
  on: boolean; onChange: (on: boolean) => void; label: string; size?: 'sm' | 'md' | 'lg'; children?: ReactNode; disabled?: boolean
}): ReactNode {
  return (
    <button type="button" className="switch-btn" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}>
      {children}
      <span className={`switch ${size}`} data-on={on || undefined}><span /></span>
    </button>
  )
}

export type LedTone = 'ok' | 'accent' | 'warn' | 'hollow' | 'clash' | 'off' | 'cream'

/** Status dot (B5): green = confirmed, accent = live/waiting, hollow = not tested, diamond = clash. */
export function Led({ tone, size = 6 }: { tone: LedTone; size?: number }): ReactNode {
  return <span className={`led ${tone}`} style={{ width: size, height: size }} />
}

export function Chip({ kind, children, role }: { kind: 'live' | 'stored' | 'clash' | 'ok'; children: ReactNode; role?: 'status' }): ReactNode {
  return <span className={`chip ${kind}`} role={role}>{children}</span>
}

/** A module's label line: lowercase mono 11. */
export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }): ReactNode {
  return <span className="label" style={style}>{children}</span>
}

export interface KnobProps {
  label: string
  value: number
  min: number
  max: number
  /** Arc fills from 12 o'clock instead of from the start. */
  bipolar?: boolean
  /** Value differs from its default: the arc lights up. */
  changed: boolean
  /** live = "played now" (light cap, accent arc); stored = kept for the R-8 (dark cap, cream arc). */
  kind: 'live' | 'stored'
  disabled?: boolean
  display: string
  spoken: string
  /** Pixels of drag for the full range. */
  travel?: number
  onChange: (v: number) => void
  onReset: () => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

/** Drag up to increase; arrows ±1, Shift ±10, Home/End; double-click resets (B8). */
export function Knob(p: KnobProps): ReactNode {
  const drag = useRef<{ y: number; v0: number } | null>(null)
  const clamp = (v: number): number => Math.max(p.min, Math.min(p.max, Math.round(v)))
  const norm = (p.value - p.min) / (p.max - p.min)
  let a0 = 0
  let a1 = norm * 270
  if (p.bipolar) {
    const a = (p.value / p.max) * 135
    a0 = p.value >= 0 ? 135 : 135 + a
    a1 = p.value >= 0 ? 135 + a : 135
  }
  const track = 'var(--pad-empty)'
  const fill = p.disabled ? track : !p.changed ? 'var(--knob-arc-default)' : p.kind === 'live' ? 'var(--accent)' : 'var(--stored)'
  const ring = `conic-gradient(from 225deg, ${track} 0deg ${a0}deg, ${fill} ${a0}deg ${a1}deg, ${track} ${a1}deg 270deg, transparent 270deg 360deg)`

  const down = (e: PointerEvent<HTMLButtonElement>): void => {
    if (p.disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, v0: p.value }
    p.onDragStart?.()
  }
  const move = (e: PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current
    if (!d) return
    const v = clamp(d.v0 + ((d.y - e.clientY) * (p.max - p.min)) / (p.travel ?? 160))
    if (v !== p.value) p.onChange(v)
  }
  const up = (): void => {
    if (!drag.current) return
    drag.current = null
    p.onDragEnd?.()
  }
  const key = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (p.disabled) return
    const inc = e.shiftKey ? 10 : 1
    let v: number | null = null
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v = p.value + inc
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v = p.value - inc
    else if (e.key === 'Home') v = p.min
    else if (e.key === 'End') v = p.max
    if (v === null) return
    e.preventDefault()
    e.stopPropagation()
    p.onChange(clamp(v))
  }

  return (
    <div className="knob-wrap">
      <button
        type="button" className="knob" data-kind={p.kind} disabled={p.disabled} style={{ background: ring }}
        role="slider" aria-label={p.label} aria-valuemin={p.min} aria-valuemax={p.max} aria-valuenow={p.value}
        aria-valuetext={p.disabled ? 'no hit' : `${p.label}, ${p.spoken}`}
        title={p.disabled ? undefined : 'Drag up or down, or use the arrow keys. Double-click to reset.'}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
        onDoubleClick={() => { if (!p.disabled) p.onReset() }}
      >
        <span className="knob-cap" style={{ transform: `rotate(${p.disabled ? 0 : Math.round(-135 + norm * 270)}deg)` }}><span /></span>
      </button>
      <span className="knob-text">
        <span className="label">{p.label}</span>
        <span className="knob-value" data-changed={(p.changed && !p.disabled) || undefined}>{p.disabled ? '—' : p.display}</span>
      </span>
    </div>
  )
}
