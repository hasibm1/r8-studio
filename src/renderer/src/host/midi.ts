import type { MidiHost, MidiOutputInfo, MidiSnapshot, MidiStatus } from './types'

const SAVED = 'r8.midi.output'

/** Web MIDI implementation. Outputs are remembered by name, since ids can change when replugged. */
export function webMidi(): MidiHost {
  let access: MIDIAccess | null = null
  let status: MidiStatus = 'starting'
  let outputs: MidiOutputInfo[] = []
  let selectedName: string | null = localStorage.getItem(SAVED)
  let port: MIDIOutput | null = null
  let notify: (s: MidiSnapshot) => void = () => {}

  const snapshot = (): MidiSnapshot => ({ status, outputs, selectedName })

  function refresh(): void {
    if (!access) return
    const live = [...access.outputs.values()].filter((o) => o.state === 'connected')
    outputs = live.map((o) => ({ id: o.id, name: o.name ?? 'MIDI output', manufacturer: o.manufacturer ?? '' }))
    if (!selectedName && live[0]) selectedName = live[0].name ?? null
    port = live.find((o) => (o.name ?? 'MIDI output') === selectedName) ?? null
    status = port ? 'ok' : selectedName ? 'missing' : 'no-outputs'
    if (!port && !live.length && !selectedName) status = 'no-outputs'
    notify(snapshot())
  }

  async function request(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      status = 'unsupported'
      notify(snapshot())
      return
    }
    try {
      // SysEx is deliberately not requested.
      access = await navigator.requestMIDIAccess({ sysex: false })
      access.onstatechange = refresh
      refresh()
    } catch {
      status = 'denied'
      notify(snapshot())
    }
  }

  return {
    start: async (onChange) => { notify = onChange; await request() },
    rescan: async () => { if (access) refresh(); else await request() },
    select: (name) => {
      selectedName = name
      localStorage.setItem(SAVED, name)
      refresh()
    },
    snapshot,
    send: (bytes, atMs) => {
      // SysEx is off until it has been validated against a real R-8.
      if (bytes[0] === 0xf0 || bytes[0] === 0xf7) return false
      if (!port || port.state !== 'connected') return false
      try {
        port.send(bytes, atMs)
        return true
      } catch {
        return false
      }
    },
    clear: () => {
      const p = port as (MIDIOutput & { clear?: () => void }) | null
      try { p?.clear?.() } catch { /* not supported on this port */ }
    }
  }
}
