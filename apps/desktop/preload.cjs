'use strict';
const {ipcRenderer,contextBridge} = require('electron');
if(location.origin==='https://kpnc-meet.pages.dev')contextBridge.exposeInMainWorld('meetDesktop',{silentUpdates:true,onUpdateProgress:callback=>{const handler=(_event,progress)=>callback(progress);ipcRenderer.on('update:progress',handler);return()=>ipcRenderer.removeListener('update:progress',handler);},checkUpdate:()=>ipcRenderer.invoke('update:check'),downloadUpdate:()=>ipcRenderer.invoke('update:download'),installUpdate:()=>ipcRenderer.invoke('update:install'),copyInvite:code=>ipcRenderer.invoke('meet:copy-invite',code),windowAction:action=>ipcRenderer.invoke('meet:window',action),onWindowState:callback=>{const handler=(_event,state)=>callback(state);ipcRenderer.on('meet:window-state',handler);return()=>ipcRenderer.removeListener('meet:window-state',handler);}});
ipcRenderer.on('meet:action',(_event,id)=>{
  if (location.origin !== 'https://kpnc-meet.pages.dev' || !['mic','camera','chat-toggle'].includes(id)) return;
  const meeting = document.getElementById('meeting');
  if (meeting && !meeting.classList.contains('hidden')) document.getElementById(id)?.click();
});
