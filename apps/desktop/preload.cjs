'use strict';
const {ipcRenderer,contextBridge} = require('electron');
const trustedOrigins=new Set(['https://kpnc-meet.pages.dev','https://feat-meet-next.kpnc-meet.pages.dev']);
if(trustedOrigins.has(location.origin))contextBridge.exposeInMainWorld('meetDesktop',{silentUpdates:true,onUpdateProgress:callback=>{const handler=(_event,progress)=>callback(progress);ipcRenderer.on('update:progress',handler);return()=>ipcRenderer.removeListener('update:progress',handler);},checkUpdate:()=>ipcRenderer.invoke('update:check'),downloadUpdate:()=>ipcRenderer.invoke('update:download'),installUpdate:()=>ipcRenderer.invoke('update:install'),getHardwareAcceleration:()=>ipcRenderer.invoke('hardware:get'),setHardwareAcceleration:enabled=>ipcRenderer.invoke('hardware:set',enabled),copyInvite:code=>ipcRenderer.invoke('meet:copy-invite',code),windowAction:action=>ipcRenderer.invoke('meet:window',action),onWindowState:callback=>{const handler=(_event,state)=>callback(state);ipcRenderer.on('meet:window-state',handler);return()=>ipcRenderer.removeListener('meet:window-state',handler);}});
ipcRenderer.on('meet:action',(_event,id)=>{
  if (!trustedOrigins.has(location.origin) || !['mic','camera','chat-toggle'].includes(id)) return;
  const meeting = document.getElementById('meeting');
  if (meeting && !meeting.classList.contains('hidden')) document.getElementById(id)?.click();
});
