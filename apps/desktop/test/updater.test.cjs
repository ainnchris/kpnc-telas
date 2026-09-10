const test=require('node:test'),assert=require('node:assert/strict'),{validUpdate}=require('../updater.cjs');
const good={version:'0.3.0',sha256:'a'.repeat(64),url:'https://github.com/ainnchris/kpnc-telas/releases/download/windows-0.3.0/Kpnc-Meet.exe'};
test('updates require a newer version, checksum and own release URL',()=>{
 assert.equal(validUpdate(good,'0.2.0'),true);
 for(const invalid of [{...good,version:'0.1.0'},{...good,version:'0.2.0'},{...good,sha256:''},{...good,url:'https://evil.example/setup.exe'},{...good,url:'https://github.com/other/repo/releases/download/v1/setup.exe'},{...good,url:good.url+'?redirect=evil'},{...good,url:good.url.replace('https:','http:')}])assert.equal(validUpdate(invalid,'0.2.0'),false);
});
