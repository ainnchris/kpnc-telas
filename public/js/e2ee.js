(() => {
  'use strict';

  const WORKER_URL = 'https://cdn.jsdelivr.net/npm/livekit-client@2.22.1/dist/livekit-client.e2ee.worker.js';
  const WORKER_SHA256 = 'qs8+jsKShvme1TDS+UaNggdRC3S8iJ1/KZQm121R8J4=';
  const KEY_PATTERN = /^[A-Za-z0-9_-]{32}$/;

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  function generateKey() {
    if (!globalThis.crypto?.getRandomValues) throw new Error('Este dispositivo não oferece geração segura de chaves.');
    return bytesToBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(24)));
  }

  function isValidKey(value) {
    return KEY_PATTERN.test(String(value || '').trim());
  }

  async function fingerprint(value) {
    if (!isValidKey(value) || !globalThis.crypto?.subtle) return '';
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim())));
    return Array.from(digest.slice(0, 6), byte => byte.toString(16).padStart(2, '0')).join('').match(/.{1,4}/g).join('-').toUpperCase();
  }

  function supported() {
    const lk = globalThis.LivekitClient;
    return !!(globalThis.Worker && globalThis.Blob && globalThis.URL?.createObjectURL && globalThis.crypto?.subtle && lk?.ExternalE2EEKeyProvider && lk?.isE2EESupported?.());
  }

  async function verifiedWorker() {
    const response = await fetch(WORKER_URL, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) throw new Error('O componente de criptografia não pôde ser carregado.');
    const source = await response.arrayBuffer();
    if (source.byteLength < 10_000 || source.byteLength > 512_000) throw new Error('O componente de criptografia tem tamanho inesperado.');
    const digest = bytesToBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', source))).replace(/-/g, '+').replace(/_/g, '/');
    if (`${digest}${'='.repeat((4 - digest.length % 4) % 4)}` !== WORKER_SHA256) throw new Error('O componente de criptografia não passou na verificação de integridade.');
    const objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    return { worker: new Worker(objectUrl, { name: 'kpnc-livekit-e2ee-2.22.1' }), objectUrl };
  }

  async function createRoomOptions(key) {
    if (!supported()) throw new Error('Este navegador não oferece os recursos necessários para a criptografia ponta a ponta.');
    if (!isValidKey(key)) throw new Error('Informe a chave de 32 caracteres da reunião criptografada.');
    const loaded = await verifiedWorker();
    try {
      const keyProvider = new LivekitClient.ExternalE2EEKeyProvider({ keySize: 128 });
      await keyProvider.setKey(key.trim());
      return {
        options: { e2ee: { keyProvider, worker: loaded.worker } },
        dispose() {
          loaded.worker.terminate();
          URL.revokeObjectURL(loaded.objectUrl);
        },
      };
    } catch (error) {
      loaded.worker.terminate();
      URL.revokeObjectURL(loaded.objectUrl);
      throw error;
    }
  }

  globalThis.MeetE2EE = Object.freeze({ generateKey, isValidKey, fingerprint, supported, createRoomOptions });
})();
