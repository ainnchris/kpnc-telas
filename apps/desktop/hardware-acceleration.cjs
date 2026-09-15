'use strict';
const fs=require('node:fs'),path=require('node:path');
const {isMeetURL}=require('./policy.cjs');
function preferenceFile(app){return path.join(app.getPath('userData'),'hardware.json')}
function readPreference(app){try{const value=JSON.parse(fs.readFileSync(preferenceFile(app),'utf8'));return value.enabled!==false}catch{return true}}
function applyHardwareAcceleration(app){const enabled=readPreference(app);if(!enabled)app.disableHardwareAcceleration();return enabled}
function setupHardwareAcceleration({app,ipcMain,getMain,enabledAtStartup}){
 function trusted(event){const main=getMain();if(!main||main.isDestroyed()||event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||!isMeetURL(main.webContents.getURL()))throw new Error('Forbidden')}
 ipcMain.handle('hardware:get',event=>{trusted(event);return readPreference(app)});
 ipcMain.handle('hardware:set',async(event,enabled)=>{trusted(event);if(typeof enabled!=='boolean')throw new Error('Invalid preference');const file=preferenceFile(app);await fs.promises.mkdir(path.dirname(file),{recursive:true});const temporary=file+'.partial';await fs.promises.writeFile(temporary,JSON.stringify({enabled})+'\n',{mode:0o600});await fs.promises.rename(temporary,file);return{enabled,restartRequired:enabled!==enabledAtStartup}});
}
module.exports={applyHardwareAcceleration,readPreference,setupHardwareAcceleration};
