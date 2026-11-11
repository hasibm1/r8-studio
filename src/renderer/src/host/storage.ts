import type { FileInfo, HistoryEntry, StorageHost } from './types'

declare global {
  interface Window { r8?: { storage: StorageHost } }
}

/**
 * Fallback used when the UI runs outside Electron (a plain browser tab during
 * development). Keeps projects in localStorage so every screen still works.
 */
function browserStorage(): StorageHost {
  const key = (name: string): string => `r8.project.${name}`
  const hkey = (name: string): string => `r8.history.${name}`
  const get = <T,>(k: string, fallback: T): T => {
    try { return JSON.parse(localStorage.getItem(k) ?? '') as T } catch { return fallback }
  }
  return {
    location: async () => 'this browser (development)',
    list: async () => get<FileInfo[]>('r8.files', []).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
    read: async (name) => localStorage.getItem(key(name)),
    write: async (name, text) => {
      localStorage.setItem(key(name), text)
      const files = get<FileInfo[]>('r8.files', []).filter((f) => f.name !== name)
      localStorage.setItem('r8.files', JSON.stringify([{ name, modifiedAt: new Date().toISOString() }, ...files]))
    },
    history: async (name) => get<(HistoryEntry & { text: string })[]>(hkey(name), []).map(({ id, what, at, named }) => ({ id, what, at, named })),
    addHistory: async (name, what, text, named) => {
      const all = get<(HistoryEntry & { text: string })[]>(hkey(name), [])
      all.unshift({ id: Date.now().toString(36), what, at: new Date().toISOString(), named, text })
      localStorage.setItem(hkey(name), JSON.stringify(all.slice(0, 30)))
      return all.slice(0, 30).map(({ id, what: w, at, named: n }) => ({ id, what: w, at, named: n }))
    },
    readHistory: async (name, id) => get<(HistoryEntry & { text: string })[]>(hkey(name), []).find((e) => e.id === id)?.text ?? null,
    importFile: () => new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,.r8s'
      input.onchange = async () => {
        const f = input.files?.[0]
        resolve(f ? { name: f.name.replace(/\.(json|r8s)$/i, ''), text: await f.text() } : null)
      }
      input.oncancel = () => resolve(null)
      input.click()
    }),
    exportFile: async (suggested, text) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      a.download = `${suggested}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      return true
    }
  }
}

export const storage: StorageHost = window.r8?.storage ?? browserStorage()
export const inElectron = !!window.r8
