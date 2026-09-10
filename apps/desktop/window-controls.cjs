'use strict';
const {SITE,isMeetURL}=require('./policy.cjs');
function inviteURL(code){return typeof code==='string'&&/^[a-z0-9-]{6,64}$/.test(code)?`${SITE}/?room=${encodeURIComponent(code)}`:null;}
function externalURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&value.length<=4096?u.href:null;}catch{return null;}}
function setupWindowControls({ipcMain,getMain,clipboard}){
  function windowFor(event){const win=getMain();if(!win||win.isDestroyed()||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||!isMeetURL(win.webContents.getURL()))throw new Error('Forbidden');return win;}
  ipcMain.handle('meet:copy-invite',(event,code)=>{windowFor(event);const url=inviteURL(code);if(!url)throw new Error('Convite inválido.');clipboard.writeText(url);return true;});
  ipcMain.handle('meet:window',(event,action)=>{const win=windowFor(event);if(action==='minimize')win.minimize();else if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(action==='close')win.close();else if(action!=='state')throw new Error('Invalid action');return win.isDestroyed()?{}:{maximized:win.isMaximized(),fullscreen:win.isFullScreen()};});
}
module.exports={setupWindowControls,inviteURL,externalURL};
