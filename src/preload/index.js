import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  search: (query) => ipcRenderer.send('search', query),
  goHome: () => ipcRenderer.send('go-home')
})