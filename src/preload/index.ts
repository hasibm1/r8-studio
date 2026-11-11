import { contextBridge, ipcRenderer } from 'electron'

// The only door between the UI and the machine: named storage calls, nothing else.
const call = (channel: string) => (...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('r8', {
  storage: {
    location: call('storage:location'),
    list: call('storage:list'),
    read: call('storage:read'),
    write: call('storage:write'),
    history: call('storage:history'),
    addHistory: call('storage:addHistory'),
    readHistory: call('storage:readHistory'),
    importFile: call('storage:importFile'),
    exportFile: call('storage:exportFile')
  }
})
