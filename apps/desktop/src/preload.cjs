const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlas', {
  getStatus: () => ipcRenderer.invoke('atlas:status'),
  ask: (objective) => ipcRenderer.invoke('atlas:ask', objective),
});
