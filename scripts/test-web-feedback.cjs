const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
(async()=>{
 fs.mkdirSync(path.join(root,'work'),{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(!process.env.KPNC_TEST_LIVE)await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({path:path.join(root,'apps/mobile/node_modules/livekit-client/dist/livekit-client.umd.js'),contentType:'text/javascript'});
   if(url.hostname!=='kpnc-meet.pages.dev')return route.abort();
   const relative=url.pathname==='/'?'index.html':url.pathname.slice(1),file=path.resolve(root,'public',relative);
   if(!file.startsWith(path.resolve(root,'public')+path.sep))return route.abort();
   return route.fulfill({path:file,contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':undefined});
 });
 await page.goto('https://kpnc-meet.pages.dev');
 assert.equal(await page.title(),'Kpnc Meet — Reuniões simples, do seu jeito');
 assert(await page.locator('#new-meeting').isVisible());
 // Exercise the real handlers without creating a meeting or opening hardware.
 await page.evaluate(()=>{
   document.querySelector('#home').classList.add('hidden');document.querySelector('#meeting').classList.remove('hidden');
   window.testMedia=[];window.testStops=0;
   navigator.mediaDevices.enumerateDevices=async()=>[{kind:'audioinput',deviceId:'default',label:'Padrão - Microfone USB'},{kind:'audioinput',deviceId:'usb',label:'Microfone USB'},{kind:'audiooutput',deviceId:'default',label:'Padrão - Fones'},{kind:'audiooutput',deviceId:'headset',label:'Fones USB'}];
   navigator.mediaDevices.getUserMedia=async constraints=>{window.testMedia.push(constraints);return {getTracks:()=>[{stop:()=>window.testStops++}]}};
 });
 await page.locator('#more-toggle').click();await page.locator('#devices').click();
 assert.equal(await page.locator('#audio-input').inputValue(),'default');
 assert.match(await page.locator('#audio-input').innerText(),/Microfone USB/);
 await page.locator('#audio-output').selectOption('headset');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kpnc-devices')).output),'headset');
 await page.locator('#identify-devices').click();
 assert.deepEqual(await page.evaluate(()=>window.testMedia),[{audio:true,video:false}]);
 assert.equal(await page.evaluate(()=>window.testStops),1);
 await page.locator('#devices-dialog button[value=ok]').click();
 await page.evaluate(()=>window.MeetSounds.play('request'));
 await page.locator('#sounds-toggle').click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('kpnc-sounds')),'off');
 await page.evaluate(()=>{const t=document.querySelector('#toast');t.textContent='Ligue a câmera primeiro.';t.classList.add('show')});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='1');
 const size=await page.locator('#toast').boundingBox();assert(size.width<300&&size.height<60);
 await page.screenshot({path:path.join(root,'work','feedback-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 assert((await page.locator('#toast').boundingBox()).width<=358);
 await page.screenshot({path:path.join(root,'work','feedback-mobile.png')});
 assert.deepEqual(errors,[]);
 console.log('PASS: home, device defaults/selection, permission audio-only, track cleanup, sound preference, compact toast desktop/mobile, no page errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
