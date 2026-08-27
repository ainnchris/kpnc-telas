type Env = { LIVEKIT_URL: string; LIVEKIT_API_KEY: string; LIVEKIT_API_SECRET: string; ALLOWED_ORIGINS?: string };
const encoder = new TextEncoder();
const MAX_BODY_BYTES = 4096;
const DEFAULT_ORIGINS = ['https://kpnc-meet.pages.dev', 'http://localhost:3000', 'http://localhost:8788'];

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const configured = (env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_ORIGINS;
  if (allowed.includes(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.kpnc-meet\.pages\.dev$/i.test(origin)) return origin;
  return null;
}
function headers(origin: string | null): HeadersInit { return { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin || DEFAULT_ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' } }
function json(data: unknown, status: number, origin: string | null): Response { return new Response(JSON.stringify(data), { status, headers: headers(origin) }) }
function clean(value: unknown, max: number): string { return typeof value === 'string' ? value.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, max) : '' }
function roomCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const part = (start: number) => Array.from(bytes.slice(start, start + 4), (byte) => alphabet[byte % alphabet.length]).join('');
  return `${part(0)}-${part(4)}-${part(8)}`;
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  const body = await request.text();
  if (encoder.encode(body).byteLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  return JSON.parse(body) as Record<string, unknown>;
}
function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function encodePart(value: unknown): string { return base64Url(encoder.encode(JSON.stringify(value))) }
async function issueToken(env: Env, room: string, name: string, host: boolean): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const identity = `${host ? 'host' : 'guest'}-${crypto.randomUUID()}`;
  const header = encodePart({ alg: 'HS256', typ: 'JWT' });
  const payload = encodePart({
    exp: now + (6 * 60 * 60), iss: env.LIVEKIT_API_KEY, nbf: now - 5, sub: identity, name,
    metadata: JSON.stringify({ host }),
    video: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: host }
  });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.LIVEKIT_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    if (request.headers.has('Origin') && !origin) return json({ error: 'Origem não permitida.' }, 403, null);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true }, 200, origin);
    if (request.method !== 'POST' || !['/api/rooms', '/api/token'].includes(url.pathname)) return json({ error: 'Rota não encontrada.' }, 404, origin);
    try {
      const body = await readBody(request); const name = clean(body.name, 48);
      if (name.length < 2) return json({ error: 'Informe um nome com pelo menos 2 caracteres.' }, 400, origin);
      const room = url.pathname === '/api/rooms' ? roomCode() : clean(body.room, 64).toLowerCase();
      if (!/^[a-z0-9-]{6,64}$/.test(room)) return json({ error: 'Código de reunião inválido.' }, 400, origin);
      const host = url.pathname === '/api/rooms';
      return json({ token: await issueToken(env, room, name, host), url: env.LIVEKIT_URL, room, host }, 200, origin);
    } catch (error) {
      console.error(JSON.stringify({ event: 'token_error', message: error instanceof Error ? error.message : 'unknown' }));
      return json({ error: error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 'Requisição muito grande.' : 'Não foi possível entrar na reunião.' }, 400, origin);
    }
  }
} satisfies ExportedHandler<Env>;

