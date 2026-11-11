// Everything the UI needs from the outside world goes through these two
// interfaces. The desktop app implements them with Electron IPC and Web MIDI;
// a plugin build would implement them with the plugin host instead.

export interface FileInfo { name: string; modifiedAt: string }
export interface HistoryEntry { id: string; what: string; at: string; named: boolean }

export interface StorageHost {
  /** Where projects live, for display (e.g. "~/Music/R-8 Studio"). */
  location(): Promise<string>
  list(): Promise<FileInfo[]>
  read(name: string): Promise<string | null>
  write(name: string, text: string): Promise<void>
  history(name: string): Promise<HistoryEntry[]>
  addHistory(name: string, what: string, text: string, named: boolean): Promise<HistoryEntry[]>
  readHistory(name: string, id: string): Promise<string | null>
  importFile(): Promise<{ name: string; text: string } | null>
  exportFile(suggestedName: string, text: string): Promise<boolean>
}

export interface MidiOutputInfo { id: string; name: string; manufacturer: string }

export type MidiStatus =
  | 'starting'
  | 'ok' // selected output is connected
  | 'missing' // selected output is unplugged
  | 'no-outputs'
  | 'denied'
  | 'unsupported'

export interface MidiSnapshot { status: MidiStatus; outputs: MidiOutputInfo[]; selectedName: string | null }

export interface MidiHost {
  start(onChange: (s: MidiSnapshot) => void): Promise<void>
  rescan(): Promise<void>
  select(name: string): void
  snapshot(): MidiSnapshot
  /** Returns false when nothing was sent (no connected output). */
  send(bytes: number[], atMs?: number): boolean
  /** Drop queued-but-unsent messages, where the port supports it. */
  clear(): void
}
