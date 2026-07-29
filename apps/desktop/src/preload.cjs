const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlas', {
  getStatus: () => ipcRenderer.invoke('atlas:status'),
  ask: (objective) => ipcRenderer.invoke('atlas:ask', objective),
  chat: {
    open: () => ipcRenderer.invoke('atlas:chat:open'),
    send: (session, input) => ipcRenderer.invoke('atlas:chat:send', session, input),
    close: (session) => ipcRenderer.invoke('atlas:chat:close', session),
  },
  memory: {
    list: () => ipcRenderer.invoke('atlas:memory:list'),
    forget: (id) => ipcRenderer.invoke('atlas:memory:forget', id),
  },
  persona: {
    list: () => ipcRenderer.invoke('atlas:persona:list'),
    select: (id) => ipcRenderer.invoke('atlas:persona:select', id),
    describe: (id) => ipcRenderer.invoke('atlas:persona:describe', id),
    create: (input) => ipcRenderer.invoke('atlas:persona:create', input),
    update: (id, input) => ipcRenderer.invoke('atlas:persona:update', id, input),
    delete: (id) => ipcRenderer.invoke('atlas:persona:delete', id),
  },
  permissions: {
    select: (roots) => ipcRenderer.invoke('atlas:permissions:select', roots),
  },
});
