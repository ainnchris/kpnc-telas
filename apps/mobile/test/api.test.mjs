import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/api.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {roomCode,api,post}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
test('accepts browser/app invitations and normalizes room codes',()=>{
  assert.equal(roomCode('ABC-DEF'),'abc-def');
  assert.equal(roomCode('https://kpnc-meet.pages.dev/?room=abc-def'),'abc-def');
  assert.equal(roomCode('kpncmeet://join/abc-def'),'abc-def');
});
test('rejects foreign URLs, malformed codes and script injection',()=>{
  for(const value of ['abc','<script>','https://evil.test/?room=abc-def','kpncmeet://other/abc-def','kpncmeet://join/%3Cscript%3E'])assert.equal(roomCode(value),'');
});
test('authenticated mutations preserve bearer and JSON body',()=>{
  const request=post({trackSid:'TR_test'},'host-test-only');
  assert.equal(request.headers.Authorization,'Bearer host-test-only');
  assert.equal(request.method,'POST');
  assert.deepEqual(JSON.parse(request.body),{trackSid:'TR_test'});
});
test('API returns data, rejects backend errors and cleans up',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{assert.ok(url.startsWith('https://kpnc-meet-api.erikchristian2.workers.dev/'));assert.equal(options.headers['Content-Type'],'application/json');return new Response(JSON.stringify({status:'waiting'}))};
    assert.deepEqual(await api('/api/test'),{status:'waiting'});
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'Reunião inexistente'}),{status:404});
    await assert.rejects(api('/api/test'),/Reunião inexistente/);
  }finally{globalThis.fetch=original}
});
