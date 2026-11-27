(() => {
  'use strict';
  // Transmissão de tela estilo "Go Live": o usuário escolhe resolução, fps,
  // prioridade (nitidez x fluidez) e áudio antes de começar. O navegador
  // continua responsável por mostrar o seletor de tela/janela/guia.
  const $ = s => document.querySelector(s);
  const STORE = 'kpnc-share';
  const SIZES = { '720': [1280, 720], '1080': [1920, 1080], '1440': [2560, 1440] };
  const LABEL = { '720': '720p', '1080': '1080p', '1440': '1440p' };
  // Taxas máximas de envio (bits/s) por resolução e quadros por segundo.
  const BITRATE = {
    '720': { 15: 1.5e6, 30: 2.5e6, 60: 4e6 },
    '1080': { 15: 3e6, 30: 5e6, 60: 8e6 },
    '1440': { 15: 5e6, 30: 8e6, 60: 12e6 }
  };
  const PRESETS = {
    text: { res: '1080', fps: 15, hint: 'detail' },
    balanced: { res: '720', fps: 30, hint: 'detail' },
    motion: { res: '720', fps: 60, hint: 'motion' }
  };
  const DEFAULTS = { surface: 'monitor', res: '720', fps: 30, hint: 'detail', audio: true };
  const ALLOWED = { surface: ['monitor', 'window', 'browser'], res: Object.keys(SIZES), fps: [15, 30, 60], hint: ['detail', 'motion'] };

  let ctx = { room: () => null, toast: () => {}, changed: () => {} };
  let settings = load();
  let live = null; // configuração usada na transmissão em andamento
  let busy = false;

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
      const out = { ...DEFAULTS };
      for (const key of Object.keys(ALLOWED)) if (ALLOWED[key].includes(saved[key])) out[key] = saved[key];
      if (typeof saved.audio === 'boolean') out.audio = saved.audio;
      return out;
    } catch { return { ...DEFAULTS }; }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* opcional */ } }

  const supported = () => !!navigator.mediaDevices?.getDisplayMedia;
  const mbps = n => (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

  function paint() {
    const dialog = $('#share-dialog');
    dialog.querySelectorAll('.seg').forEach(seg => {
      const current = String(settings[seg.dataset.key]);
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === current)));
    });
    dialog.querySelectorAll('.presets button').forEach(b => {
      const p = PRESETS[b.dataset.preset];
      b.setAttribute('aria-pressed', String(p.res === settings.res && p.fps === settings.fps && p.hint === settings.hint));
    });
    $('#share-audio').checked = settings.audio;
    const rate = BITRATE[settings.res][settings.fps];
    $('#share-estimate').textContent = `Envio de até ${mbps(rate)} Mb/s. Se a sua internet não aguentar, o vídeo perde qualidade automaticamente.`;
  }

  function open() {
    if (!ctx.room()) return;
    if (!supported()) { ctx.toast('Este navegador ou aparelho não permite transmitir a tela. Use o computador.'); return; }
    $('#border-tip').classList.toggle('hidden', !/Windows/i.test(navigator.userAgent));
    paint();
    $('#share-dialog').showModal();
  }

  async function start() {
    const room = ctx.room();
    if (!room || busy) return;
    busy = true;
    const chosen = { ...settings };
    const [width, height] = SIZES[chosen.res];
    const lp = room.localParticipant;
    const capture = {
      audio: chosen.audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
      video: { displaySurface: chosen.surface },
      resolution: { width, height, frameRate: chosen.fps },
      contentHint: chosen.hint,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
      systemAudio: chosen.audio ? 'include' : 'exclude'
    };
    const publish = {
      screenShareEncoding: { maxBitrate: BITRATE[chosen.res][chosen.fps], maxFramerate: chosen.fps },
      degradationPreference: chosen.hint === 'motion' ? 'maintain-framerate' : 'maintain-resolution'
    };
    try {
      if (lp.isScreenShareEnabled) await lp.setScreenShareEnabled(false);
      const pub = await lp.setScreenShareEnabled(true, capture, publish);
      if (pub?.track) { try { pub.track.mediaStreamTrack.contentHint = chosen.hint; } catch { /* opcional */ } }
      live = chosen;
    } catch (e) {
      live = null;
      // Cancelar o seletor do navegador não é erro.
      if (!['NotAllowedError', 'AbortError'].includes(e?.name)) {
        ctx.toast(e?.name === 'NotFoundError' ? 'Nenhuma tela ou janela disponível para transmitir.' : 'Não foi possível transmitir: ' + (e?.message || 'verifique a permissão de captura.'));
      }
    } finally {
      busy = false;
      ctx.changed();
    }
  }

  async function stop() {
    const room = ctx.room();
    if (!room) return;
    try { await room.localParticipant.setScreenShareEnabled(false); } catch { /* já encerrada */ }
    live = null;
    ctx.changed();
  }

  function describe(viewers) {
    const cfg = live || settings;
    const parts = [`${LABEL[cfg.res]} · ${cfg.fps} fps`];
    if (live?.audio) parts.push('com áudio');
    parts.push(viewers ? `${viewers} ${viewers === 1 ? 'pessoa' : 'pessoas'} na sala` : 'ninguém mais na sala');
    return parts.join(' · ');
  }

  function install(options) {
    ctx = { ...ctx, ...options };
    const dialog = $('#share-dialog');
    dialog.addEventListener('click', event => {
      const seg = event.target.closest('.seg button');
      if (seg) {
        const key = seg.parentElement.dataset.key, raw = seg.dataset.value;
        settings[key] = key === 'fps' ? Number(raw) : raw;
        save(); paint(); return;
      }
      const preset = event.target.closest('.presets button');
      if (preset) { Object.assign(settings, PRESETS[preset.dataset.preset]); save(); paint(); }
    });
    $('#share-audio').addEventListener('change', e => { settings.audio = e.target.checked; save(); paint(); });
    $('#share-start').addEventListener('click', () => { dialog.close(); void start(); });
    // Esc / fundo do diálogo: não faz nada além de fechar.
  }

  window.MeetShare = { install, open, stop, describe, isLive: () => !!live, supported };
})();
