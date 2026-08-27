(() => {
  'use strict';
  const LK = window.LivekitClient;
  const API = window.KPNC_API_URL || 'https://kpnc-meet-api.workers.dev';
  const $ = (selector) => document.querySelector(selector);
  const state = { mode: 'join', roomCode: '', preview: null, micOn: true, cameraOn: true, room: null, panel: 'people' };
  const el = { home: $('#home'), preview: $('#preview'), meeting: $('#meeting'), code: $('#room-code'), join: $('#join-meeting'), name: $('#display-name'), video: $('#preview-video'), avatar: $('#preview-avatar'), grid: $('#grid'), panel: $('#panel'), people: $('#people-list'), messages: $('#messages') };

  function show(screen) { [el.home, el.preview, el.meeting].forEach((node) => node.classList.toggle('hidden', node !== screen)); }
  function error(id, message = '') { $(id).textContent = message; }
  function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(node.timer); node.timer = setTimeout(() => node.classList.remove('show'), 2800); }
  function initials(name = 'K') { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
  function normalizeCode(value) { const text = value.trim(); try { const url = new URL(text); return (url.searchParams.get('room') || url.pathname.split('/').filter(Boolean).pop() || '').toLowerCase(); } catch { return text.toLowerCase().replace(/[^a-z0-9-]/g, ''); } }
  function stopPreview() { state.preview?.getTracks().forEach((track) => track.stop()); state.preview = null; el.video.srcObject = null; }
  async function startPreview() {
    stopPreview();
    try {
      state.preview = await navigator.mediaDevices.getUserMedia({ video: state.cameraOn, audio: state.micOn ? { echoCancellation: true, noiseSuppression: true } : false });
      el.video.srcObject = state.preview; el.video.classList.toggle('hidden', !state.cameraOn); el.avatar.classList.toggle('show', !state.cameraOn);
    } catch (cause) {
      state.cameraOn = false; state.micOn = false; el.video.classList.add('hidden'); el.avatar.classList.add('show');
      toast('Câmera e microfone estão bloqueados. Você ainda pode entrar.');
    }
    syncPreviewButtons();
  }
  function syncPreviewButtons() { $('#preview-mic').classList.toggle('off', !state.micOn); $('#preview-camera').classList.toggle('off', !state.cameraOn); }
  async function openPreview(mode, code = '') {
    state.mode = mode; state.roomCode = code; error('#home-error'); show(el.preview);
    $('#preview-room-label').textContent = mode === 'create' ? 'Uma nova reunião será criada para você.' : `Reunião: ${code}`;
    el.name.value = localStorage.getItem('kpnc-name') || ''; el.avatar.textContent = initials(el.name.value); await startPreview(); el.name.focus();
  }
  async function requestToken() {
    const name = el.name.value.trim(); if (name.length < 2) throw new Error('Digite um nome com pelo menos 2 caracteres.');
    localStorage.setItem('kpnc-name', name); const path = state.mode === 'create' ? '/api/rooms' : '/api/token'; const body = state.mode === 'create' ? { name } : { name, room: state.roomCode };
    const response = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Não foi possível acessar a reunião.'); return data;
  }
  async function enter() {
    const button = $('#enter-room'); button.disabled = true; button.textContent = 'Entrando…'; error('#preview-error');
    try { const auth = await requestToken(); stopPreview(); await connect(auth); }
    catch (cause) { const message = cause instanceof TypeError ? 'A API da reunião ainda não está disponível. Verifique o deploy do Worker.' : cause instanceof Error ? cause.message : 'Não foi possível entrar.'; error('#preview-error', message); button.disabled = false; button.textContent = 'Participar agora'; }
  }
  async function connect(auth) {
    const room = new LK.Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true, reconnectPolicy: new LK.DefaultReconnectPolicy() }); state.room = room;
    room.on(LK.RoomEvent.TrackSubscribed, renderTrack).on(LK.RoomEvent.TrackUnsubscribed, removeTrack).on(LK.RoomEvent.TrackMuted, renderAll).on(LK.RoomEvent.TrackUnmuted, renderAll).on(LK.RoomEvent.ParticipantConnected, renderAll).on(LK.RoomEvent.ParticipantDisconnected, renderAll).on(LK.RoomEvent.LocalTrackPublished, renderAll).on(LK.RoomEvent.LocalTrackUnpublished, renderAll).on(LK.RoomEvent.ConnectionStateChanged, connectionChanged).on(LK.RoomEvent.Reconnecting, () => connectionChanged('reconnecting')).on(LK.RoomEvent.Reconnected, () => connectionChanged('connected')).on(LK.RoomEvent.DataReceived, receiveData).on(LK.RoomEvent.Disconnected, () => leave(false));
    await room.connect(auth.url, auth.token, { autoSubscribe: true }); state.roomCode = auth.room;
    history.replaceState({}, '', `${location.pathname}?room=${encodeURIComponent(auth.room)}`); $('#meeting-code').textContent = auth.room; $('#footer-code').textContent = auth.room; show(el.meeting); connectionChanged('connected');
    if (state.micOn) await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true });
    if (state.cameraOn) await room.localParticipant.setCameraEnabled(true); renderAll();
  }
  function participants() { return state.room ? [state.room.localParticipant, ...state.room.remoteParticipants.values()] : []; }
  function pubs(participant) { return [...participant.trackPublications.values()].filter((publication) => publication.kind === LK.Track.Kind.Video); }
  function renderAll() { if (!state.room) return; renderGrid(); renderPeople(); syncControls(); }
  function renderGrid() {
    const existing = new Map([...el.grid.children].map((node) => [node.dataset.key, node])); const wanted = new Set();
    participants().forEach((participant) => {
      const videoPubs = pubs(participant).filter((publication) => publication.track && !publication.isMuted);
      if (!videoPubs.length) upsertTile(participant, null, existing, wanted); else videoPubs.forEach((publication) => upsertTile(participant, publication, existing, wanted));
    }); existing.forEach((node, key) => { if (!wanted.has(key)) node.remove(); });
  }
  function upsertTile(participant, publication, existing, wanted) {
    const key = `${participant.identity}:${publication?.trackSid || 'avatar'}`; wanted.add(key); let tile = existing.get(key);
    if (!tile) { tile = document.createElement('article'); tile.className = 'tile'; tile.dataset.key = key; el.grid.appendChild(tile); }
    const isScreen = publication?.source === LK.Track.Source.ScreenShare; tile.classList.toggle('screen', isScreen); tile.replaceChildren();
    if (publication?.track) { const media = publication.track.attach(); media.autoplay = true; media.playsInline = true; tile.appendChild(media); }
    else { const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = initials(participant.name || participant.identity); tile.appendChild(avatar); }
    const label = document.createElement('span'); label.className = 'name'; label.textContent = `${participant.name || 'Participante'}${participant === state.room.localParticipant ? ' (você)' : ''}${isScreen ? ' — apresentação' : ''}`; tile.appendChild(label);
    const mic = participant.getTrackPublication?.(LK.Track.Source.Microphone); if (!mic || mic.isMuted) { const muted = document.createElement('span'); muted.className = 'muted'; muted.textContent = '●'; muted.title = 'Microfone desligado'; tile.appendChild(muted); }
  }
  function renderTrack(track) { if (track.kind === LK.Track.Kind.Audio) { const media = track.attach(); media.dataset.lkAudio = track.sid; document.body.appendChild(media); media.play().catch(() => toast('Toque na tela para liberar o áudio.')); } renderAll(); }
  function removeTrack(track) { track.detach().forEach((element) => element.remove()); renderAll(); }
  function renderPeople() { const list = participants(); $('#participant-count').textContent = String(list.length); el.people.replaceChildren(...list.map((person) => { const row = document.createElement('div'); row.className = 'person'; const avatar = document.createElement('div'); avatar.className = 'person-avatar'; avatar.textContent = initials(person.name || person.identity); const name = document.createElement('span'); name.textContent = `${person.name || 'Participante'}${person === state.room.localParticipant ? ' (você)' : ''}`; row.append(avatar, name); return row; })); }
  function connectionChanged(value) { const node = $('#connection'); const connected = value === 'connected'; node.classList.toggle('online', connected); node.textContent = connected ? 'Conectado' : value === 'reconnecting' ? 'Reconectando…' : 'Conectando…'; }
  function syncControls() { if (!state.room) return; const local = state.room.localParticipant; $('#mic').classList.toggle('off', !local.isMicrophoneEnabled); $('#camera').classList.toggle('off', !local.isCameraEnabled); $('#screen').classList.toggle('off', !local.isScreenShareEnabled); }
  async function toggleSource(source) { if (!state.room) return; try { const local = state.room.localParticipant; if (source === 'mic') await local.setMicrophoneEnabled(!local.isMicrophoneEnabled, { echoCancellation: true, noiseSuppression: true }); if (source === 'camera') await local.setCameraEnabled(!local.isCameraEnabled); if (source === 'screen') await local.setScreenShareEnabled(!local.isScreenShareEnabled, { audio: true }); renderAll(); } catch { toast(source === 'screen' ? 'O compartilhamento foi cancelado.' : 'Não foi possível acessar este dispositivo.'); } }
  async function sendMessage(event) { event.preventDefault(); const input = $('#chat-input'); const text = input.value.trim(); if (!text || !state.room) return; const payload = new TextEncoder().encode(JSON.stringify({ text, name: state.room.localParticipant.name || 'Você', at: Date.now() })); await state.room.localParticipant.publishData(payload, { reliable: true, topic: 'chat' }); addMessage({ text, name: 'Você' }); input.value = ''; }
  function receiveData(payload, participant, _kind, topic) { if (topic !== 'chat') return; try { const message = JSON.parse(new TextDecoder().decode(payload)); addMessage({ text: String(message.text || '').slice(0, 500), name: participant?.name || message.name || 'Participante' }); } catch { /* ignore malformed data */ } }
  function addMessage(message) { const node = document.createElement('div'); node.className = 'message'; const author = document.createElement('strong'); author.textContent = message.name; const text = document.createElement('span'); text.textContent = message.text; node.append(author, text); el.messages.appendChild(node); el.messages.scrollTop = el.messages.scrollHeight; }
  function openPanel(name) { state.panel = name; el.panel.classList.add('open'); document.querySelectorAll('.panel-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.panel === name)); $('#people-panel').classList.toggle('hidden', name !== 'people'); $('#chat-panel').classList.toggle('hidden', name !== 'chat'); }
  function leave(goHome = true) { const room = state.room; state.room = null; room?.disconnect(); document.querySelectorAll('[data-lk-audio]').forEach((node) => node.remove()); if (goHome) { history.replaceState({}, '', location.pathname); show(el.home); } }

  $('#new-meeting').onclick = () => openPreview('create'); el.code.oninput = () => { const code = normalizeCode(el.code.value); el.join.disabled = code.length < 6; }; el.join.onclick = () => { const code = normalizeCode(el.code.value); if (code.length >= 6) openPreview('join', code); };
  $('#preview-back').onclick = () => { stopPreview(); show(el.home); }; $('#preview-mic').onclick = async () => { state.micOn = !state.micOn; await startPreview(); }; $('#preview-camera').onclick = async () => { state.cameraOn = !state.cameraOn; await startPreview(); }; el.name.oninput = () => { el.avatar.textContent = initials(el.name.value); }; $('#enter-room').onclick = enter;
  $('#mic').onclick = () => toggleSource('mic'); $('#camera').onclick = () => toggleSource('camera'); $('#screen').onclick = () => toggleSource('screen'); $('#leave').onclick = () => leave(); $('#copy-link').onclick = async () => { await navigator.clipboard.writeText(location.href); toast('Link da reunião copiado.'); };
  $('#participants-toggle').onclick = () => openPanel('people'); $('#chat-toggle').onclick = () => openPanel('chat'); $('#close-panel').onclick = () => el.panel.classList.remove('open'); document.querySelectorAll('.panel-tabs button').forEach((button) => button.onclick = () => openPanel(button.dataset.panel)); $('#chat-form').onsubmit = sendMessage;
  setInterval(() => { const now = new Date(); $('#clock').textContent = now.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }); $('#meeting-time').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }, 1000);
  const queryRoom = normalizeCode(new URLSearchParams(location.search).get('room') || ''); if (queryRoom) { el.code.value = queryRoom; el.join.disabled = false; }
  window.addEventListener('beforeunload', () => { stopPreview(); state.room?.disconnect(); });
})();
