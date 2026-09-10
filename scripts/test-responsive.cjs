const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({path:path.join(root,'apps/mobile/node_modules/livekit-client/dist/livekit-client.umd.js'),contentType:'text/javascript'});
   if(u.hostname!=='kpnc-meet.pages.dev')return route.abort();
   if(u.pathname==='/updates.json')return route.fulfill({json:{web:'2026-09-10.4'}});
   const name=u.pathname==='/'?'index.html':u.pathname.slice(1),file=path.resolve(root,'public',name);
   if(!file.startsWith(path.resolve(root,'public')+path.sep))return route.abort();
   return route.fulfill({path:file,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':undefined});
  });
  for(const [width,height] of [[320,640],[390,844],[768,1024],[844,390],[1024,768],[1440,900]]){
   await page.setViewportSize({width,height});await page.goto('https://kpnc-meet.pages.dev');
   await page.locator('body[data-theme]').waitFor();
   await page.locator('#room-code').fill('abc-def-123');
   await page.locator('#room-code').scrollIntoViewIfNeeded();
   assert(await page.locator('#room-code').isVisible());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`home overflow ${width}`);
   await page.locator('#profile-open').click();await page.locator('.avatar-presets summary').click();
   await page.locator('#avatar-presets button').nth(2).click();await page.locator('#profile-name').fill('Teste responsivo');await page.locator('#profile-save').click();
   await page.locator('#profile-dialog').waitFor({state:'hidden'});
   await page.evaluate(()=>{document.querySelector('#home').classList.add('hidden');document.querySelector('#meeting').classList.remove('hidden');});
   for(const selector of ['#mic','#camera','#screen','#hand','#leave','#chat-toggle','#participants-toggle','#more-toggle']){
    const box=await page.locator(selector).boundingBox();
    assert(box&&box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1,`${selector} outside ${width}x${height}: ${JSON.stringify(box)}`);
    await page.locator(selector).click({trial:true});
   }
   await page.locator('#more-toggle').click();
   for(const theme of ['light','dark','gray','black']){
    await page.locator('#more-menu .theme-picker select').selectOption(theme);
    assert.equal(await page.locator('body').getAttribute('data-theme'),theme);
   }
   await page.locator('#more-toggle').click();await page.locator('#chat-toggle').click();
   await page.locator('#chat-input').fill('Olá 😀');
   if(width===390){
    await page.setViewportSize({width,height:450});await page.locator('#chat-input').focus();
    await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--viewport-height')==='450px');
    const box=await page.locator('#chat-input').boundingBox();assert(box.y+box.height<=450,'chat under simulated keyboard');
   }
   await page.screenshot({path:path.join(root,'work',`responsive-${width}.png`)});
  }
  await page.addInitScript(()=>{window.installs=0;window.meetDesktop={silentUpdates:true,checkUpdate:async()=>({available:true,version:'0.4.0'}),downloadUpdate:()=>new Promise(resolve=>{window.finishDownload=resolve}),installUpdate:async()=>{window.installs++}}});
  await page.reload();await page.locator('#apply-update').click();
  await page.waitForFunction(()=>!!window.finishDownload);
  await page.evaluate(()=>{document.querySelector('#meeting').classList.remove('hidden');window.finishDownload();});
  await page.waitForFunction(()=>document.querySelector('#apply-update').textContent==='Instalar e reiniciar');
  assert.equal(await page.evaluate(()=>window.installs),0,'must defer installation in a meeting');
  await page.evaluate(()=>document.querySelector('#meeting').classList.add('hidden'));
  await page.waitForFunction(()=>window.installs===1);
  await page.evaluate(()=>document.body.classList.toggle('test-mutation'));assert.equal(await page.evaluate(()=>window.installs),1);
  await page.reload();await page.locator('#apply-update').click();await page.waitForFunction(()=>!!window.finishDownload);
  await page.locator('#later-update').click();await page.evaluate(()=>window.finishDownload());
  await page.waitForFunction(()=>document.querySelector('#apply-update').textContent==='Instalar e reiniciar');
  assert.equal(await page.evaluate(()=>window.installs),0,'Later cancels automatic installation');
  assert.deepEqual(errors,[]);console.log('PASS: six viewport sizes, avatar selection, four meeting themes, reachable controls, simulated keyboard and deferred automatic update');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
