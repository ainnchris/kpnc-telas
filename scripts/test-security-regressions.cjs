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
assert(!worker.includes('roomAdmin: host'),'browser token must not receive server administration privileges');
assert.match(html,/integrity="sha384-[A-Za-z0-9+/=]+"/,'third-party runtime must use SRI');
assert.match(headers,/Content-Security-Policy:/,'published site must define a CSP');
assert.match(headers,/frame-ancestors 'none'/,'published site must block framing');

console.log('PASS: admission secrets, privilege scope, waiting-room limit, SRI and security headers');
