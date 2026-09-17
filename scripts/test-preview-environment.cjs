const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const production=read('worker/wrangler.jsonc');
const preview=read('worker/wrangler.preview.jsonc');
const worker=read('worker/src/index.ts');
const runtime=read('public/js/runtime-config.js');
const html=read('public/index.html');
const headers=read('public/_headers');
const mobile=read('apps/mobile/src/api.ts');
const desktopPolicy=read('apps/desktop/policy.cjs');
const desktopMain=read('apps/desktop/main.cjs');

assert(production.includes('"name": "kpnc-meet-api"')&&production.includes('"ROOM_PREFIX": ""'),'production Worker identity must stay unchanged');
assert(preview.includes('"name": "kpnc-meet-api-preview"')&&preview.includes('"ROOM_PREFIX": "meet-next-preview-"'),'preview Worker must have isolated service and LiveKit room names');
assert(worker.includes('livekitRoom(env, room)'),'tokens and administrative calls must use the environment room prefix');
assert(runtime.includes("location.hostname === PREVIEW_HOST")&&!runtime.includes('includes(location.hostname)'),'web override must match only the exact branch hostname');
assert(html.indexOf('/js/runtime-config.js')<html.indexOf('/js/app.js'),'runtime configuration must load before the web client');
assert(headers.includes('https://kpnc-meet-api-preview.erikchristian2.workers.dev'),'CSP must allow the isolated preview API');
assert(mobile.includes('EXPO_PUBLIC_KPNC_API_URL')&&mobile.includes('EXPO_PUBLIC_KPNC_WEBSITE'),'mobile preview builds must be configurable without changing production defaults');
assert(desktopPolicy.includes('PREVIEW_SITE')&&desktopMain.includes("process.argv.includes('--meet-preview')"),'Windows must require an explicit preview flag');

console.log('PASS: production and preview environments remain explicitly separated');
