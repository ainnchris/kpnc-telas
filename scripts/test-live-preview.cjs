const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const site = process.env.KPNC_PREVIEW_SITE || 'https://feat-meet-next.kpnc-meet.pages.dev';
const deploymentTimeout = Number(process.env.KPNC_PREVIEW_DEPLOY_TIMEOUT || 360_000);

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDeployment() {
  const deadline = Date.now() + deploymentTimeout;
  let lastError = 'versão nova ainda não encontrada';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${site}/js/app.js?revision=${Date.now()}`, { cache: 'no-store' });
      const source = await response.text();
      if (response.ok && source.includes('function inviteURL(code)') && source.includes('location.origin')) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await pause(10_000);
  }
  throw new Error(`A prévia do Pages não recebeu a revisão esperada: ${lastError}`);
}

async function context(browser) {
  return browser.newContext({
    permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
    viewport: { width: 1280, height: 820 },
  });
}

async function captureRoom(page) {
  await page.evaluate(() => {
    const LiveKitRoom = window.LivekitClient.Room;
    window.LivekitClient.Room = class TestableRoom extends LiveKitRoom {
      constructor(...args) {
        super(...args);
        window.__kpncLiveRoom = this;
      }
    };
  });
}

async function openPreview(page, mode, name, key = '') {
  await page.locator(mode === 'create' ? '#new-meeting' : '#join-meeting').click();
  await page.locator('#preview').waitFor({ state: 'visible' });
  await page.locator('#display-name').fill(name);
  await page.locator('#e2ee-toggle').check();
  await page.locator('#e2ee-fields').waitFor({ state: 'visible' });
  if (mode === 'join') await page.locator('#e2ee-key').fill(key);
}

(async () => {
  await waitForDeployment();
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE,
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-dev-shm-usage',
    ],
  });
  let host;
  try {
    const hostContext = await context(browser);
    const guestContext = await context(browser);
    host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const pageErrors = [];
    for (const page of [host, guest]) {
      page.on('pageerror', error => pageErrors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
    }

    await host.goto(site, { waitUntil: 'domcontentloaded' });
    await captureRoom(host);
    await openPreview(host, 'create', 'Anfitrião automático');
    const key = await host.locator('#e2ee-key').inputValue();
    assert.match(key, /^[A-Za-z0-9_-]{32}$/);
    await host.locator('#enter-room').click();
    await host.locator('#meeting').waitFor({ state: 'visible', timeout: 45_000 });
    await assert.doesNotReject(() => host.locator('#connection').waitFor({ state: 'visible' }));
    assert.match(await host.locator('#connection').innerText(), /^E2EE/);

    const room = (await host.locator('#meeting-code').innerText()).trim();
    assert.match(room, /^[a-z0-9-]{6,64}$/);
    await host.locator('#copy-link').click();
    const invite = await host.evaluate(() => navigator.clipboard.readText());
    assert.equal(invite, `${site}/?room=${encodeURIComponent(room)}`);

    await guest.goto(invite, { waitUntil: 'domcontentloaded' });
    await captureRoom(guest);
    assert.equal(await guest.locator('#room-code').inputValue(), room);
    await openPreview(guest, 'join', 'Convidado automático', key);
    await guest.locator('#enter-room').click();
    await guest.locator('#waiting').waitFor({ state: 'visible' });

    const admit = host.locator('#admission-list .admit').first();
    await admit.waitFor({ state: 'visible', timeout: 20_000 });
    await admit.click();
    await guest.locator('#meeting').waitFor({ state: 'visible', timeout: 45_000 });

    await host.waitForFunction(() => document.querySelector('#participant-count')?.textContent === '2', null, { timeout: 30_000 });
    await guest.waitForFunction(() => document.querySelector('#participant-count')?.textContent === '2', null, { timeout: 30_000 });
    await host.waitForFunction(() => document.querySelectorAll('#grid video').length >= 2, null, { timeout: 30_000 });
    await guest.waitForFunction(() => document.querySelectorAll('#grid video').length >= 2, null, { timeout: 30_000 });
    assert.match(await guest.locator('#connection').innerText(), /^E2EE/);

    await guest.evaluate(() => {
      window.__kpncReconnect = window.__kpncLiveRoom.simulateScenario('signal-reconnect');
    });
    await guest.waitForFunction(() => /Reconectando|perdida/i.test(document.querySelector('#connection')?.textContent || ''), null, { timeout: 30_000 });
    await guest.waitForFunction(() => /^E2EE.*Conexão|^E2EE.*Conectado/i.test(document.querySelector('#connection')?.textContent || ''), null, { timeout: 45_000 });

    assert.deepEqual(pageErrors, []);
    console.log(`PASS: chamada E2EE real, convite isolado, dois participantes, mídia e reconexão (${room})`);
  } finally {
    if (host && await host.locator('#end-for-all').isVisible().catch(() => false)) {
      await host.locator('#end-for-all').click().catch(() => {});
      await pause(1_000);
    }
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
