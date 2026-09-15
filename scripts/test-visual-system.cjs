const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');

async function routeLocal(page){
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({path:path.join(root,'apps/mobile/node_modules/livekit-client/dist/livekit-client.umd.js'),contentType:'text/javascript'});
  if(url.hostname!=='kpnc-meet.pages.dev')return route.abort();
  if(url.pathname==='/updates.json')return route.fulfill({json:{web:'visual-test'}});
  const relative=url.pathname==='/'?'index.html':url.pathname.slice(1),file=path.resolve(root,'public',relative);
  if(!file.startsWith(path.resolve(root,'public')+path.sep))return route.abort();
  return route.fulfill({path:file,contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':undefined});
 });
}

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
 try {
  fs.mkdirSync(path.join(root,'work'),{recursive:true});
  const page=await browser.newPage({viewport:{width:1365,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await routeLocal(page);
  await page.goto('https://kpnc-meet.pages.dev');await page.locator('body[data-theme]').waitFor();
  assert.equal(await page.locator('link[href="/css/spatial.css"]').count(),1,'spatial stylesheet must load last');
  const desktop=await page.locator('.hero').evaluate(node=>{const style=getComputedStyle(node),box=node.getBoundingClientRect();return{radius:parseFloat(style.borderRadius),background:style.backgroundColor,width:box.width,backdrop:style.backdropFilter||style.webkitBackdropFilter}});
  assert(desktop.radius>=24,'desktop hero must use the shared spatial radius');assert.notEqual(desktop.background,'rgba(0, 0, 0, 0)');assert(desktop.width<=920);
  assert((await page.locator('.trust span').count())===3,'trust details must remain visible');
  await page.screenshot({path:path.join(root,'work','visual-home-desktop.png')});

  await page.setViewportSize({width:390,height:844});
  assert(await page.locator('.trust').isVisible(),'mobile must keep concise trust information');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile home must not overflow horizontally');
  await page.screenshot({path:path.join(root,'work','visual-home-mobile.png')});

  await page.evaluate(()=>{document.querySelector('#home').classList.add('hidden');document.querySelector('#meeting').classList.remove('hidden');const tile=document.createElement('article');tile.className='tile speaking';tile.innerHTML='<div class="avatar">K</div><span class="name">Participante</span>';document.querySelector('#grid').append(tile)});
  for(const selector of ['#mic','#camera','#screen','#hand','#leave','#chat-toggle','#more-toggle']){const box=await page.locator(selector).boundingBox();assert(box&&box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844,selector+' must remain reachable')}
  const dock=await page.locator('.controls').evaluate(node=>{const style=getComputedStyle(node);return{radius:parseFloat(style.borderRadius),background:style.backgroundColor}});assert(dock.radius>=20);assert.notEqual(dock.background,'rgba(0, 0, 0, 0)');
  await page.screenshot({path:path.join(root,'work','visual-meeting-mobile.png')});

  const reduced=await browser.newPage({viewport:{width:900,height:700},reducedMotion:'reduce'});await routeLocal(reduced);await reduced.goto('https://kpnc-meet.pages.dev');assert.equal(await reduced.locator('.hero').evaluate(node=>getComputedStyle(node).animationName),'none');await reduced.close();
  const mobile=fs.readFileSync(path.join(root,'apps/mobile/src/App.tsx'),'utf8');
  assert(mobile.includes('s.heroCard')&&mobile.includes('s.heroGlow'),'mobile app must share the spatial hierarchy');
  assert(mobile.includes("surface:'#fffffff2'")&&mobile.includes("surface:'#142136f2'"),'mobile themes must define translucent high-contrast surfaces');
  assert.deepEqual(errors,[]);console.log('PASS: spatial visual system, desktop/mobile hierarchy, reachable meeting controls and reduced motion');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
