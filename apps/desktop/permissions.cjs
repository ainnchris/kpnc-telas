'use strict';
const {isMeetURL}=require('./policy.cjs');
function checkPermission(permission,details,grants){
  if(['fullscreen','display-capture','speaker-selection'].includes(permission))return true;
  if(permission!=='media')return false;
  return details.mediaType==='unknown'?(grants.has('audio')&&grants.has('video')):grants.has(details.mediaType);
}
function setupPermissions({ses,getMain,BrowserWindow,ipcMain,path}){
  const grants=new Set();let active=null;
  const trusted=(wc,url,details)=>!!getMain()&&!getMain().isDestroyed()&&wc===getMain().webContents&&isMeetURL(url)&&details.isMainFrame!==false;
  function finish(allow=false){
    const current=active;if(!current)return;active=null;clearTimeout(current.timer);
    const permitted=allow&&!current.wc.isDestroyed()&&trusted(current.wc,current.wc.getURL(),current.details);
    if(permitted)current.types.forEach(type=>grants.add(type));
    if(!current.window.isDestroyed())current.window.close();
    current.callback(permitted);
  }
  ipcMain.handle('permission:details',event=>{
    if(!active||event.sender!==active.window.webContents||event.senderFrame!==active.window.webContents.mainFrame)throw new Error('Forbidden');
    return active.types;
  });
  ipcMain.on('permission:answer',(event,allow)=>{
    if(active&&event.sender===active.window.webContents&&event.senderFrame===active.window.webContents.mainFrame)finish(allow===true);
  });
  ses.setPermissionCheckHandler((wc,p,url,d)=>{const allowed=trusted(wc,url,d)&&checkPermission(p,d,grants);console.info('MEET_PERMISSION_CHECK',JSON.stringify({permission:p,mediaType:d.mediaType,mainFrame:d.isMainFrame,allowed}));return allowed;});
  ses.setPermissionRequestHandler((wc,p,callback,d)=>{
    console.info('MEET_PERMISSION_REQUEST',JSON.stringify({permission:p,mediaTypes:d.mediaTypes,mainFrame:d.isMainFrame,trusted:trusted(wc,d.requestingUrl,d)}));
    if(!trusted(wc,d.requestingUrl,d))return callback(false);
    if(['fullscreen','display-capture','speaker-selection'].includes(p))return callback(true);
    const types=d.mediaTypes||[];
    // Electron 44 reports getDisplayMedia as media with an empty mediaTypes list.
    // Allow it to reach setDisplayMediaRequestHandler and its explicit source picker.
    // This does not grant microphone/camera permission or select a capture source.
    if(p==='media'&&Array.isArray(d.mediaTypes)&&types.length===0)return callback(true);
    if(p!=='media'||!types.length||types.some(t=>!['audio','video'].includes(t)))return callback(false);
    if(types.every(t=>grants.has(t)))return callback(true);
    if(active)return callback(false);
    const window=new BrowserWindow({parent:getMain(),modal:true,width:480,height:365,resizable:false,title:'Kpnc Meet — Dispositivos',backgroundColor:'#101722',icon:path.join(__dirname,'assets/icon.ico'),webPreferences:{preload:path.join(__dirname,'permission-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    window.setMenu(null);active={window,wc,types,details:d,callback,timer:setTimeout(()=>finish(),60000)};
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());
    window.on('closed',()=>finish());void window.loadFile(path.join(__dirname,'permission.html')).catch(()=>finish());
  });
  return {cancel:()=>finish()};
}
module.exports={setupPermissions,checkPermission};
