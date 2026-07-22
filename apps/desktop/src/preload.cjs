const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlas', {
  getStatus: () => ipcRenderer.invoke('atlas:status'),
});
