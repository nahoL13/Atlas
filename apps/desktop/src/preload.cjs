const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlas', {
  getStatus: () => ipcRenderer.invoke('atlas:status'),
  ask: (objective) => ipcRenderer.invoke('atlas:ask', objective),
  chat: {
    open: () => ipcRenderer.invoke('atlas:chat:open'),
    send: (session, input) => ipcRenderer.invoke('atlas:chat:send', session, input),
    close: (session) => ipcRenderer.invoke('atlas:chat:close', session),
  },
});
