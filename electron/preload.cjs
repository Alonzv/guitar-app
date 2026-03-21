const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  callAnthropic: (payload) => ipcRenderer.invoke('anthropic-call', payload),
});
