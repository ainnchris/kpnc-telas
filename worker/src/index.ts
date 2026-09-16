import { DurableObject } from 'cloudflare:workers';

const encoder = new TextEncoder();
const MAX_BODY_BYTES = 16 * 1024;
const MAX_REQUESTS_PER_ROOM = 50;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TTL_MS = 15 * 60 * 1000;
const DEFAULT_ORIGINS = ['https://kpnc-meet.pages.dev', 'http://localhost:3000', 'http://localhost:8788'];

type JoinStatus = 'waiting' | 'approved' | 'denied';
type MemberRole = 'participant' | 'cohost' | 'host';
type MemberPermissions = { microphone: boolean; camera: boolean; chat: boolean; screen: boolean };
type JoinRequest = { id: string; name: string; avatar: string; secretHash: string; status: JoinStatus; createdAt: number; identity?: string };
type MemberState = { secretHash: string; role: Exclude<MemberRole, 'host'>; permissions: MemberPermissions };
type ChatMessage = { id: string; identity: string; name: string; text: string; replyTo?: { id: string; name: string; text: string }; createdAt: number };
type ModerationAction = 'admit' | 'deny' | 'lock' | 'unlock' | 'mute' | 'remove' | 'promote_cohost' | 'demote_cohost' | 'transfer_host' | 'permissions' | 'end_room';
type ModerationEvent = { id: string; action: ModerationAction; actorIdentity: string; actorRole: 'host' | 'cohost'; targetIdentity?: string; targetName?: string; changes?: Partial<MemberPermissions>; createdAt: number };
type RoomState = { hostHash: string; hostIdentity: string; createdAt: number; closed: boolean; locked: boolean; e2ee: boolean; requests: Record<string, JoinRequest>; members: Record<string, MemberState>; messages: ChatMessage[]; moderation: ModerationEvent[] };
const DEFAULT_PERMISSIONS: MemberPermissions = { microphone: true, camera: true, chat: true, screen: true };

