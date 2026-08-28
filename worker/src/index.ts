import { DurableObject } from 'cloudflare:workers';

const encoder = new TextEncoder();
const MAX_BODY_BYTES = 4096;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TTL_MS = 15 * 60 * 1000;
const DEFAULT_ORIGINS = ['https://kpnc-meet.pages.dev', 'http://localhost:3000', 'http://localhost:8788'];

type JoinStatus = 'waiting' | 'approved' | 'denied';
type JoinRequest = { id: string; name: string; secretHash: string; status: JoinStatus; createdAt: number };
type RoomState = { hostHash: string; createdAt: number; closed: boolean; requests: Record<string, JoinRequest> };

export class RoomCoordinator extends DurableObject<Env> {
  async create(hostHash: string): Promise<boolean> {
    const current = await this.ctx.storage.get<RoomState>('room');
    if (current && !current.closed && Date.now() - current.createdAt < ROOM_TTL_MS) return false;
    await this.ctx.storage.put('room', { hostHash, createdAt: Date.now(), closed: false, requests: {} } satisfies RoomState);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    return true;
  }
  async exists(): Promise<boolean> {
    const room = await this.ctx.storage.get<RoomState>('room');
    return !!room && !room.closed && Date.now() - room.createdAt < ROOM_TTL_MS;
  }
  async requestJoin(request: JoinRequest): Promise<'created' | 'missing'> {
    const room = await this.ctx.storage.get<RoomState>('room');
    if (!room || room.closed || Date.now() - room.createdAt >= ROOM_TTL_MS) return 'missing';
    room.requests[request.id] = request;
    this.prune(room);
    await this.ctx.storage.put('room', room);
    return 'created';
  }
  async requestStatus(id: string, secretHash: string): Promise<{ status: JoinStatus; name: string } | null> {
    const room = await this.ctx.storage.get<RoomState>('room');
    const item = room?.requests[id];
    if (!room || room.closed || !item || !secureEqual(item.secretHash, secretHash) || Date.now() - item.createdAt >= REQUEST_TTL_MS) return null;
    return { status: item.status, name: item.name };
  }
  async pending(hostHash: string): Promise<Array<{ id: string; name: string; createdAt: number }>> {
    const room = await this.authorize(hostHash);
    this.prune(room);
    await this.ctx.storage.put('room', room);
    return Object.values(room.requests).filter((item) => item.status === 'waiting').map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  }
  async decide(hostHash: string, id: string, decision: 'approved' | 'denied'): Promise<boolean> {
    const room = await this.authorize(hostHash);
    const item = room.requests[id];
    if (!item || item.status !== 'waiting') return false;
    item.status = decision;
    await this.ctx.storage.put('room', room);
    return true;
  }
  async close(hostHash: string): Promise<void> {
    const room = await this.authorize(hostHash);
    room.closed = true;
    room.requests = {};
    await this.ctx.storage.put('room', room);
  }
  async alarm(): Promise<void> { await this.ctx.storage.deleteAll(); }
  private async authorize(hostHash: string): Promise<RoomState> {
    const room = await this.ctx.storage.get<RoomState>('room');
    if (!room || room.closed || !secureEqual(room.hostHash, hostHash)) throw new Error('UNAUTHORIZED');
    return room;
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
function secureEqual(left: string, right: string): boolean { if (left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }
function base64Url(bytes: Uint8Array): string { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function randomToken(bytes = 24): string { return base64Url(crypto.getRandomValues(new Uint8Array(bytes))); }
function roomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; const bytes = crypto.getRandomValues(new Uint8Array(12));
  const part = (start: number) => Array.from(bytes.slice(start, start + 4), (byte) => alphabet[byte % alphabet.length]).join('');
  return `${part(0)}-${part(4)}-${part(8)}`;
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('Content-Length') || 0); if (length > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  const body = await request.text(); if (encoder.encode(body).byteLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  return JSON.parse(body) as Record<string, unknown>;
}
function encodePart(value: unknown): string { return base64Url(encoder.encode(JSON.stringify(value))); }
async function sha256(value: string): Promise<string> { return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function issueToken(env: Env, room: string, name: string, host: boolean): Promise<string> {
  const now = Math.floor(Date.now() / 1000); const identity = `${host ? 'host' : 'guest'}-${crypto.randomUUID()}`;
  const header = encodePart({ alg: 'HS256', typ: 'JWT' });
  const payload = encodePart({ exp: now + 6 * 60 * 60, iss: env.LIVEKIT_API_KEY, nbf: now - 5, sub: identity, name, metadata: JSON.stringify({ host }), video: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: host } });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.LIVEKIT_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
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
        const body = await readBody(request); const name = clean(body.name, 48);
        if (name.length < 2) return json({ error: 'Informe um nome com pelo menos 2 caracteres.' }, 400, origin);
        let room = ''; let hostKey = '';
        for (let attempt = 0; attempt < 5; attempt += 1) { room = roomCode(); hostKey = randomToken(); if (await coordinator(env, room).create(await sha256(hostKey))) break; room = ''; }
        if (!room) throw new Error('ROOM_CREATE_FAILED');
        return json({ token: await issueToken(env, room, name, true), url: env.LIVEKIT_URL, room, host: true, hostKey }, 201, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/join-requests') {
        const body = await readBody(request); const name = clean(body.name, 48); const room = clean(body.room, 64).toLowerCase();
        if (name.length < 2 || !/^[a-z0-9-]{6,64}$/.test(room)) return json({ error: 'Nome ou código inválido.' }, 400, origin);
        const id = crypto.randomUUID(); const secret = randomToken();
        const result = await coordinator(env, room).requestJoin({ id, name, secretHash: await sha256(secret), status: 'waiting', createdAt: Date.now() });
        if (result === 'missing') return json({ error: 'Esta reunião não existe ou já foi encerrada.', code: 'ROOM_NOT_FOUND' }, 404, origin);
        return json({ room, requestId: id, requestSecret: secret, status: 'waiting' }, 202, origin);
      }
      const statusMatch = url.pathname.match(/^\/api\/join-requests\/([0-9a-f-]+)$/i);
      if (request.method === 'GET' && statusMatch) {
        const room = clean(url.searchParams.get('room'), 64).toLowerCase(); const secret = clean(url.searchParams.get('secret'), 128);
        const status = await coordinator(env, room).requestStatus(statusMatch[1], await sha256(secret));
        if (!status) return json({ error: 'Solicitação expirada ou reunião encerrada.', code: 'REQUEST_EXPIRED' }, 404, origin);
        if (status.status !== 'approved') return json({ status: status.status }, 200, origin);
        return json({ status: 'approved', token: await issueToken(env, room, status.name, false), url: env.LIVEKIT_URL, room, host: false }, 200, origin);
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
      if (request.method === 'POST' && closeMatch) { await coordinator(env, closeMatch[1]).close(await sha256(bearer(request))); return json({ ok: true }, 200, origin); }
      return json({ error: 'Rota não encontrada.' }, 404, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown'; console.error(JSON.stringify({ event: 'api_error', path: url.pathname, message }));
      if (message === 'UNAUTHORIZED') return json({ error: 'Ação permitida apenas ao anfitrião.' }, 403, origin);
      return json({ error: message === 'BODY_TOO_LARGE' ? 'Requisição muito grande.' : 'Não foi possível processar a solicitação.' }, 400, origin);
    }
  }
} satisfies ExportedHandler<Env>;

