const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   navigator.mediaDevices.getUserMedia=async constraints=>{
    const stream=new MediaStream();
    if(constraints.video){const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;stream.addTrack(canvas.captureStream(5).getVideoTracks()[0])}
    if(constraints.audio){const context=new AudioContext(),destination=context.createMediaStreamDestination();stream.addTrack(destination.stream.getAudioTracks()[0])}
    return stream;
   };
  });
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({path:path.join(root,'apps/mobile/node_modules/livekit-client/dist/livekit-client.umd.js'),contentType:'text/javascript'});
   if(url.hostname==='kpnc-meet-api.erikchristian2.workers.dev'&&url.pathname==='/health')return route.fulfill({json:{ok:true}});
   if(url.hostname!=='kpnc-meet.pages.dev')return route.abort();
   if(url.pathname==='/updates.json')return route.fulfill({json:{web:'test'}});
   const relative=url.pathname==='/'?'index.html':url.pathname.slice(1),file=path.resolve(root,'public',relative);
   if(!file.startsWith(path.resolve(root,'public')+path.sep))return route.abort();
   return route.fulfill({path:file,contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':undefined});
  });
  await page.goto('https://kpnc-meet.pages.dev');await page.locator('#new-meeting').click();
  await page.locator('[data-check=network][data-status=good]').waitFor();
  await page.locator('[data-check=camera][data-status=good]').waitFor();
  await page.locator('[data-check=microphone][data-status=good]').waitFor();
  assert.match(await page.locator('[data-check=network] small').textContent(),/Boa resposta/);
  assert.equal(await page.evaluate(()=>window.MeetPrejoin.friendlyError(new DOMException('Permission denied','NotAllowedError'))),'O acesso foi bloqueado. Autorize nas permissões do navegador e tente novamente.');
  await page.locator('#prejoin-retest').click();await page.locator('[data-check=network][data-status=good]').waitFor();
  assert.deepEqual(errors,[]);console.log('PASS: prejoin camera, microphone, connection and friendly errors');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
