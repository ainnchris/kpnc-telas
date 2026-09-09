'use strict';
const {app, BrowserWindow, Menu, session, dialog, desktopCapturer, ipcMain, shell} = require('electron');
const path = require('node:path');
const {SITE, isMeetURL, meetingLink} = require('./policy.cjs');
if (!app.isPackaged && process.argv.includes('--smoke-test')) {
  const profile = path.join(__dirname,'dist','smoke-profile');
  require('node:fs').mkdirSync(profile,{recursive:true});
  app.setPath('userData',profile);
}
let main, picker, pendingCapture;
const mediaGrants = new Set();
const startupLink = process.argv.map(meetingLink).find(Boolean) || SITE;
function trusted(contents, url) {
  return !!main && !main.isDestroyed() && contents === main.webContents && isMeetURL(url);
}
function finishCapture(result = {}) {
  const pending = pendingCapture;
  pendingCapture = null;
  if (picker && !picker.isDestroyed()) picker.close();
  picker = null;
  if (pending) {
    clearTimeout(pending.timer);
    // A closed/navigated requesting frame must never receive an old approval.
    try { pending.callback(trusted(main?.webContents, main?.webContents.getURL()) ? result : {}); } catch {}
  }
}
async function chooseScreen(request, callback) {
  if (!main || request.frame !== main.webContents.mainFrame || !isMeetURL(request.securityOrigin) || !request.userGesture || pendingCapture) return callback({});
  const pending = {callback, sources:[], timer:setTimeout(() => finishCapture(), 60000), audio:request.audioRequested};
  pendingCapture = pending;
  try {
    pending.sources = await desktopCapturer.getSources({types:['screen','window'], thumbnailSize:{width:320,height:180}, fetchWindowIcons:false});
    if (pendingCapture !== pending) return;
    picker = new BrowserWindow({parent:main, modal:true, width:760,height:580, title:'Escolha o que compartilhar', backgroundColor:'#0b1220', autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'picker-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    picker.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    picker.webContents.on('will-navigate', e => e.preventDefault());
    picker.on('closed', () => {picker = null; finishCapture();});
    await picker.loadFile('picker.html');
  } catch { finishCapture(); }
}
ipcMain.handle('capture:list', event => {
  if (!picker || event.sender !== picker.webContents || event.senderFrame !== picker.webContents.mainFrame || !pendingCapture) throw new Error('Forbidden');
  return {audio:pendingCapture.audio && process.platform === 'win32',sources:pendingCapture.sources.map(s => ({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}))};
});
ipcMain.on('capture:select', (event, selection) => {
  if (!picker || event.sender !== picker.webContents || event.senderFrame !== picker.webContents.mainFrame || !pendingCapture) return;
  const source = pendingCapture.sources.find(s => s.id === selection?.id);
  if (!source) return finishCapture();
  finishCapture({video:source,...(selection.audio === true && pendingCapture.audio && process.platform === 'win32' ? {audio:'loopback'} : {})});
});
function sendAction(id) { if (main && !main.isDestroyed() && isMeetURL(main.webContents.getURL())) main.webContents.send('meet:action',id); }
async function createWindow() {
  const smokeTest = !app.isPackaged && process.argv.includes('--smoke-test');
  main = new BrowserWindow({show:!smokeTest,width:1280,height:820,minWidth:420,minHeight:580,title:'Kpnc Meet',backgroundColor:'#080c12',icon:path.join(__dirname,'assets/icon.ico'),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:kpnc-meet'}});
  const ses = session.fromPartition('persist:kpnc-meet');
  ses.setPermissionCheckHandler((wc, permission, origin, details) => {
    if (!trusted(wc, origin) || details.isMainFrame === false) return false;
    if (permission === 'fullscreen') return true;
    return permission === 'media' && mediaGrants.has(details.mediaType);
  });
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (!trusted(wc, details.requestingUrl) || details.isMainFrame === false) return callback(false);
    if (permission === 'fullscreen') return callback(true);
    if (permission !== 'media') return callback(false);
    const types = details.mediaTypes || [];
    if (!types.length || types.some(t => !['audio','video'].includes(t))) return callback(false);
    if (types.every(t => mediaGrants.has(t))) return callback(true);
    const answer = await dialog.showMessageBox(main,{type:'question',title:'Permissão de dispositivos',message:`Permitir acesso a ${types.map(t=>t==='audio'?'microfone':'câmera').join(' e ')}?`,detail:'A permissão vale enquanto o programa estiver aberto. Você controla os dispositivos nos botões da reunião.',buttons:['Não permitir','Permitir'],defaultId:0,cancelId:0});
    const approved = answer.response === 1 && trusted(wc,wc.getURL());
    if (approved) types.forEach(t => mediaGrants.add(t));
    callback(approved);
  });
  ses.setDisplayMediaRequestHandler(chooseScreen);
  main.webContents.on('will-navigate',(event,url) => {if (!isMeetURL(url)) event.preventDefault(); finishCapture();});
  main.webContents.on('will-redirect',(event,url) => {if (!isMeetURL(url)) event.preventDefault();});
  main.webContents.on('will-attach-webview',event => event.preventDefault());
  main.webContents.setWindowOpenHandler(({url}) => {
    if (isMeetURL(url)) void shell.openExternal(url);
    return {action:'deny'};
  });
  main.webContents.on('did-fail-load',async (_event,code,_description,_url,isMainFrame) => {
    if (!isMainFrame || code === -3 || main.isDestroyed()) return;
    if (smokeTest) {console.error('SMOKE_LOAD_FAILED',code);app.exit(1);return;}
    const choice = await dialog.showMessageBox(main,{type:'warning',message:'Não foi possível abrir o Kpnc Meet.',detail:'Confira a internet e tente novamente.',buttons:['Tentar novamente','Fechar'],defaultId:0});
    if (choice.response === 0) void main.loadURL(SITE).catch(()=>{}); else main.close();
  });
  main.on('closed',()=>{finishCapture();main=null;});
  Menu.setApplicationMenu(null);
  main.setMenu(null);
  main.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const key = input.key.toLowerCase();
    const action = {m:'mic',v:'camera',c:'chat-toggle'}[key];
    if (input.control && input.shift && !input.alt && action) {event.preventDefault();sendAction(action);}
    if (key === 'f11') {event.preventDefault();main.setFullScreen(!main.isFullScreen());}
  });
  await main.loadURL(startupLink).catch(()=>{});
  if (smokeTest) {
    const result = await main.webContents.executeJavaScript(`({title:document.title,home:!!document.getElementById('new-meeting'),livekit:!!window.LivekitClient,nodeExposed:typeof require!=='undefined',chatButton:!!document.getElementById('chat-toggle')})`);
    console.log(JSON.stringify(result));
    app.exit(result.home && result.livekit && !result.nodeExposed && result.chatButton ? 0 : 1);
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',async (_event,args) => {
    if (!main) return;
    if (main.isMinimized()) main.restore(); main.focus();
    const target = args.map(meetingLink).find(Boolean);
    if (target) {
      const result = await dialog.showMessageBox(main,{type:'question',message:'Abrir outra reunião?',detail:'Isso sai da reunião atual, se houver.',buttons:['Cancelar','Abrir'],defaultId:0,cancelId:0});
      if (result.response === 1) void main.loadURL(target).catch(()=>{});
    }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed',()=>app.quit());
}
