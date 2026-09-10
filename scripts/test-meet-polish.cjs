const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({path:path.join(root,'apps/mobile/node_modules/livekit-client/dist/livekit-client.umd.js'),contentType:'text/javascript'});
  if(url.hostname!=='kpnc-meet.pages.dev')return route.abort();
  if(url.pathname==='/updates.json')return route.fulfill({json:{web:'2026-09-10.2',windows:{url:'https://github.com/ainnchris/kpnc-telas/releases/download/windows-0.2.0/Kpnc-Meet-Setup-0.2.0.exe'},android:{url:'https://github.com/ainnchris/kpnc-telas/releases/download/android-0.2.0/Kpnc-Meet-0.2.0.apk'}}});
  const relative=url.pathname==='/'?'index.html':url.pathname.slice(1),file=path.resolve(root,'public',relative);if(!file.startsWith(path.resolve(root,'public')+path.sep))return route.abort();
  if(relative==='js/app.js')return route.fulfill({body:fs.readFileSync(file,'utf8').replace(/\}\)\(\);\s*$/,'window.testHooks={state,renderAll,onTrack,offTrack,message,leave,updateSpeakerHighlights};})();'),contentType:'text/javascript'});
  return route.fulfill({path:file,contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':undefined});
 });
 await page.goto('https://kpnc-meet.pages.dev');
 await page.locator('#download-card a').first().waitFor();assert.equal(await page.locator('#download-card a').count(),2);assert.equal(await page.locator('#clock').count(),0);assert.equal(await page.locator('#profile-open svg').count(),0);
 await page.locator('.top-actions .settings-open').click();await page.locator('#general-settings select').selectOption('dark');
 for(const width of [320,1280]){
  await page.setViewportSize({width,height:900});
  const geometry=await page.locator('#general-settings').evaluate(n=>{const box=s=>n.querySelector(s).getBoundingClientRect();const icon=box('svg'),select=box('select'),sound=box('#home-sounds-toggle');return {aligned:Math.abs(icon.y+icon.height/2-select.y-select.height/2)<2,height:sound.height,overflow:n.scrollWidth>n.clientWidth};});
  assert(geometry.aligned,'theme icon must sit beside select');assert.equal(geometry.height,48);assert.equal(geometry.overflow,false);
 }
 await page.screenshot({path:path.join(root,'work','settings-aligned.png')});
 assert.equal(await page.locator('#room-code').evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');
 await page.locator('#settings-dialog header button').click();await page.locator('#profile-open').click();
 await page.locator('.avatar-presets summary').click();assert.equal(await page.locator('#avatar-presets button').count(),16);await page.locator('#avatar-presets button').nth(3).click();await page.locator('#profile-name').fill('Teste anfitrião');
 await page.locator('#profile-zoom').fill('2');await page.locator('#profile-rotate').click();
 const stage=page.locator('.profile-crop-stage'),box=await stage.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+20);await page.mouse.up();
 assert.notEqual(await page.locator('#profile-preview img').evaluate(n=>n.style.left),'50%');
 await page.screenshot({path:path.join(root,'work','profile-editor-new.png')});await page.locator('#profile-save').click();await page.locator('#profile-dialog').waitFor({state:'hidden'});
 // Render while hidden, then reveal and resize: image must cover the avatar.
 await page.evaluate(()=>{const node=document.querySelector('#preview-avatar');window.MeetAvatar.render(node,'Test',localStorage.getItem('kpnc-profile-photo'),{});document.querySelector('#home').classList.add('hidden');document.querySelector('#preview').classList.remove('hidden');node.classList.add('show');});
 for(const width of [1280,390]){await page.setViewportSize({width,height:900});const sizes=await page.locator('#preview-avatar').evaluate(n=>({parent:n.getBoundingClientRect().width,image:n.querySelector('img').getBoundingClientRect().width,radius:getComputedStyle(n).borderRadius}));assert(Math.abs(sizes.parent-sizes.image)<2);assert.equal(sizes.radius,'50%');}
 await page.setViewportSize({width:1280,height:900});
 await page.evaluate(()=>{
  const h=window.testHooks,L=window.LivekitClient;document.querySelector('#preview').classList.add('hidden');document.querySelector('#meeting').classList.remove('hidden');
  function participant(identity,name,screen){const p={identity,name,metadata:'{}',trackPublications:new Map(),getTrackPublication:()=>null};if(screen)p.trackPublications.set('screen',{kind:L.Track.Kind.Video,source:L.Track.Source.ScreenShare,trackSid:identity+'video',track:{attach:()=>document.createElement('video')}});return p;}
  const me=participant('host-ci','Anfitrião',true),a=participant('guest-a','Apresentador A',true),b=participant('guest-b','Apresentador B',true);h.state.room={localParticipant:me,remoteParticipants:new Map([[a.identity,a],[b.identity,b]])};h.state.roomCode='abc-def-123';h.renderAll();
  window.volumeCalls=[];
  for(const p of [a,b])for(const source of [L.Track.Source.Microphone,L.Track.Source.ScreenShareAudio]){const track={kind:L.Track.Kind.Audio,sid:p.identity+source,attach:()=>{const a=document.createElement('audio');a.play=async()=>{};return a},setVolume:value=>window.volumeCalls.push({id:p.identity,source,value})};h.onTrack(track,{source},p);}
  h.state.speakers=new Set([me.identity]);h.updateSpeakerHighlights();window.originalTile=document.querySelector('#grid .tile');
 });
 assert.equal(await page.locator('.share-volume').count(),2);assert.equal(await page.locator('.host-badge').count(),1);
 assert.equal(await page.locator('.tile.speaking').evaluate(n=>getComputedStyle(n).borderTopColor),'rgb(50, 213, 131)');
 await page.locator('#more-toggle').click();await page.locator('#more-menu select').selectOption('light');
 await page.locator('#sounds-toggle').click();
 assert.equal(await page.locator('#sounds-toggle').innerText(),'Sons: desligados');
 assert(await page.locator('#sounds-toggle span').evaluate(n=>n.getBoundingClientRect().height<25));
 await page.evaluate(()=>{const tile=document.createElement('article');tile.className='tile';tile.id='test-avatar-tile';tile.innerHTML='<div class="avatar">T</div><span class="name">Teste</span>';document.querySelector('#grid').append(tile)});
 assert.equal(await page.locator('#test-avatar-tile').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
 assert.equal(await page.locator('#test-avatar-tile .name').evaluate(n=>getComputedStyle(n).color),'rgb(20, 32, 51)');
 await page.screenshot({path:path.join(root,'work','light-meeting-corrected.png')});
 await page.evaluate(()=>document.querySelector('#test-avatar-tile').remove());await page.locator('#more-toggle').click();
 await page.locator('[data-key^="guest-a:"] .share-volume input').fill('35');
 assert.deepEqual(await page.evaluate(()=>volumeCalls.at(-1)),{id:'guest-a',source:'screen_share_audio',value:.35});
 await page.locator('[data-key^="guest-a:"] .share-volume button').click();assert.equal(await page.evaluate(()=>volumeCalls.at(-1).value),0);
 assert(await page.evaluate(()=>volumeCalls.every(c=>c.source==='screen_share_audio')));
 await page.evaluate(()=>{window.testHooks.renderAll();});assert(await page.evaluate(()=>originalTile===document.querySelector('#grid .tile')));
 await page.locator('#chat-toggle').click();await page.locator('#emoji-toggle').click();await page.locator('#emoji-panel button').first().click();assert.equal(await page.locator('#chat-input').inputValue(),'😀');
 await page.evaluate(()=>window.testHooks.message({name:'Teste',text:'Olá 😀 https://example.org/path?a=1. <img src=x onerror=alert(1)> javascript:alert(1) https://user:pass@example.org'}));
 assert.equal(await page.locator('.message a').count(),1);assert.equal(await page.locator('.message a').getAttribute('href'),'https://example.org/path?a=1');assert.equal(await page.locator('.message img').count(),0);
 await page.locator('#copy-link').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Link copiado.'||!!document.querySelector('.invite-fallback'));if(await page.locator('.invite-fallback').count()){assert.match(await page.locator('.invite-fallback input').inputValue(),/room=abc-def-123$/);await page.locator('.invite-fallback button').click();}
 await page.screenshot({path:path.join(root,'work','meeting-polish-new.png')});assert.deepEqual(errors,[]);
 await page.addInitScript(()=>{window.windowActions=[];window.meetDesktop={checkUpdate:async()=>({available:false}),copyInvite:async code=>{window.copiedRoom=code},windowAction:async action=>{window.windowActions.push(action);return {maximized:action==='maximize',fullscreen:false}},onWindowState:callback=>{window.testWindowState=callback}}});
 await page.evaluate(()=>window.testHooks.state.room=null);await page.reload();assert.equal(await page.locator('#desktop-titlebar').count(),1);assert.equal(await page.locator('#download-card').count(),0);
 await page.locator('.top-actions .settings-open').click();
 const barColors=[];for(const theme of ['light','dark','gray','black']){await page.locator('#general-settings select').selectOption(theme);barColors.push(await page.locator('#desktop-titlebar').evaluate(n=>getComputedStyle(n).backgroundColor));}assert.equal(new Set(barColors).size,4);
 await page.locator('#settings-dialog header button').click();await page.locator('[data-window=maximize]').click();await page.locator('[data-window=minimize]').click();assert.deepEqual(await page.evaluate(()=>windowActions),['state','maximize','minimize']);
 await page.evaluate(()=>testWindowState({fullscreen:true}));assert(await page.locator('#desktop-titlebar').isHidden());await page.evaluate(()=>testWindowState({fullscreen:false}));assert(await page.locator('#desktop-titlebar').isVisible());assert.deepEqual(errors,[]);
 console.log('PASS: downloads, settings, input themes, crop drag/zoom/rotate, presets, responsive avatar, speaker frame, host crown, isolated presentation volume, emoji, safe links, clipboard fallback, stable tiles');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
