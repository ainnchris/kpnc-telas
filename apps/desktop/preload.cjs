'use strict';
const {ipcRenderer} = require('electron');
ipcRenderer.on('meet:action',(_event,id)=>{
  if (location.origin !== 'https://kpnc-meet.pages.dev' || !['mic','camera','chat-toggle'].includes(id)) return;
  const meeting = document.getElementById('meeting');
  if (meeting && !meeting.classList.contains('hidden')) document.getElementById(id)?.click();
});
