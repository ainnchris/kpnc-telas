'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {spawn}=require('node:child_process');
const {SITE,isMeetURL}=require('./policy.cjs');
const MAX_UPDATE_BYTES=350*1024*1024;

function validUpdate(update,current){
 if(!update||!/^\d+\.\d+\.\d+$/.test(update.version)||!/^[a-f0-9]{64}$/.test(update.sha256))return false;
 const a=update.version.split('.').map(Number),b=current.split('.').map(Number);let newer=false;
 for(let i=0;i<3;i++){if(a[i]!==b[i]){newer=a[i]>b[i];break;}}if(!newer)return false;
 try{const url=new URL(update.url);return url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.startsWith('/ainnchris/kpnc-telas/releases/download/')&&url.pathname.endsWith('.exe')}catch{return false}
}
function launchSilentInstaller(file,spawnProcess=spawn){return new Promise((resolve,reject)=>{const child=spawnProcess(file,['/S','--force-run'],{detached:true,stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve()})})}
async function fileDigest(file,maxBytes=MAX_UPDATE_BYTES){
 const hash=crypto.createHash('sha256');let bytes=0;
 for await(const chunk of fs.createReadStream(file)){bytes+=chunk.length;if(bytes>maxBytes)throw new Error('Arquivo excede o limite de segurança.');hash.update(chunk)}
 return{bytes,sha256:hash.digest('hex')};
}
function rangeTotal(response,offset){
 if(response.status!==206)return Number(response.headers.get('content-length'))||0;
 const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
 if(!match||Number(match[1])!==offset||Number(match[3])<Number(match[2])+1)throw new Error('O servidor não confirmou a retomada do download.');
 return Number(match[3]);
}
async function downloadVerifiedUpdate({update,directory,fetchImpl=fetch,onProgress=()=>{},maxBytes=MAX_UPDATE_BYTES}){
 await fs.promises.mkdir(directory,{recursive:true});
 const file=path.join(directory,`Kpnc-Meet-${update.version}.exe`),temporary=file+'.partial';
 try{
   const cached=await fileDigest(file,maxBytes);
   if(cached.sha256===update.sha256){onProgress({phase:'ready',received:cached.bytes,total:cached.bytes,percent:100,resumed:false});return{file,sha256:update.sha256,bytes:cached.bytes,cached:true,resumed:false}}
   await fs.promises.unlink(file);
 }catch(error){if(error?.code!=='ENOENT')await fs.promises.unlink(file).catch(()=>{})}
 let offset=0;
 try{offset=(await fs.promises.stat(temporary)).size;if(offset>maxBytes){await fs.promises.unlink(temporary);offset=0}}catch(error){if(error?.code!=='ENOENT')throw error}
 onProgress({phase:'connecting',received:offset,total:0,percent:null,resumed:offset>0});
 const request=async resumeOffset=>{try{return await fetchImpl(update.url,{headers:resumeOffset?{Range:`bytes=${resumeOffset}-`}:{},signal:AbortSignal.timeout(180000)})}catch(error){onProgress({phase:'paused',received:resumeOffset,total:0,percent:null,resumed:resumeOffset>0});throw new Error('Não foi possível acessar o servidor. Clique em “Tentar novamente” para continuar.',{cause:error})}};
 let response=await request(offset);
 if(offset&&response.status===200){await fs.promises.unlink(temporary).catch(()=>{});offset=0}
 else if(offset&&response.status===416){const partial=await fileDigest(temporary,maxBytes);if(partial.sha256===update.sha256){await fs.promises.rename(temporary,file);onProgress({phase:'ready',received:partial.bytes,total:partial.bytes,percent:100,resumed:true});return{file,sha256:update.sha256,bytes:partial.bytes,cached:false,resumed:true}}await fs.promises.unlink(temporary).catch(()=>{});offset=0;response=await request(0)}
 if(!response.ok||!response.body)throw new Error('O servidor não iniciou o download. Tente novamente.');
 const total=rangeTotal(response,offset),contentLength=Number(response.headers.get('content-length'))||0;
 if(total>maxBytes||(!total&&offset+contentLength>maxBytes))throw new Error('Arquivo excede o limite de segurança.');
 const hash=crypto.createHash('sha256');
 if(offset)for await(const chunk of fs.createReadStream(temporary))hash.update(chunk);
 let bytes=offset,lastProgress=0;
 const progress=()=>{const percent=total?Math.min(99,Math.floor(bytes/total*100)):null;onProgress({phase:'downloading',received:bytes,total,percent,resumed:offset>0})};
 progress();
 const limit=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>maxBytes)return callback(new Error('Arquivo excede o limite de segurança.'));hash.update(chunk);if(Date.now()-lastProgress>250){lastProgress=Date.now();progress()}callback(null,chunk)}});
 try{await pipeline(Readable.fromWeb(response.body),limit,fs.createWriteStream(temporary,{flags:offset?'a':'w',mode:0o600}))}catch(error){if(error instanceof Error&&error.message.includes('limite de segurança')){await fs.promises.unlink(temporary).catch(()=>{});throw error}onProgress({phase:'paused',received:bytes,total,percent:total?Math.min(99,Math.floor(bytes/total*100)):null,resumed:offset>0});throw new Error('Download interrompido. Clique em “Tentar novamente” para continuar.',{cause:error})}
 if(total&&bytes!==total){if(bytes>total)await fs.promises.unlink(temporary).catch(()=>{});else onProgress({phase:'paused',received:bytes,total,percent:Math.floor(bytes/total*100),resumed:offset>0});throw new Error(bytes<total?'Download interrompido. Clique em “Tentar novamente” para continuar.':'O servidor enviou um arquivo maior que o informado.')}
 onProgress({phase:'verifying',received:bytes,total:total||bytes,percent:99,resumed:offset>0});
 if(hash.digest('hex')!==update.sha256){await fs.promises.unlink(temporary).catch(()=>{});throw new Error('A verificação de integridade falhou. O arquivo incompleto foi descartado.')}
 await fs.promises.rename(temporary,file);
 onProgress({phase:'ready',received:bytes,total:total||bytes,percent:100,resumed:offset>0});
 return{file,sha256:update.sha256,bytes,cached:false,resumed:offset>0};
}
function setupUpdater({app,ipcMain,getMain}){
 let selected,ready,downloading;
 function trusted(event){const main=getMain();if(!main||event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||!isMeetURL(main.webContents.getURL()))throw new Error('Forbidden')}
 function report(progress){const main=getMain();if(main&&!main.isDestroyed()&&isMeetURL(main.webContents.getURL()))main.webContents.send('update:progress',progress)}
 async function busy(){const main=getMain();if(!main||main.isDestroyed())return true;try{return await main.webContents.executeJavaScript("['preview','waiting','meeting'].some(id=>{const n=document.getElementById(id);return !n||!n.classList.contains('hidden')})")}catch{return true}}
 ipcMain.handle('update:check',async event=>{trusted(event);const response=await fetch(SITE+'/updates.json',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Servidor indisponível');const data=await response.json(),next=validUpdate(data.windows,app.getVersion())?data.windows:null;if(!selected||selected.version!==next?.version||selected.sha256!==next?.sha256)ready=null;selected=next;return{available:!!selected,version:selected?.version}});
 ipcMain.handle('update:download',async event=>{
   trusted(event);if(downloading)return downloading;if(!selected)throw new Error('Nenhuma atualização disponível');
   const update={...selected};
   downloading=downloadVerifiedUpdate({update,directory:path.join(app.getPath('userData'),'updates'),onProgress:report}).then(result=>{ready={file:result.file,sha256:result.sha256};return{ready:true,resumed:result.resumed,cached:result.cached}});
   try{return await downloading}finally{downloading=null}
 });
 ipcMain.handle('update:install',async event=>{
   trusted(event);if(!ready)throw new Error('Baixe e verifique a atualização antes de instalar');if(await busy())throw new Error('Saia da reunião antes de atualizar');
   const verified=await fileDigest(ready.file);if(verified.sha256!==ready.sha256){ready=null;throw new Error('A integridade do instalador mudou. Baixe a atualização novamente.')}
   const locked=await getMain().webContents.executeJavaScript("(()=>{if(['preview','waiting','meeting'].some(id=>!document.getElementById(id)?.classList.contains('hidden')))return false;document.body.inert=true;return true})()");
   if(!locked)throw new Error('Há uma reunião ativa');
   try{await launchSilentInstaller(ready.file)}catch(error){await getMain().webContents.executeJavaScript('document.body.inert=false');throw new Error('Não foi possível abrir o instalador. Tente novamente.',{cause:error})}app.quit();return true;
 });
}
module.exports={MAX_UPDATE_BYTES,setupUpdater,validUpdate,launchSilentInstaller,fileDigest,rangeTotal,downloadVerifiedUpdate};