export class RoomCoordinator extends DurableObject<Env> {
  async create(hostHash: string, hostIdentity: string, e2ee: boolean): Promise<boolean> {
    const current = await this.ctx.storage.get<RoomState>('room');
    if (current && !current.closed && Date.now() - current.createdAt < ROOM_TTL_MS) return false;
    await this.ctx.storage.put('room', { hostHash, hostIdentity, createdAt: Date.now(), closed: false, locked: false, e2ee, requests: {}, members: {}, messages: [], moderation: [] } satisfies RoomState);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    return true;
  }
  async exists(): Promise<boolean> {
    const room = await this.ctx.storage.get<RoomState>('room');
    return !!room && !room.closed && Date.now() - room.createdAt < ROOM_TTL_MS;
  }
  async requestJoin(request: JoinRequest, e2ee: boolean): Promise<'created' | 'missing' | 'full' | 'locked' | 'mode_mismatch'> {
    const room = await this.ctx.storage.get<RoomState>('room');
    if (!room || room.closed || Date.now() - room.createdAt >= ROOM_TTL_MS) return 'missing';
    this.normalize(room);
    if (room.e2ee !== e2ee) return 'mode_mismatch';
    if (room.locked) return 'locked';
    this.prune(room);
    if (Object.keys(room.requests).length >= MAX_REQUESTS_PER_ROOM) return 'full';
    room.requests[request.id] = request;
    await this.ctx.storage.put('room', room);
    return 'created';
  }
  async requestStatus(id: string, secretHash: string): Promise<{ status: JoinStatus; name: string; avatar: string; identity?: string; e2ee: boolean } | null> {
    const room = await this.ctx.storage.get<RoomState>('room');
    const item = room?.requests[id];
    if (!room || room.closed || !item || !secureEqual(item.secretHash, secretHash) || Date.now() - item.createdAt >= REQUEST_TTL_MS) return null;
    this.normalize(room);
    if (item.status === 'approved' && !item.identity) {
      item.identity = `guest-${crypto.randomUUID()}`;
      room.members[item.identity] = { secretHash: item.secretHash, role: 'participant', permissions: { ...DEFAULT_PERMISSIONS } };
      await this.ctx.storage.put('room', room);
    }
    return { status: item.status, name: item.name, avatar: item.avatar, identity: item.identity, e2ee: room.e2ee };
  }
  async pending(adminHash: string): Promise<Array<{ id: string; name: string; createdAt: number }>> {
    const room = await this.authorizeAdmin(adminHash);
    this.prune(room);
    await this.ctx.storage.put('room', room);
    return Object.values(room.requests).filter((item) => item.status === 'waiting').map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  }
  async decide(adminHash: string, id: string, decision: 'approved' | 'denied'): Promise<boolean> {
    const room = await this.authorizeAdmin(adminHash);
    const item = room.requests[id];
    if (!item || item.status !== 'waiting') return false;
    item.status = decision;
    this.record(room, adminHash, decision === 'approved' ? 'admit' : 'deny', undefined, item.name);
    await this.ctx.storage.put('room', room);
    return true;
  }
  async close(hostHash: string): Promise<void> {
    const room = await this.authorize(hostHash);
    this.record(room, hostHash, 'end_room');
    room.closed = true;
    room.requests = {};
    await this.ctx.storage.put('room', room);
  }
  async setLocked(adminHash: string, locked: boolean): Promise<boolean> {
    const room = await this.authorizeAdmin(adminHash); room.locked = locked; this.record(room, adminHash, locked ? 'lock' : 'unlock'); await this.ctx.storage.put('room', room); return room.locked;
  }
  async adminAuthorized(adminHash: string): Promise<boolean> { await this.authorizeAdmin(adminHash); return true; }
  async roleStatus(memberHash: string): Promise<{ role: MemberRole; permissions: MemberPermissions; roles: Record<string, MemberRole>; memberPermissions: Record<string, MemberPermissions>; locked: boolean }> {
    const room = await this.getRoom(); this.normalize(room);
    let role: MemberRole = 'participant', permissions = { ...DEFAULT_PERMISSIONS }, authenticated = false;
    if (secureEqual(room.hostHash, memberHash)) { role = 'host'; authenticated = true; }
    else for (const member of Object.values(room.members)) if (secureEqual(member.secretHash, memberHash)) { role = member.role; permissions = member.permissions; authenticated = true; break; }
    if (!authenticated) throw new Error('UNAUTHORIZED');
    const roles: Record<string, MemberRole> = { [room.hostIdentity]: 'host' };
    const memberPermissions: Record<string, MemberPermissions> = {};
    for (const [identity, member] of Object.entries(room.members)) { if (identity !== room.hostIdentity) roles[identity] = member.role; memberPermissions[identity] = member.permissions; }
    return { role, permissions, roles, memberPermissions, locked: room.locked };
  }
  async setRole(hostHash: string, identity: string, role: 'participant' | 'cohost'): Promise<void> {
    const room = await this.authorizeHost(hostHash); this.normalize(room);
    if (identity === room.hostIdentity || !room.members[identity]) throw new Error('MEMBER_NOT_FOUND');
    room.members[identity].role = role; this.record(room, hostHash, role === 'cohost' ? 'promote_cohost' : 'demote_cohost', identity); await this.ctx.storage.put('room', room);
  }
  async transfer(hostHash: string, identity: string): Promise<void> {
    const room = await this.authorizeHost(hostHash); this.normalize(room);
    const target = room.members[identity]; if (!target || identity === room.hostIdentity) throw new Error('MEMBER_NOT_FOUND');
    this.record(room, hostHash, 'transfer_host', identity);
    room.members[room.hostIdentity] = { secretHash: room.hostHash, role: 'cohost', permissions: { ...DEFAULT_PERMISSIONS } };
    target.role = 'participant'; room.hostHash = target.secretHash; room.hostIdentity = identity;
    await this.ctx.storage.put('room', room);
  }
  async chatHistory(memberHash: string): Promise<ChatMessage[]> {
    const room = await this.getRoom(); this.normalize(room); this.member(room, memberHash); return room.messages.slice(-200);
  }
  async moderationHistory(adminHash: string): Promise<ModerationEvent[]> {
    const room = await this.authorizeAdmin(adminHash); return room.moderation.slice(-100);
  }
  async addMessage(memberHash: string, id: string, name: string, text: string, replyId: string): Promise<ChatMessage> {
    const room = await this.getRoom(); this.normalize(room); const member = this.member(room, memberHash);
    if (!member.permissions.chat) throw new Error('CHAT_BLOCKED');
    const duplicate = room.messages.find((item) => item.id === id); if (duplicate) return duplicate;
    const referenced = replyId ? room.messages.find((item) => item.id === replyId) : undefined;
    const message: ChatMessage = { id, identity: member.identity, name, text, ...(referenced ? { replyTo: { id: referenced.id, name: referenced.name, text: referenced.text.slice(0, 120) } } : {}), createdAt: Date.now() };
    room.messages.push(message); room.messages = room.messages.slice(-200); await this.ctx.storage.put('room', room); return message;
  }
  async setPermissions(adminHash: string, identity: string, permissions: MemberPermissions): Promise<void> {
    const room = await this.authorizeAdmin(adminHash); this.normalize(room);
    if (identity === room.hostIdentity) throw new Error('HOST_PERMISSIONS');
    const member = room.members[identity]; if (!member) throw new Error('MEMBER_NOT_FOUND');
    const changes: Partial<MemberPermissions> = {};
    for (const key of ['microphone','camera','chat','screen'] as (keyof MemberPermissions)[]) if (member.permissions[key] !== permissions[key]) changes[key] = permissions[key];
    member.permissions = permissions; this.record(room, adminHash, 'permissions', identity, undefined, changes); await this.ctx.storage.put('room', room);
  }
  async recordParticipantAction(adminHash: string, action: 'mute' | 'remove', identity: string): Promise<void> {
    const room = await this.authorizeAdmin(adminHash); this.record(room, adminHash, action, identity); await this.ctx.storage.put('room', room);
  }
  async alarm(): Promise<void> { await this.ctx.storage.deleteAll(); }
  private async getRoom(): Promise<RoomState> {
    const room = await this.ctx.storage.get<RoomState>('room');
    if (!room || room.closed) throw new Error('UNAUTHORIZED');
    return room;
  }
  private member(room: RoomState, memberHash: string): { identity: string; permissions: MemberPermissions } {
    if (secureEqual(room.hostHash, memberHash)) return { identity: room.hostIdentity, permissions: { ...DEFAULT_PERMISSIONS } };
    for (const [identity, member] of Object.entries(room.members)) if (secureEqual(member.secretHash, memberHash)) return { identity, permissions: member.permissions };
    throw new Error('UNAUTHORIZED');
  }
  private async authorizeHost(hostHash: string): Promise<RoomState> {
    const room = await this.getRoom();
    if (!secureEqual(room.hostHash, hostHash)) throw new Error('HOST_REQUIRED');
    return room;
  }
  private async authorizeAdmin(adminHash: string): Promise<RoomState> {
    const room = await this.getRoom(); this.normalize(room);
    if (secureEqual(room.hostHash, adminHash)) return room;
    for (const member of Object.values(room.members)) if (member.role === 'cohost' && secureEqual(member.secretHash, adminHash)) return room;
    throw new Error('UNAUTHORIZED');
  }
  private async authorize(hostHash: string): Promise<RoomState> { return this.authorizeHost(hostHash); }
  private normalize(room: RoomState): void { room.members ||= {}; room.messages ||= []; room.moderation ||= []; room.hostIdentity ||= 'host-legacy'; room.e2ee ??= false; }
  private record(room: RoomState, adminHash: string, action: ModerationAction, targetIdentity?: string, targetName?: string, changes?: Partial<MemberPermissions>): void {
    this.normalize(room); let actorIdentity = room.hostIdentity; let actorRole: 'host' | 'cohost' = 'host';
    if (!secureEqual(room.hostHash, adminHash)) for (const [identity, member] of Object.entries(room.members)) if (member.role === 'cohost' && secureEqual(member.secretHash, adminHash)) { actorIdentity = identity; actorRole = 'cohost'; break; }
    room.moderation.push({ id: crypto.randomUUID(), action, actorIdentity, actorRole, ...(targetIdentity ? { targetIdentity } : {}), ...(targetName ? { targetName: targetName.slice(0, 48) } : {}), ...(changes && Object.keys(changes).length ? { changes } : {}), createdAt: Date.now() });
    room.moderation = room.moderation.slice(-100);
  }
  private prune(room: RoomState): void {
    const cutoff = Date.now() - REQUEST_TTL_MS;
    for (const [id, item] of Object.entries(room.requests)) if (item.createdAt < cutoff) delete room.requests[id];
  }
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const configured = (env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if ((configured.length ? configured : DEFAULT_ORIGINS).includes(origin)) return origin;
  return /^https:\/\/[a-z0-9-]+\.kpnc-meet\.pages\.dev$/i.test(origin) ? origin : null;
}
function responseHeaders(origin: string | null): HeadersInit { return { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin || DEFAULT_ORIGINS[0], 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' }; }
function json(data: unknown, status: number, origin: string | null): Response { return new Response(JSON.stringify(data), { status, headers: responseHeaders(origin) }); }
function clean(value: unknown, max: number): string { return typeof value === 'string' ? value.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, max) : ''; }
function cleanAvatar(value: unknown): string {
  if (typeof value !== 'string' || value.length > 12_000) return '';
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) ? value : '';
}
function secureEqual(left: string, right: string): boolean { if (left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }
function base64Url(bytes: Uint8Array): string { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function randomToken(bytes = 24): string { return base64Url(crypto.getRandomValues(new Uint8Array(bytes))); }
function roomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; const bytes = crypto.getRandomValues(new Uint8Array(12));
  const part = (start: number) => Array.from(bytes.slice(start, start + 4), (byte) => alphabet[byte % alphabet.length]).join('');
  return `${part(0)}-${part(4)}-${part(8)}`;
}
function livekitRoom(env: Env, room: string): string {
  const prefix = (env.ROOM_PREFIX || '').trim().replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
  return `${prefix}${room}`;
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('Content-Length') || 0); if (length > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  const body = await request.text(); if (encoder.encode(body).byteLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  return JSON.parse(body) as Record<string, unknown>;
}
function encodePart(value: unknown): string { return base64Url(encoder.encode(JSON.stringify(value))); }
async function sha256(value: string): Promise<string> { return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function signedToken(env: Env, payload: Record<string, unknown>): Promise<string> {
  const header = encodePart({ alg: 'HS256', typ: 'JWT' }); const body = encodePart(payload); const unsigned = `${header}.${body}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.LIVEKIT_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned)); return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}
async function issueToken(env: Env, room: string, name: string, host: boolean, avatar = '', assignedIdentity = ''): Promise<string> {
  const now = Math.floor(Date.now() / 1000); const identity = assignedIdentity || `${host ? 'host' : 'guest'}-${crypto.randomUUID()}`;
  return signedToken(env, { exp: now + 6 * 60 * 60, iss: env.LIVEKIT_API_KEY, nbf: now - 5, sub: identity, name, metadata: JSON.stringify({ host, avatar }), video: { roomJoin: true, room: livekitRoom(env, room), canPublish: true, canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: true } });
}
async function roomService(env: Env, room: string, method: 'RemoveParticipant' | 'MutePublishedTrack' | 'UpdateParticipant' | 'DeleteRoom', body: Record<string, unknown>): Promise<void> {
  const serviceRoom = livekitRoom(env, room);
  const now = Math.floor(Date.now() / 1000); const token = await signedToken(env, { exp: now + 300, iss: env.LIVEKIT_API_KEY, nbf: now - 5, sub: `kpnc-admin-${crypto.randomUUID()}`, video: { roomAdmin: true, room: serviceRoom } });
  const base = env.LIVEKIT_URL.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/$/, '');
  const response = await fetch(`${base}/twirp/livekit.RoomService/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, room: serviceRoom }) });
  if (!response.ok) throw new Error('LIVEKIT_ADMIN_FAILED');
}
function coordinator(env: Env, room: string): DurableObjectStub<RoomCoordinator> { return env.ROOMS.getByName(room) as DurableObjectStub<RoomCoordinator>; }
function bearer(request: Request): string { return (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''); }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    if (request.headers.has('Origin') && !origin) return json({ error: 'Origem não permitida.' }, 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin) });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, rooms: true }, 200, origin);
    try {
      if (request.method === 'POST' && url.pathname === '/api/rooms') {
        const body = await readBody(request); const name = clean(body.name, 48); const avatar = cleanAvatar(body.avatar); const e2ee = body.e2ee === true;
        if (name.length < 2) return json({ error: 'Informe um nome com pelo menos 2 caracteres.' }, 400, origin);
        let room = ''; let hostKey = ''; const hostIdentity = `host-${crypto.randomUUID()}`;
        for (let attempt = 0; attempt < 5; attempt += 1) { room = roomCode(); hostKey = randomToken(); if (await coordinator(env, room).create(await sha256(hostKey), hostIdentity, e2ee)) break; room = ''; }
        if (!room) throw new Error('ROOM_CREATE_FAILED');
        return json({ token: await issueToken(env, room, name, true, avatar, hostIdentity), url: env.LIVEKIT_URL, room, host: true, hostKey, memberKey: hostKey, e2ee }, 201, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/join-requests') {
        const body = await readBody(request); const name = clean(body.name, 48); const avatar = cleanAvatar(body.avatar); const room = clean(body.room, 64).toLowerCase(); const e2ee = body.e2ee === true;
        if (name.length < 2 || !/^[a-z0-9-]{6,64}$/.test(room)) return json({ error: 'Nome ou código inválido.' }, 400, origin);
        const id = crypto.randomUUID(); const secret = randomToken();
        const result = await coordinator(env, room).requestJoin({ id, name, avatar, secretHash: await sha256(secret), status: 'waiting', createdAt: Date.now() }, e2ee);
        if (result === 'missing') return json({ error: 'Esta reunião não existe ou já foi encerrada.', code: 'ROOM_NOT_FOUND' }, 404, origin);
        if (result === 'locked') return json({ error: 'Esta reunião está bloqueada para novas entradas.', code: 'ROOM_LOCKED' }, 423, origin);
        if (result === 'mode_mismatch') return json({ error: e2ee ? 'Esta reunião não usa criptografia ponta a ponta. Desative a opção para entrar.' : 'Esta reunião exige criptografia ponta a ponta. Ative a opção e informe a chave.', code: 'E2EE_MODE_MISMATCH' }, 409, origin);
        if (result === 'full') return json({ error: 'A sala de espera está cheia. Tente novamente em alguns minutos.', code: 'WAITING_ROOM_FULL' }, 429, origin);
        return json({ room, requestId: id, requestSecret: secret, status: 'waiting' }, 202, origin);
      }
      const statusMatch = url.pathname.match(/^\/api\/join-requests\/([0-9a-f-]+)$/i);
      if (request.method === 'GET' && statusMatch) {
        const room = clean(url.searchParams.get('room'), 64).toLowerCase();
        // Keep query-string compatibility for already installed 0.4.0 clients.
        // New clients use Authorization so the secret is not exposed in URLs.
        const secret = clean(bearer(request), 128) || clean(url.searchParams.get('secret'), 128);
        const status = await coordinator(env, room).requestStatus(statusMatch[1], await sha256(secret));
        if (!status) return json({ error: 'Solicitação expirada ou reunião encerrada.', code: 'REQUEST_EXPIRED' }, 404, origin);
        if (status.status !== 'approved') return json({ status: status.status }, 200, origin);
        return json({ status: 'approved', token: await issueToken(env, room, status.name, false, status.avatar, status.identity), url: env.LIVEKIT_URL, room, host: false, memberKey: secret, e2ee: status.e2ee }, 200, origin);
      }
      const messagesMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/messages$/i);
      if (request.method === 'GET' && messagesMatch) return json({ messages: await coordinator(env, messagesMatch[1]).chatHistory(await sha256(bearer(request))) }, 200, origin);
      if (request.method === 'POST' && messagesMatch) {
        const body = await readBody(request); const id = clean(body.id, 80); const name = clean(body.name, 48); const text = clean(body.text, 500); const replyId = clean(body.replyId, 80);
        if (!/^[a-z0-9-]{8,80}$/i.test(id) || name.length < 1 || text.length < 1) return json({ error: 'Mensagem inválida.' }, 400, origin);
        return json({ message: await coordinator(env, messagesMatch[1]).addMessage(await sha256(bearer(request)), id, name, text, replyId) }, 201, origin);
      }
      const roleMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/role$/i);
      if (request.method === 'GET' && roleMatch) return json(await coordinator(env, roleMatch[1]).roleStatus(await sha256(bearer(request))), 200, origin);
      const moderationMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/moderation-history$/i);
      if (request.method === 'GET' && moderationMatch) return json({ events: await coordinator(env, moderationMatch[1]).moderationHistory(await sha256(bearer(request))) }, 200, origin);
      const roleChangeMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/participants\/([^/]+)\/role$/i);
      if (request.method === 'POST' && roleChangeMatch) {
        const body = await readBody(request); const role = body.role; if (role !== 'participant' && role !== 'cohost') return json({ error: 'Função inválida.' }, 400, origin);
        await coordinator(env, roleChangeMatch[1]).setRole(await sha256(bearer(request)), clean(decodeURIComponent(roleChangeMatch[2]), 128), role);
        return json({ ok: true, role }, 200, origin);
      }
      const transferMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/participants\/([^/]+)\/transfer$/i);
      if (request.method === 'POST' && transferMatch) {
        await coordinator(env, transferMatch[1]).transfer(await sha256(bearer(request)), clean(decodeURIComponent(transferMatch[2]), 128));
        return json({ ok: true }, 200, origin);
      }
      const permissionsMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/participants\/([^/]+)\/permissions$/i);
      if (request.method === 'POST' && permissionsMatch) {
        const body = await readBody(request); const permissions = body.permissions as Partial<MemberPermissions>;
        if (!permissions || ['microphone','camera','chat','screen'].some((key) => typeof permissions[key as keyof MemberPermissions] !== 'boolean')) return json({ error: 'Permissões inválidas.' }, 400, origin);
        const normalized = permissions as MemberPermissions; const identity = clean(decodeURIComponent(permissionsMatch[2]), 128);
        await coordinator(env, permissionsMatch[1]).setPermissions(await sha256(bearer(request)), identity, normalized);
        const sources = [...(normalized.microphone ? ['MICROPHONE'] : []), ...(normalized.camera ? ['CAMERA'] : []), ...(normalized.screen ? ['SCREEN_SHARE', 'SCREEN_SHARE_AUDIO'] : [])];
        await roomService(env, permissionsMatch[1], 'UpdateParticipant', { room: permissionsMatch[1], identity, permission: { can_subscribe: true, can_publish: sources.length > 0, can_publish_data: normalized.chat, can_publish_sources: sources, can_update_metadata: true } });
        return json({ ok: true, permissions: normalized }, 200, origin);
      }
      const pendingMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/requests$/i);
      if (request.method === 'GET' && pendingMatch) return json({ requests: await coordinator(env, pendingMatch[1]).pending(await sha256(bearer(request))) }, 200, origin);
      const decisionMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/requests\/([0-9a-f-]+)\/(admit|deny)$/i);
      if (request.method === 'POST' && decisionMatch) {
        const decision = decisionMatch[3] === 'admit' ? 'approved' : 'denied';
        const changed = await coordinator(env, decisionMatch[1]).decide(await sha256(bearer(request)), decisionMatch[2], decision);
        return changed ? json({ ok: true }, 200, origin) : json({ error: 'Solicitação não encontrada.' }, 404, origin);
      }
      const closeMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/close$/i);
      if (request.method === 'POST' && closeMatch) { await coordinator(env, closeMatch[1]).close(await sha256(bearer(request))); await roomService(env, closeMatch[1], 'DeleteRoom', { room: closeMatch[1] }); return json({ ok: true }, 200, origin); }
      const settingsMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/settings$/i);
      if (request.method === 'POST' && settingsMatch) { const body = await readBody(request); if (typeof body.locked !== 'boolean') return json({ error: 'Configuração inválida.' }, 400, origin); const locked = await coordinator(env, settingsMatch[1]).setLocked(await sha256(bearer(request)), body.locked); return json({ ok: true, locked }, 200, origin); }
      const participantMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9-]+)\/participants\/([^/]+)\/(remove|mute)$/i);
      if (request.method === 'POST' && participantMatch) {
        const room = participantMatch[1]; const identity = clean(decodeURIComponent(participantMatch[2]), 128); const action = participantMatch[3] as 'remove' | 'mute';
        await coordinator(env, room).adminAuthorized(await sha256(bearer(request)));
        if (!identity) return json({ error: 'Participante inválido.' }, 400, origin);
        if (action === 'remove') await roomService(env, room, 'RemoveParticipant', { room, identity });
        else { const body = await readBody(request); const trackSid = clean(body.trackSid, 128); if (!/^TR_[a-z0-9]+$/i.test(trackSid)) return json({ error: 'Faixa de áudio inválida.' }, 400, origin); await roomService(env, room, 'MutePublishedTrack', { room, identity, track_sid: trackSid, muted: true }); }
        await coordinator(env, room).recordParticipantAction(await sha256(bearer(request)), action, identity);
        return json({ ok: true }, 200, origin);
      }
      return json({ error: 'Rota não encontrada.' }, 404, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'; console.error(JSON.stringify({ event: 'api_error', path: url.pathname, message }));
      if (message === 'UNAUTHORIZED') return json({ error: 'Ação permitida apenas à equipe de moderação.' }, 403, origin);
      if (message === 'HOST_REQUIRED') return json({ error: 'Ação permitida apenas ao anfitrião principal.' }, 403, origin);
      if (message === 'MEMBER_NOT_FOUND') return json({ error: 'Participante não encontrado ou ainda não autenticado.' }, 404, origin);
      if (message === 'HOST_PERMISSIONS') return json({ error: 'As permissões do anfitrião principal não podem ser limitadas.' }, 409, origin);
      if (message === 'CHAT_BLOCKED') return json({ error: 'O chat foi bloqueado para você pelo anfitrião.' }, 403, origin);
      return json({ error: message === 'BODY_TOO_LARGE' ? 'Requisição muito grande.' : 'Não foi possível processar a solicitação.' }, 400, origin);
    }
  }
} satisfies ExportedHandler<Env>;
