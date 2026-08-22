const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlas', {
  getStatus: () => ipcRenderer.invoke('atlas:status'),
  ask: (objective) => ipcRenderer.invoke('atlas:ask', objective),
  cancel: () => ipcRenderer.invoke('atlas:cancel'),
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
  network: {
    select: (access) => ipcRenderer.invoke('atlas:network:select', access),
  },
  tts: {
    voices: () => ipcRenderer.invoke('atlas:tts:voices'),
    speak: (text, voiceURI) => ipcRenderer.invoke('atlas:tts:speak', { text, voiceURI }),
    cancel: () => ipcRenderer.invoke('atlas:tts:cancel'),
    available: () => ipcRenderer.invoke('atlas:tts:available'),
  },
  stt: {
    available: () => ipcRenderer.invoke('atlas:stt:available'),
    transcribe: (pcm, sampleRate) =>
      ipcRenderer.invoke('atlas:stt:transcribe', { pcm, sampleRate }),
    cancel: () => ipcRenderer.invoke('atlas:stt:cancel'),
    captureBegin: () => ipcRenderer.invoke('atlas:stt:capture:begin'),
    captureEnd: () => ipcRenderer.invoke('atlas:stt:capture:end'),
  },
  vad: {
    available: () => ipcRenderer.invoke('atlas:vad:available'),
    resources: () => ipcRenderer.invoke('atlas:vad:resources'),
  },
  metrics: {
    read: () => ipcRenderer.invoke('atlas:metrics:read'),
  },
  tokens: {
    read: () => ipcRenderer.invoke('atlas:tokens:read'),
  },
});
