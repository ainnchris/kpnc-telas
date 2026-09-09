// Explicit integration check against the user's deployed API. Creates one temporary room
// and closes it in finally. Never prints tokens, request secrets, or host credentials.
import assert from 'node:assert/strict';
const base='https://kpnc-meet-api.erikchristian2.workers.dev';
async function request(path,{body,hostKey,method=body?'POST':'GET'}={}){
  const response=await fetch(base+path,{method,signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(hostKey?{Authorization:`Bearer ${hostKey}`}:{})},body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json()};
}
let auth;
let roomClosed=false;
try {
  const missing=await request('/api/join-requests',{body:{name:'Teste de existência',room:`qa-missing-${crypto.randomUUID()}`}});
  assert.equal(missing.status,404);console.log('PASS: reunião inexistente rejeitada');
  const created=await request('/api/rooms',{body:{name:'Teste automático multiplataforma'}});
  assert.equal(created.status,201);auth=created.data;assert.equal(auth.host,true);
  console.log('PASS: criação com autoridade de anfitrião');
  const path=`/api/rooms/${auth.room}`;
  const joined=await request('/api/join-requests',{body:{name:'Convidado de teste',room:auth.room}});
  assert.equal(joined.status,202);const join=joined.data;
  const statusPath=`/api/join-requests/${join.requestId}?room=${encodeURIComponent(auth.room)}&secret=${encodeURIComponent(join.requestSecret)}`;
  const waiting=await request(statusPath);assert.equal(waiting.data.status,'waiting');assert.equal(waiting.data.token,undefined);
  console.log('PASS: espera sem token antes de aprovação');
  const unauthorized=await request(`${path}/requests`);assert.equal(unauthorized.status,403);
  const pending=await request(`${path}/requests`,{hostKey:auth.hostKey});assert.equal(pending.status,200);assert.ok(pending.data.requests.some(item=>item.id===join.requestId));
  console.log('PASS: fila restrita ao anfitrião');
  assert.equal((await request(`${path}/requests/${join.requestId}/admit`,{body:{},hostKey:auth.hostKey})).status,200);
  const approved=await request(statusPath);assert.equal(approved.data.status,'approved');assert.equal(approved.data.host,false);
  const claims=JSON.parse(Buffer.from(approved.data.token.split('.')[1],'base64url').toString());
  assert.equal(claims.video.room,auth.room);assert.ok(claims.sub.startsWith('guest-'));
  console.log('PASS: aprovação emite token somente da sala correta');
  const denied=await request('/api/join-requests',{body:{name:'Teste de recusa',room:auth.room}});
  assert.equal(denied.status,202);
  assert.equal((await request(`${path}/requests/${denied.data.requestId}/deny`,{body:{},hostKey:auth.hostKey})).status,200);
  const deniedStatus=await request(`/api/join-requests/${denied.data.requestId}?room=${encodeURIComponent(auth.room)}&secret=${encodeURIComponent(denied.data.requestSecret)}`);
  assert.equal(deniedStatus.data.status,'denied');assert.equal(deniedStatus.data.token,undefined);
  console.log('PASS: recusa não entrega token');
  assert.equal((await request(`${path}/close`,{body:{},hostKey:auth.hostKey})).status,200);
  roomClosed=true;
  const closed=await request('/api/join-requests',{body:{name:'Teste após encerramento',room:auth.room}});assert.equal(closed.status,404);
  console.log('PASS: sala encerrada rejeita novas solicitações');
} catch(error) {
  // Assertion values may contain credentials; do not print the assertion object.
  console.error('FAIL:',error.name);process.exitCode=1;
} finally {
  if(roomClosed)console.log('CLEANUP: sala de teste encerrada');
  else if(auth?.hostKey){
    try{const result=await request(`/api/rooms/${auth.room}/close`,{body:{},hostKey:auth.hostKey});assert.equal(result.status,200);console.log('CLEANUP: sala de teste encerrada')}
    catch{console.error('CLEANUP FAILED: verificar sala temporária manualmente');process.exitCode=1}
  }
}
