'use strict';
// CI-only integration check, never called by packaged builds. Captures the disposable CI desktop.
module.exports=async({main,BrowserWindow,clipboard})=>{
 const assert=require('node:assert/strict');
 await main.webContents.executeJavaScript("window.meetDesktop.copyInvite('test-ci-123')");
 assert.equal(await clipboard.readText(),'https://kpnc-meet.pages.dev/?room=test-ci-123');await clipboard.clear();
 const promise=main.webContents.executeJavaScript(`navigator.mediaDevices.getDisplayMedia({video:true,audio:true}).then(stream=>{const result={video:stream.getVideoTracks().map(t=>({state:t.readyState,display:t.getSettings().displaySurface})),audio:stream.getAudioTracks().length};stream.getTracks().forEach(t=>t.stop());return result}).catch(e=>({error:e.name,message:e.message}))`,true);
 let selected=false;
 const timer=setInterval(async()=>{const picker=BrowserWindow.getAllWindows().find(w=>/picker\.html$/.test(w.webContents.getURL()));if(!picker||selected)return;try{const ready=await picker.webContents.executeJavaScript("!!document.querySelector('#sources button')");if(ready){selected=true;await picker.webContents.executeJavaScript("document.querySelector('#sources button').click()");}}catch{}},250);
 try{const result=await Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Capture timed out')),25000))]);console.info('MEET_MEDIA_SMOKE',JSON.stringify({selected,...result}));assert.equal(selected,true,'Source picker must open');assert.equal(result.video?.[0]?.state,'live','Display video must be live after source selection');}finally{clearInterval(timer);}
};
