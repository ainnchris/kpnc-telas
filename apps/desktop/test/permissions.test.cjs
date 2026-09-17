const test=require('node:test'),assert=require('node:assert/strict');
const {checkPermission}=require('../permissions.cjs');
const {setupPermissions}=require('../permissions.cjs');
test('display-media request reaches explicit picker without granting camera or microphone',()=>{
 let request,check;const wc={getURL:()=> 'https://kpnc-meet.pages.dev/'},main={webContents:wc,isDestroyed:()=>false};
 setupPermissions({ses:{setPermissionCheckHandler:fn=>check=fn,setPermissionRequestHandler:fn=>request=fn},getMain:()=>main,ipcMain:{handle:()=>{},on:()=>{}},path:require('node:path')});
 let allowed;const details={requestingUrl:'https://kpnc-meet.pages.dev/',isMainFrame:true,mediaTypes:[]};
 request(wc,'media',value=>allowed=value,details);assert.equal(allowed,true);
 assert.equal(check(wc,'media',details.requestingUrl,{isMainFrame:true,mediaType:'audio'}),false);
 assert.equal(check(wc,'media',details.requestingUrl,{isMainFrame:true,mediaType:'video'}),false);
 request(wc,'media',value=>allowed=value,{...details,isMainFrame:false});assert.equal(allowed,false);
 request(wc,'media',value=>allowed=value,{...details,requestingUrl:'https://evil.test'});assert.equal(allowed,false);
 request(wc,'media',value=>allowed=value,{...details,mediaTypes:['unknown']});assert.equal(allowed,false);
});
test('capture and output selection reach their device picker; media still needs consent',()=>{
 const grants=new Set();
 assert.equal(checkPermission('display-capture',{},grants),true);
 assert.equal(checkPermission('speaker-selection',{},grants),true);
 assert.equal(checkPermission('media',{mediaType:'audio'},grants),false);
 grants.add('audio');
 assert.equal(checkPermission('media',{mediaType:'audio'},grants),true);
 assert.equal(checkPermission('media',{mediaType:'video'},grants),false);
 assert.equal(checkPermission('media',{mediaType:'unknown'},grants),false);
 grants.add('video');
 assert.equal(checkPermission('media',{mediaType:'unknown'},grants),true);
 assert.equal(checkPermission('usb',{},grants),false);
});
