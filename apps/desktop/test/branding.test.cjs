const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),config=require('../package.json');
test('installer and uninstaller use the Meet icon',()=>{
 assert.equal(config.build.win.icon,'assets/icon.ico');assert.equal(config.build.nsis.installerIcon,'assets/icon.ico');assert.equal(config.build.nsis.uninstallerIcon,'assets/icon.ico');
 require('../build-icon.cjs');
 const ico=fs.readFileSync(path.join(root,'assets/icon.ico')),png=fs.readFileSync(path.join(root,'assets/icon-256.png'));
 assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
 assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt32LE(18),22);assert.deepEqual(ico.subarray(22),png);
});
test('menu is removed without disabling isolation or meeting shortcuts',()=>{
 const main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
 assert.match(main,/Menu.setApplicationMenu\(null\)/);assert.match(main,/before-input-event/);
 assert.match(main,/sandbox:true/);assert.match(main,/contextIsolation:true/);assert.match(main,/nodeIntegration:false/);
});
