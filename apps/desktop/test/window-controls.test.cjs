const test=require('node:test'),assert=require('node:assert/strict');
const {inviteURL,externalURL,setupWindowControls}=require('../window-controls.cjs');
test('invite bridge writes only room links; external links allow HTTP(S), not native schemes',()=>{
 assert.equal(inviteURL('abc-def-123'),'https://kpnc-meet.pages.dev/?room=abc-def-123');
 for(const value of ['https://evil.test',null,'../room','javascript:alert(1)','x'.repeat(65)])assert.equal(inviteURL(value),null);
 assert.equal(externalURL('https://example.org/path'),'https://example.org/path');
 for(const value of ['file:///C:/test','javascript:alert(1)','ms-settings:','https://user:pass@example.org'])assert.equal(externalURL(value),null);
});
test('window and clipboard IPC reject other frames and origins',async()=>{
 const handlers={},wc={mainFrame:{},getURL:()=> 'https://kpnc-meet.pages.dev/'},win={webContents:wc,isDestroyed:()=>false,isMaximized:()=>false,isFullScreen:()=>false,minimize:()=>{win.minimized=true}};let copied;
 setupWindowControls({ipcMain:{handle:(name,fn)=>handlers[name]=fn},getMain:()=>win,clipboard:{writeText:value=>copied=value}});
 const event={sender:wc,senderFrame:wc.mainFrame};await handlers['meet:copy-invite'](event,'abc-def');assert.match(copied,/room=abc-def$/);
 await assert.rejects(()=>handlers['meet:copy-invite']({...event,senderFrame:{}},'abc-def'),/Forbidden/);
 assert.throws(()=>handlers['meet:window'](event,'execute'),/Invalid/);handlers['meet:window'](event,'minimize');assert(win.minimized);
 wc.getURL=()=> 'https://evil.test';assert.throws(()=>handlers['meet:window'](event,'close'),/Forbidden/);
});
