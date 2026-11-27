'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('manosh', {
  getInfo: () => ipcRenderer.invoke('pet:info'),
  getWorkArea: (x, y) => ipcRenderer.invoke('pet:workarea', x, y),
  setBounds: (b) => ipcRenderer.send('pet:bounds', b),
  setIgnore: (v) => ipcRenderer.send('pet:ignore', !!v),
  ready: () => ipcRenderer.send('pet:ready'),
  showMenu: (ctx) => ipcRenderer.send('pet:menu', ctx),
  onAction: (cb) => ipcRenderer.on('pet:action', (_e, a) => cb(a)),
});
