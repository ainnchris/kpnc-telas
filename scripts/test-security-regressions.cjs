const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const worker=fs.readFileSync(path.join(root,'worker/src/index.ts'),'utf8');
const web=fs.readFileSync(path.join(root,'public/js/app.js'),'utf8');
const mobile=fs.readFileSync(path.join(root,'apps/mobile/src/App.tsx'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const headers=fs.readFileSync(path.join(root,'public/_headers'),'utf8');

assert(worker.includes('clean(bearer(request), 128)'),'admission secret must prefer the Authorization header');
assert(!web.includes('&secret='),'web client must not put admission secrets in URLs');
assert(!mobile.includes('&secret='),'mobile client must not put admission secrets in URLs');
assert(worker.includes('MAX_REQUESTS_PER_ROOM'),'waiting room must have an abuse limit');
assert(worker.includes("result === 'locked'")&&worker.includes('setLocked'),'locked rooms must reject new join requests at the coordinator');
assert(!worker.includes('roomAdmin: host'),'browser token must not receive server administration privileges');
assert(worker.includes('authorizeHost')&&worker.includes('authorizeAdmin'),'host-only and delegated administration must stay separate');
assert(worker.includes("role: 'cohost'")&&worker.includes('secureEqual(member.secretHash, adminHash)'),'cohosts must use revocable hashed credentials');
assert(worker.includes("'UpdateParticipant'")&&worker.includes('can_publish_sources')&&worker.includes('can_publish_data'),'individual media and chat permissions must be enforced by LiveKit');
assert(worker.includes("'DeleteRoom'"),'ending a room must be enforced by the server instead of trusting a peer data message');
assert(worker.includes('chatHistory(memberHash')&&worker.includes('this.member(room, memberHash)'),'chat history must require a room-member credential');
assert(worker.includes("throw new Error('CHAT_BLOCKED')"),'server must enforce individual chat permission');
assert(worker.includes('room.messages = room.messages.slice(-200)'),'room chat history must stay bounded');
assert(worker.includes('moderationHistory(adminHash')&&worker.includes('this.authorizeAdmin(adminHash)'),'moderation history must require an administrator credential');
assert(worker.includes('room.moderation = room.moderation.slice(-100)'),'moderation history must stay bounded');
assert(worker.includes("recordParticipantAction(await sha256(bearer(request)), action, identity)"),'successful LiveKit moderation actions must be recorded by the server');
assert(web.includes('replyId=state.replyTo?.id')&&mobile.includes("replyId:replyTo?.id||''"),'replies must reference server-side message IDs');
assert(web.includes('Transferir a função de anfitrião')&&mobile.includes('Transferir anfitrião'),'host transfer must require an explicit user action');
assert(web.includes('state.memberKey')&&mobile.includes('memberKey=auth.memberKey'),'clients must poll their own role without sharing the original host key');
assert(web.toLocaleLowerCase('pt-BR').includes('atividade da moderação')&&mobile.includes('Atividade da moderação'),'administrators must see moderation history on web and mobile');
assert(web.includes("confirm(next?'Bloquear a reunião")&&mobile.includes("Alert.alert(locked?'Permitir novas entradas?"),'room locking must require confirmation');
assert.match(html,/integrity="sha384-[A-Za-z0-9+/=]+"/,'third-party runtime must use SRI');
assert.match(headers,/Content-Security-Policy:/,'published site must define a CSP');
assert.match(headers,/frame-ancestors 'none'/,'published site must block framing');

console.log('PASS: admission secrets, scoped moderator credentials, enforced participant permissions, SRI and security headers');
