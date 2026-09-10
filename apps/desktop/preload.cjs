'use strict';
const {ipcRenderer,contextBridge} = require('electron');
if(location.origin==='https://kpnc-meet.pages.dev')contextBridge.exposeInMainWorld('meetDesktop',{checkUpdate:()=>ipcRenderer.invoke('update:check'),downloadUpdate:()=>ipcRenderer.invoke('update:download'),installUpdate:()=>ipcRenderer.invoke('update:install')});
ipcRenderer.on('meet:action',(_event,id)=>{
  if (location.origin !== 'https://kpnc-meet.pages.dev' || !['mic','camera','chat-toggle'].includes(id)) return;
  const meeting = document.getElementById('meeting');
  if (meeting && !meeting.classList.contains('hidden')) document.getElementById(id)?.click();
});
