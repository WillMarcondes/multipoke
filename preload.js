const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('state:get'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  addLive: (ch) => ipcRenderer.invoke('twitch:add', ch),
  removeLive: (ch) => ipcRenderer.invoke('twitch:remove', ch),
  reload: (i) => ipcRenderer.invoke('game:reload', i),
  devtools: (i) => ipcRenderer.invoke('game:devtools', i)
});
