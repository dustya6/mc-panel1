const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listServers: () => ipcRenderer.invoke('servers:list'),
  saveServer: (server) => ipcRenderer.invoke('servers:save', server),
  deleteServer: (id) => ipcRenderer.invoke('servers:delete', id),
  testServer: (server) => ipcRenderer.invoke('server:test', server),
  getStatus: (id) => ipcRenderer.invoke('server:status', id),
  sendCommand: (id, command) => ipcRenderer.invoke('server:command', { id, command }),
});
