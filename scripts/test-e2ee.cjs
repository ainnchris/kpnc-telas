const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const helper=fs.readFileSync(path.join(root,'public/js/e2ee.js'),'utf8');
const web=fs.readFileSync(path.join(root,'public/js/app.js'),'utf8');
const mobile=fs.readFileSync(path.join(root,'apps/mobile/src/App.tsx'),'utf8');
const worker=fs.readFileSync(path.join(root,'worker/src/index.ts'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const livekitEntry=require.resolve('livekit-client',{paths:[path.join(root,'apps/mobile')]});
const workerBytes=fs.readFileSync(path.join(path.dirname(livekitEntry),'livekit-client.e2ee.worker.js'));

function runtime(){
  class FakeProvider{constructor(options){this.options=options}async setKey(value){this.key=value}}
  class FakeWorker{constructor(url,options){this.url=url;this.options=options;this.terminated=false}terminate(){this.terminated=true}}
  const urls=new Set();
  const context={
    Uint8Array,TextEncoder,Blob,Response,crypto:crypto.webcrypto,
    btoa:value=>Buffer.from(value,'binary').toString('base64'),
    URL:{createObjectURL:()=>{const value=`blob:test-${urls.size}`;urls.add(value);return value},revokeObjectURL:value=>urls.delete(value)},
    Worker:FakeWorker,
    LivekitClient:{ExternalE2EEKeyProvider:FakeProvider,isE2EESupported:()=>true},
    fetch:async(url,options)=>{assert.equal(url,'https://cdn.jsdelivr.net/npm/livekit-client@2.22.1/dist/livekit-client.e2ee.worker.js');assert.equal(options.credentials,'omit');return new Response(workerBytes)},
  };
  context.globalThis=context;vm.createContext(context);vm.runInContext(helper,context);return {context,urls};
}

test('generates a strong volatile key and a comparable fingerprint',async()=>{
  const {context}=runtime(),key=context.MeetE2EE.generateKey();
  assert.match(key,/^[A-Za-z0-9_-]{32}$/);
  assert.equal(context.MeetE2EE.isValidKey(key),true);
  assert.match(await context.MeetE2EE.fingerprint(key),/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.equal(context.MeetE2EE.isValidKey('senha-curta'),false);
});

test('verifies the pinned worker before creating 128-bit E2EE options',async()=>{
  const {context,urls}=runtime(),key=context.MeetE2EE.generateKey();
  const session=await context.MeetE2EE.createRoomOptions(key);
  assert.equal(session.options.e2ee.keyProvider.options.keySize,128);
  assert.equal(session.options.e2ee.keyProvider.key,key);
  assert.equal(urls.size,1);
  session.dispose();assert.equal(session.options.e2ee.worker.terminated,true);assert.equal(urls.size,0);
});

test('fails closed and never sends the media key to backend or persistent storage',()=>{
  assert(worker.includes("room.e2ee !== e2ee")&&worker.includes("'mode_mismatch'"),'Worker must block mismatched room modes');
  assert(worker.includes("code: 'E2EE_MODE_MISMATCH'"),'mode mismatch must have a stable client error code');
  assert(web.includes('e2ee:state.e2ee.enabled')&&!web.includes('e2eeKey:'),'web requests may contain only the mode');
  assert(mobile.includes('e2ee:e2eeEnabled')&&!mobile.includes("['kpnc-e2ee")&&!mobile.includes("setItem('kpnc-e2ee"),'mobile requests may contain only the mode and never persist the key');
  assert(!worker.includes('e2eeKey')&&!worker.includes('fingerprint'),'the backend must never accept or derive key material');
  assert(!web.includes('localStorage.setItem(\'kpnc-e2ee')&&!web.includes('sessionStorage'),'web must keep the key out of persistent storage');
  assert(web.includes('RoomEvent.EncryptionError')&&mobile.includes('onEncryptionError'),'both clients must stop on decryption failure');
  assert(html.includes('Mídia com E2EE')&&html.includes('O chat continua protegido em trânsito'),'UI must state the exact protection boundary');
});
