import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'

const EXT = '.r8s'
const HISTORY_LIMIT = 30

const projectsDir = (): string => join(app.getPath('music'), 'R-8 Studio')
const historyDir = (name: string): string => join(projectsDir(), '.history', name)

/** Project names become file names, so they may not contain path parts. */
function safeName(name: unknown): string {
  if (typeof name !== 'string') throw new Error('Bad project name')
  const n = name.trim()
  if (!n || n.length > 80 || /[\\/:\0]/.test(n) || n.startsWith('.')) throw new Error('Bad project name')
  return n
}

function safeId(id: unknown): string {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id)) throw new Error('Bad history id')
  return id
}

/** Write to a temp file and rename, so a crash can't leave half a project. */
async function writeAtomic(path: string, text: string): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  await fs.writeFile(tmp, text, 'utf8')
  await fs.rename(tmp, path)
}

interface HistoryEntry { id: string; what: string; at: string; named: boolean }

async function readIndex(name: string): Promise<HistoryEntry[]> {
  try {
    const list = JSON.parse(await fs.readFile(join(historyDir(name), 'index.json'), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function registerIpc(): void {
  ipcMain.handle('storage:location', () => projectsDir().replace(app.getPath('home'), '~'))

  ipcMain.handle('storage:list', async () => {
    await fs.mkdir(projectsDir(), { recursive: true })
    const names = (await fs.readdir(projectsDir())).filter((f) => f.endsWith(EXT))
    const out = await Promise.all(names.map(async (f) => ({
      name: f.slice(0, -EXT.length),
      modifiedAt: (await fs.stat(join(projectsDir(), f))).mtime.toISOString()
    })))
    return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  })

  ipcMain.handle('storage:read', async (_e, name) => {
    try {
      return await fs.readFile(join(projectsDir(), safeName(name) + EXT), 'utf8')
    } catch {
      return null
    }
  })

  ipcMain.handle('storage:write', async (_e, name, text) => {
    if (typeof text !== 'string') throw new Error('Bad project data')
    await fs.mkdir(projectsDir(), { recursive: true })
    await writeAtomic(join(projectsDir(), safeName(name) + EXT), text)
  })

  ipcMain.handle('storage:history', (_e, name) => readIndex(safeName(name)))

  ipcMain.handle('storage:addHistory', async (_e, name, what, text, named) => {
    const n = safeName(name)
    if (typeof text !== 'string') throw new Error('Bad project data')
    await fs.mkdir(historyDir(n), { recursive: true })
    const entry: HistoryEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      what: String(what).slice(0, 120), at: new Date().toISOString(), named: !!named
    }
    await writeAtomic(join(historyDir(n), entry.id + '.json'), text)
    const all = [entry, ...(await readIndex(n))]
    // Named versions are kept; only automatic entries age out.
    const autos = all.filter((e) => !e.named)
    const drop = new Set(autos.slice(HISTORY_LIMIT).map((e) => e.id))
    const kept = all.filter((e) => !drop.has(e.id))
    await writeAtomic(join(historyDir(n), 'index.json'), JSON.stringify(kept))
    await Promise.all([...drop].map((id) => fs.rm(join(historyDir(n), id + '.json'), { force: true })))
    return kept
  })

  ipcMain.handle('storage:readHistory', async (_e, name, id) => {
    try {
      return await fs.readFile(join(historyDir(safeName(name)), safeId(id) + '.json'), 'utf8')
    } catch {
      return null
    }
  })

  ipcMain.handle('storage:importFile', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: 'Import project', properties: ['openFile'],
      filters: [{ name: 'R-8 Studio project', extensions: ['json', 'r8s'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const path = r.filePaths[0]
    return { name: basename(path).replace(/\.(json|r8s)$/i, ''), text: await fs.readFile(path, 'utf8') }
  })

  ipcMain.handle('storage:exportFile', async (e, suggested, text) => {
    if (typeof text !== 'string') throw new Error('Bad project data')
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showSaveDialog(win, {
      title: 'Export project', defaultPath: `${safeName(suggested)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePath) return false
    await writeAtomic(r.filePath, text)
    return true
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1180, minHeight: 760, useContentSize: true,
    backgroundColor: '#131312', title: 'R-8 Studio', show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The sequencer must keep time when the window is hidden or behind others.
      backgroundThrottling: false
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  // MIDI is the only permission the app ever grants, and only to its own page.
  // Electron reports every Web MIDI request as 'midiSysex', with or without
  // SysEx, so that name has to be allowed for plain notes to work. SysEx stays
  // off inside the app instead: the UI always asks for MIDI with sysex: false
  // (the port then rejects SysEx), and host/midi.ts refuses SysEx bytes.
  const isMidi = (permission: string): boolean => permission === 'midi' || permission === 'midiSysex'
  const ownPage = (url: string | undefined): boolean => {
    if (!url) return false
    const dev = process.env['ELECTRON_RENDERER_URL']
    return app.isPackaged || !dev ? url.startsWith('file://') : url.startsWith(dev)
  }
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) =>
    callback(isMidi(permission) && ownPage(details.requestingUrl ?? wc.getURL())))
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) =>
    isMidi(permission) && ownPage(wc?.getURL() ?? origin))
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
