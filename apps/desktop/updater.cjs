'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {SITE,isMeetURL}=require('./policy.cjs');
function validUpdate(update,current){
 if(!update||!/^\d+\.\d+\.\d+$/.test(update.version)||!/^[a-f0-9]{64}$/.test(update.sha256))return false;
 const a=update.version.split('.').map(Number),b=current.split('.').map(Number);let newer=false;
 for(let i=0;i<3;i++){if(a[i]!==b[i]){newer=a[i]>b[i];break;}}if(!newer)return false;
 try{const url=new URL(update.url);return url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith('/ainnchris/kpnc-telas/releases/download/')&&url.pathname.endsWith('.exe')}catch{return false}
}
function setupUpdater({app,ipcMain,getMain,shell}){
 let selected,ready,downloading;
 function trusted(event){const main=getMain();if(!main||event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||!isMeetURL(main.webContents.getURL()))throw new Error('Forbidden');}
 async function busy(){const main=getMain();if(!main||main.isDestroyed())return true;try{return await main.webContents.executeJavaScript("['preview','waiting','meeting'].some(id=>{const n=document.getElementById(id);return !n||!n.classList.contains('hidden')})")}catch{return true}}
 ipcMain.handle('update:check',async event=>{trusted(event);const response=await fetch(SITE+'/updates.json',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Servidor indisponível');const data=await response.json();selected=validUpdate(data.windows,app.getVersion())?data.windows:null;return {available:!!selected,version:selected?.version};});
 ipcMain.handle('update:download',async event=>{
   trusted(event);if(downloading)return downloading;if(!selected)throw new Error('Nenhuma atualização disponível');
   const update={...selected};
   downloading=(async()=>{
     const directory=path.join(app.getPath('userData'),'updates');await fs.promises.mkdir(directory,{recursive:true});
     const file=path.join(directory,'Kpnc-Meet-'+update.version+'.exe'),temporary=file+'.partial';
     const response=await fetch(update.url,{signal:AbortSignal.timeout(180000)});if(!response.ok||!response.body)throw new Error('Falha no download');
     let bytes=0;const hash=crypto.createHash('sha256'),limit=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>350*1024*1024)return callback(new Error('Arquivo excede o limite'));hash.update(chunk);callback(null,chunk);}});
     await pipeline(Readable.fromWeb(response.body),limit,fs.createWriteStream(temporary,{flags:'w'}));
     if(hash.digest('hex')!==update.sha256)throw new Error('Integridade inválida; instalação bloqueada');
     await fs.promises.rename(temporary,file);ready={file,sha256:update.sha256};return {ready:true};
   })();try{return await downloading}finally{downloading=null}
 });
 ipcMain.handle('update:install',async event=>{
   trusted(event);if(!ready||await busy())throw new Error('Saia da reunião antes de atualizar');
   const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(ready.file))hash.update(chunk);if(hash.digest('hex')!==ready.sha256)throw new Error('Integridade inválida');
   const locked=await getMain().webContents.executeJavaScript("(()=>{if(['preview','waiting','meeting'].some(id=>!document.getElementById(id)?.classList.contains('hidden')))return false;document.body.inert=true;return true})()");
   if(!locked)throw new Error('Há uma reunião ativa');
   const error=await shell.openPath(ready.file);if(error){await getMain().webContents.executeJavaScript('document.body.inert=false');throw new Error(error);}app.quit();return true;
 });
}
module.exports={setupUpdater,validUpdate};
