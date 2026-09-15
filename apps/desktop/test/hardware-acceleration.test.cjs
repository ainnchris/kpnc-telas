const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {applyHardwareAcceleration,readPreference,setupHardwareAcceleration}=require('../hardware-acceleration.cjs');
test('hardware acceleration defaults on, persists safely and rejects untrusted frames',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kpnc-hardware-')),app={getPath:()=>directory,disableHardwareAcceleration:()=>{app.disabled=true}};
 assert.equal(readPreference(app),true);assert.equal(applyHardwareAcceleration(app),true);assert.equal(app.disabled,undefined);
 const handlers={},wc={mainFrame:{},getURL:()=>'https://kpnc-meet.pages.dev/'},win={webContents:wc,isDestroyed:()=>false};
 setupHardwareAcceleration({app,ipcMain:{handle:(name,fn)=>handlers[name]=fn},getMain:()=>win,enabledAtStartup:true});
 const event={sender:wc,senderFrame:wc.mainFrame};assert.deepEqual(await handlers['hardware:set'](event,false),{enabled:false,restartRequired:true});assert.equal(await handlers['hardware:get'](event),false);
 await assert.rejects(()=>handlers['hardware:set']({...event,senderFrame:{}},true),/Forbidden/);await assert.rejects(()=>handlers['hardware:set'](event,'false'),/Invalid/);
});
