'use strict';
// Run only inside the authenticated build job, after tests and packaging.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const platform=process.argv[2],repo='ainnchris/kpnc-telas',token=process.env.GH_TOKEN;
if(!['windows','android'].includes(platform)||!token||process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=='refs/heads/feat/meet-multiplataforma')throw new Error('Release context rejected');
const version=platform==='windows'?require('../apps/desktop/package.json').version:require('../apps/mobile/app.json').expo.version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid version');
const file=platform==='windows'?path.resolve('apps/desktop/dist/Kpnc Meet Setup '+version+'.exe'):path.resolve('apps/mobile/android/app/build/outputs/apk/release/app-release.apk');
const name=platform==='windows'?'Kpnc-Meet-Setup-'+version+'.exe':'Kpnc-Meet-'+version+'.apk',tag=platform+'-'+version;
const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
async function api(endpoint,method='GET',body){const response=await fetch('https://api.github.com/repos/'+repo+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok){const e=new Error('GitHub '+response.status);e.status=response.status;throw e}return data;}
(async()=>{
 const bytes=await fs.promises.readFile(file),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 let release;try{release=await api('/releases/tags/'+tag)}catch(e){if(e.status!==404)throw e;release=await api('/releases','POST',{tag_name:tag,target_commitish:process.env.GITHUB_SHA,name:'Kpnc Meet '+version+' — '+platform,prerelease:true,body:'Versão experimental. Atualizações só devem ser aplicadas fora de reuniões. Windows sem certificado de editor; Android com assinatura de desenvolvimento.'});}
 let asset=release.assets.find(a=>a.name===name);
 if(asset){if(asset.digest!=='sha256:'+sha256)throw new Error('Release asset already exists with different content; bump version');}
 else{
   const url=new URL(release.upload_url.split('{')[0]);if(url.hostname!=='uploads.github.com')throw new Error('Unexpected upload host');url.searchParams.set('name',name);
   const response=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(bytes.length)},body:bytes});
   if(!response.ok)throw new Error('Upload failed: '+response.status);asset=await response.json();
 }
 for(let attempt=0;attempt<4;attempt++){
   const current=await api('/contents/public/updates.json?ref=main'),manifest=JSON.parse(Buffer.from(current.content,'base64').toString('utf8'));
   manifest[platform]={version,url:asset.browser_download_url,sha256};
   try{await api('/contents/public/updates.json','PUT',{branch:'main',sha:current.sha,message:'release: announce '+platform+' '+version,content:Buffer.from(JSON.stringify(manifest)+'\n').toString('base64')});break}
   catch(e){if(e.status!==409||attempt===3)throw e}
 }
 console.log('Published '+platform+' '+version+' with verified SHA256 '+sha256);
})().catch(e=>{console.error(e.message);process.exitCode=1});
