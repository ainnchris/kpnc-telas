const test=require('node:test'),assert=require('node:assert/strict'),{validUpdate}=require('../updater.cjs');
const good={version:'0.3.0',sha256:'a'.repeat(64),url:'https://github.com/ainnchris/kpnc-telas/releases/download/windows-0.3.0/Kpnc-Meet.exe'};
test('updates require a newer version, checksum and own release URL',()=>{
 assert.equal(validUpdate(good,'0.2.0'),true);
 for(const invalid of [{...good,version:'0.1.0'},{...good,version:'0.2.0'},{...good,sha256:''},{...good,url:'https://evil.example/setup.exe'},{...good,url:'https://github.com/other/repo/releases/download/v1/setup.exe'},{...good,url:good.url+'?redirect=evil'},{...good,url:good.url.replace('https:','http:')}])assert.equal(validUpdate(invalid,'0.2.0'),false);
});
const {EventEmitter}=require('node:events');
test('silent upgrade runs fixed arguments without a shell and requests restart',async()=>{
 const {launchSilentInstaller}=require('../updater.cjs');let captured;
 await launchSilentInstaller('C:\\verified\\update.exe',(file,args,options)=>{captured={file,args,options};const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;});
 assert.deepEqual(captured.args,['/S','--force-run']);assert.equal(captured.options.windowsHide,true);assert.equal(captured.options.shell,undefined);
 await assert.rejects(()=>launchSilentInstaller('C:\\verified\\update.exe',()=>{const child=new EventEmitter();queueMicrotask(()=>child.emit('error',new Error('Launch failed')));return child;}),/Launch failed/);
});
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {downloadVerifiedUpdate,rangeTotal}=require('../updater.cjs');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const response=(body,status=200,headers={})=>new Response(body,{status,headers});
test('download resumes a verified partial installer and reports each phase',async t=>{
 const directory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'kpnc-update-'));t.after(()=>fs.promises.rm(directory,{recursive:true,force:true}));
 const complete=Buffer.from('installer-windows-verificado'),partial=complete.subarray(0,10),rest=complete.subarray(10),version='0.4.0';
 await fs.promises.writeFile(path.join(directory,`Kpnc-Meet-${version}.exe.partial`),partial);
 const phases=[];let range='';
 const result=await downloadVerifiedUpdate({update:{version,sha256:digest(complete),url:good.url},directory,onProgress:value=>phases.push(value),fetchImpl:async(_url,options)=>{range=options.headers.Range;return response(rest,206,{'content-length':String(rest.length),'content-range':`bytes ${partial.length}-${complete.length-1}/${complete.length}`})}});
 assert.equal(range,`bytes=${partial.length}-`);assert.equal(result.resumed,true);assert.deepEqual(await fs.promises.readFile(result.file),complete);
 for(const phase of ['connecting','downloading','verifying','ready'])assert(phases.some(item=>item.phase===phase),phase+' missing');
});
test('download safely restarts when the server ignores Range and reuses a verified cache',async t=>{
 const directory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'kpnc-update-'));t.after(()=>fs.promises.rm(directory,{recursive:true,force:true}));
 const complete=Buffer.from('novo-instalador'),version='0.5.0',temporary=path.join(directory,`Kpnc-Meet-${version}.exe.partial`);await fs.promises.writeFile(temporary,'antigo');let requests=0;
 const update={version,sha256:digest(complete),url:good.url};
 const first=await downloadVerifiedUpdate({update,directory,fetchImpl:async()=>{requests++;return response(complete,200,{'content-length':String(complete.length)})}});
 assert.equal(first.resumed,false);assert.equal(requests,1);assert.equal(fs.existsSync(temporary),false);
 const cached=await downloadVerifiedUpdate({update,directory,fetchImpl:async()=>{throw new Error('cache should avoid network')}});assert.equal(cached.cached,true);
});
test('invalid content ranges and corrupted downloads are rejected',async t=>{
 const directory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'kpnc-update-'));t.after(()=>fs.promises.rm(directory,{recursive:true,force:true}));
 assert.throws(()=>rangeTotal(response('x',206,{'content-range':'bytes 5-5/6'}),2),/não confirmou/);
 const update={version:'0.6.0',sha256:'f'.repeat(64),url:good.url};
 await assert.rejects(()=>downloadVerifiedUpdate({update,directory,fetchImpl:async()=>response('corrompido',200,{'content-length':'10'})}),/integridade falhou/);
 assert.equal(fs.existsSync(path.join(directory,'Kpnc-Meet-0.6.0.exe.partial')),false);
});
