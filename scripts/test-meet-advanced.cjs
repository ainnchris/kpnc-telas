const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
 try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({path:path.join(root,'apps/mobile/node_modules/livekit-client/dist/livekit-client.umd.js'),contentType:'text/javascript'});
   if(url.hostname!=='kpnc-meet.pages.dev')return route.abort();
   if(url.pathname==='/updates.json')return route.fulfill({json:{web:'test-new-version',windows:null,android:null}});
   const relative=url.pathname==='/'?'index.html':url.pathname.slice(1),file=path.resolve(root,'public',relative);if(!file.startsWith(path.resolve(root,'public')+path.sep))return route.abort();
   if(relative==='js/app.js')return route.fulfill({body:fs.readFileSync(file,'utf8').replace(/\}\)\(\);\s*$/,'window.testHooks={state};})();'),contentType:'text/javascript'});
   return route.fulfill({path:file,contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':undefined});
 });
 await page.goto('https://kpnc-meet.pages.dev');
 await page.locator('.update-notice').waitFor({state:'visible'});
 await page.evaluate(()=>{document.querySelector('#home').classList.add('hidden');document.querySelector('#meeting').classList.remove('hidden')});
 await page.locator('.update-notice').waitFor({state:'hidden'});
 await page.locator('#more-toggle').click();
 const theme=page.locator('#more-menu select');const backgrounds=[];
 for(const name of ['light','dark','gray','black']){
   await theme.selectOption(name);assert.equal(await page.evaluate(()=>localStorage.getItem('kpnc-theme')),name);
   backgrounds.push(await page.locator('#meeting').evaluate(n=>getComputedStyle(n).backgroundColor));
 }
 assert.equal(new Set(backgrounds).size,4);assert.equal(backgrounds[3],'rgb(0, 0, 0)');
 await page.evaluate(()=>{
   const p={identity:'host-test',name:'Teste',metadata:'{}',trackPublications:new Map(),getTrackPublication:()=>null,setMetadata:async text=>{p.metadata=text;window.metadataUpdates=(window.metadataUpdates||0)+1},setName:async name=>{p.name=name}};
   window.testHooks.state.room={localParticipant:p,remoteParticipants:new Map()};
 });
 await page.getByRole('button',{name:'Editar meu perfil'}).click();
 await page.locator('#profile-name').fill('Teste de perfil');
 await page.locator('#profile-file').setInputFiles({name:'profile.gif',mimeType:'image/gif',buffer:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
 await page.locator('#profile-preview img').waitFor();
 await page.locator('#profile-rotate').click();
 await page.locator('#profile-save').click();
 await page.locator('#profile-dialog').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>window.metadataUpdates),1);
 assert(await page.evaluate(()=>localStorage.getItem('kpnc-profile-photo').startsWith('data:image/gif')));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kpnc-profile-transform')).rotation),90);
 assert.equal(await page.locator('#grid .avatar img').count(),1);
 assert(await page.locator('.update-notice').isHidden());
 await page.evaluate(()=>{window.testHooks.state.room=null;document.querySelector('#meeting').classList.add('hidden');document.querySelector('#home').classList.remove('hidden')});
 await page.locator('.update-notice').waitFor({state:'visible'});
 await page.locator('#later-update').click();assert(await page.locator('.update-notice').isHidden());
 await page.reload();assert.equal(await page.evaluate(()=>document.body.dataset.theme),'black');
 assert.deepEqual(errors,[]);
 console.log('PASS: four distinct meeting themes, persisted selection, GIF crop/rotation/save during meeting, metadata sync, update deferred until home');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
