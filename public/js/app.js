(() => {
  'use strict';
  const LK = window.LivekitClient;
  const API = window.KPNC_API_URL || 'https://kpnc-meet-api.erikchristian2.workers.dev';
  const $ = (selector) => document.querySelector(selector);
  const state = { mode: 'join', roomCode: '', preview: null, micOn: true, cameraOn: true, room: null, isHost: false, hostKey: '', request: null, poll: 0, hostPoll: 0, raised: new Set() };
  const screens = [$('#home'), $('#preview'), $('#waiting'), $('#meeting')];
  const el = { code: $('#room-code'), join: $('#join-meeting'), name: $('#display-name'), video: $('#preview-video'), avatar: $('#preview-avatar'), grid: $('#grid'), panel: $('#panel'), people: $('#people-list'), messages: $('#messages'), waitingList: $('#waiting-list') };

  function show(screen) { screens.forEach((node) => node.classList.toggle('hidden', node !== screen)); }
  function toast(text) { const node = $('#toast'); node.textContent = text; node.classList.add('show'); setTimeout(() => node.classList.remove('show'), 2600); }
  function error(selector, text = '') { $(selector).textContent = text; }
  function initials(name = 'K') { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'K'; }
  function normalizeCode(value) { const text = value.trim(); try { const url = new URL(text); return (url.searchParams.get('room') || '').toLowerCase(); } catch { return text.toLowerCase().replace(/[^a-z0-9-]/g, ''); } }
  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const cause = new Error(data.error || 'Não foi possível concluir esta ação.'); cause.code = data.code; throw cause; }
    return data;
  }

  async function startPreview() {
    stopPreview();
    if (!state.cameraOn && !state.micOn) { el.avatar.classList.add('show'); syncPreviewButtons(); return; }
    try {
      state.preview = await navigator.mediaDevices.getUserMedia({ video: state.cameraOn, audio: state.micOn ? { echoCancellation: true, noiseSuppression: true } : false });
      el.video.srcObject = state.preview; el.video.classList.toggle('hidden', !state.cameraOn); el.avatar.classList.toggle('show', !state.cameraOn);
    } catch { state.cameraOn = false; state.micOn = false; el.avatar.classList.add('show'); error('#preview-error', 'Não foi possível acessar câmera ou microfone. Você ainda pode entrar sem eles.'); }
    syncPreviewButtons();
  }
  function stopPreview() { state.preview?.getTracks().forEach((track) => track.stop()); state.preview = null; el.video.srcObject = null; }
  function syncPreviewButtons() { $('#preview-mic').classList.toggle('off', !state.micOn); $('#preview-camera').classList.toggle('off', !state.cameraOn); }
  async function openPreview(mode, code = '') {
    state.mode = mode; state.roomCode = code; error('#home-error'); show($('#preview'));
    $('#preview-room-label').textContent = mode === 'create' ? 'Uma nova reunião será criada para você.' : `Reunião: ${code}`;
    el.name.value = localStorage.getItem('kpnc-name') || ''; el.avatar.textContent = initials(el.name.value); await startPreview();
  }

  async function enter() {
    const name = el.name.value.trim(); if (name.length < 2) return error('#preview-error', 'Informe seu nome.');
    localStorage.setItem('kpnc-name', name); const button = $('#enter-room'); button.disabled = true; button.textContent = state.mode === 'create' ? 'Criando…' : 'Solicitando…'; error('#preview-error');
    try {
      if (state.mode === 'create') {
        const auth = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ name }) });
        await connect(auth);
      } else {
        const request = await api('/api/join-requests', { method: 'POST', body: JSON.stringify({ name, room: state.roomCode }) });
        state.request = request; stopPreview(); show($('#waiting')); $('#waiting-message').textContent = `O anfitrião da reunião ${request.room} recebeu sua solicitação.`; pollAdmission();
      }
    } catch (cause) { error('#preview-error', cause instanceof Error ? cause.message : 'Não foi possível entrar.'); }
    finally { button.disabled = false; button.textContent = 'Participar agora'; }
  }
  function pollAdmission() {
    clearTimeout(state.poll); if (!state.request) return;
    state.poll = setTimeout(async () => {
      try {
        const { room, requestId, requestSecret } = state.request;
        const result = await api(`/api/join-requests/${requestId}?room=${encodeURIComponent(room)}&secret=${encodeURIComponent(requestSecret)}`);
        if (result.status === 'approved') { state.request = null; await connect(result); return; }
        if (result.status === 'denied') { state.request = null; $('#waiting-message').textContent = 'O anfitrião não autorizou sua entrada.'; return; }
        pollAdmission();
      } catch (cause) { state.request = null; $('#waiting-message').textContent = cause instanceof Error ? cause.message : 'A solicitação expirou.'; }
    }, 1600);
  }

  async function connect(auth) {
    stopPreview(); state.isHost = !!auth.host; state.hostKey = auth.hostKey || '';
    const room = new LK.Room({ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true, reconnectPolicy: new LK.DefaultReconnectPolicy() }); state.room = room;
    room.on(LK.RoomEvent.TrackSubscribed, renderTrack).on(LK.RoomEvent.TrackUnsubscribed, removeTrack).on(LK.RoomEvent.TrackMuted, renderAll).on(LK.RoomEvent.TrackUnmuted, renderAll).on(LK.RoomEvent.ParticipantConnected, renderAll).on(LK.RoomEvent.ParticipantDisconnected, renderAll).on(LK.RoomEvent.LocalTrackPublished, renderAll).on(LK.RoomEvent.LocalTrackUnpublished, renderAll).on(LK.RoomEvent.ConnectionStateChanged, connectionChanged).on(LK.RoomEvent.Reconnecting, () => connectionChanged('reconnecting')).on(LK.RoomEvent.Reconnected, () => connectionChanged('connected')).on(LK.RoomEvent.DataReceived, receiveData).on(LK.RoomEvent.Disconnected, () => leave(false));
    await room.connect(auth.url, auth.token, { autoSubscribe: true }); state.roomCode = auth.room;
    history.replaceState({}, '', `${location.pathname}?room=${encodeURIComponent(auth.room)}`); $('#meeting-code').textContent = auth.room; $('#footer-code').textContent = auth.room; $('#end-for-all').classList.toggle('hidden', !state.isHost); show($('#meeting')); connectionChanged('connected');
    if (state.micOn) await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true });
    if (state.cameraOn) await room.localParticipant.setCameraEnabled(true); renderAll(); if (state.isHost) pollPending();
  }
  function participants() { return state.room ? [state.room.localParticipant, ...state.room.remoteParticipants.values()] : []; }
  function videoPublications(person) { return [...person.trackPublications.values()].filter((publication) => publication.kind === LK.Track.Kind.Video); }
  function renderAll() { if (!state.room) return; renderGrid(); renderPeople(); syncControls(); }
  function renderGrid() {
    const existing = new Map([...el.grid.children].map((node) => [node.dataset.key, node])); const wanted = new Set();
    participants().forEach((person) => { const videos = videoPublications(person).filter((pub) => pub.track && !pub.isMuted); if (!videos.length) upsertTile(person, null, existing, wanted); else videos.forEach((pub) => upsertTile(person, pub, existing, wanted)); });
    existing.forEach((node, key) => { if (!wanted.has(key)) node.remove(); });
  }
  function upsertTile(person, publication, existing, wanted) {
    const key = `${person.identity}:${publication?.trackSid || 'avatar'}`; wanted.add(key); let tile = existing.get(key);
    if (!tile) { tile = document.createElement('article'); tile.className = 'tile'; tile.dataset.key = key; el.grid.appendChild(tile); }
    const isScreen = publication?.source === LK.Track.Source.ScreenShare; tile.classList.toggle('screen', isScreen); tile.replaceChildren();
    if (publication?.track) { const media = publication.track.attach(); media.autoplay = true; media.playsInline = true; if (person === state.room.localParticipant && !isScreen) media.muted = true; tile.appendChild(media); }
    else { const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = initials(person.name || person.identity); tile.appendChild(avatar); }
    const label = document.createElement('span'); label.className = 'name'; label.textContent = `${person.name || 'Participante'}${person === state.room.localParticipant ? ' (você)' : ''}${isScreen ? ' — apresentação' : ''}${state.raised.has(person.identity) ? ' ✋' : ''}`; tile.appendChild(label);
    const mic = person.getTrackPublication?.(LK.Track.Source.Microphone); if (!mic || mic.isMuted) { const muted = document.createElement('span'); muted.className = 'muted'; muted.textContent = '●'; muted.title = 'Microfone desligado'; tile.appendChild(muted); }
  }
  function renderTrack(track) { if (track.kind === LK.Track.Kind.Audio) { const audio = track.attach(); audio.dataset.lkAudio = '1'; document.body.appendChild(audio); } renderAll(); }
  function removeTrack(track) { track.detach().forEach((node) => node.remove()); renderAll(); }
  function renderPeople() {
    const list = participants(); $('#participant-count').textContent = String(list.length);
    el.people.replaceChildren(...list.map((person) => { const row = document.createElement('div'); row.className = 'person'; const avatar = document.createElement('div'); avatar.className = 'person-avatar'; avatar.textContent = initials(person.name || person.identity); const name = document.createElement('span'); name.textContent = `${person.name || 'Participante'}${person === state.room.localParticipant ? ' (você)' : ''}`; row.append(avatar, name); if (state.raised.has(person.identity)) { const hand = document.createElement('b'); hand.className = 'raised-hand'; hand.textContent = '✋'; row.appendChild(hand); } return row; }));
  }
  function connectionChanged(value) { const node = $('#connection'); const online = value === 'connected'; node.textContent = online ? 'Conectado' : value === 'reconnecting' ? 'Reconectando…' : 'Conectando…'; node.classList.toggle('online', online); }
  function syncControls() { if (!state.room) return; const local = state.room.localParticipant; $('#mic').classList.toggle('off', !local.isMicrophoneEnabled); $('#camera').classList.toggle('off', !local.isCameraEnabled); $('#screen').classList.toggle('off', !local.isScreenShareEnabled); $('#hand').classList.toggle('raised', state.raised.has(local.identity)); }
  async function toggleSource(source) { if (!state.room) return; try { const local = state.room.localParticipant; if (source === 'mic') await local.setMicrophoneEnabled(!local.isMicrophoneEnabled, { echoCancellation: true, noiseSuppression: true }); if (source === 'camera') await local.setCameraEnabled(!local.isCameraEnabled); if (source === 'screen') await local.setScreenShareEnabled(!local.isScreenShareEnabled, { audio: true }); renderAll(); } catch { toast(source === 'screen' ? 'O compartilhamento foi cancelado.' : 'Não foi possível acessar este dispositivo.'); } }
  async function publish(topic, data) { if (!state.room) return; await state.room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(data)), { reliable: true, topic }); }
  async function toggleHand() { if (!state.room) return; const id = state.room.localParticipant.identity; const raised = !state.raised.has(id); if (raised) state.raised.add(id); else state.raised.delete(id); await publish('hand', { raised }); renderAll(); }
  async function sendMessage(event) { event.preventDefault(); const input = $('#chat-input'); const text = input.value.trim(); if (!text || !state.room) return; await publish('chat', { text, name: state.room.localParticipant.name || 'Você', at: Date.now() }); addMessage({ text, name: 'Você' }); input.value = ''; }
  function receiveData(payload, person, _kind, topic) { try { const data = JSON.parse(new TextDecoder().decode(payload)); if (topic === 'chat') addMessage({ text: String(data.text || '').slice(0, 500), name: person?.name || data.name || 'Participante' }); if (topic === 'hand' && person) { if (data.raised) state.raised.add(person.identity); else state.raised.delete(person.identity); renderAll(); } if (topic === 'room-control' && data.action === 'end') { toast('O anfitrião encerrou a reunião.'); leave(); } } catch { /* dados inválidos são ignorados */ } }
  function addMessage(message) { const node = document.createElement('div'); node.className = 'message'; const strong = document.createElement('strong'); strong.textContent = message.name; const text = document.createElement('span'); text.textContent = message.text; node.append(strong, text); el.messages.appendChild(node); el.messages.scrollTop = el.messages.scrollHeight; }

  function pollPending() {
    clearTimeout(state.hostPoll); if (!state.isHost || !state.room) return;
    state.hostPoll = setTimeout(async () => { try { const result = await api(`/api/rooms/${state.roomCode}/requests`, { headers: { Authorization: `Bearer ${state.hostKey}` } }); renderPending(result.requests || []); } catch { /* nova tentativa automática */ } pollPending(); }, 1400);
  }
  function renderPending(requests) {
    $('#waiting-host').classList.toggle('hidden', !requests.length); el.waitingList.replaceChildren(...requests.map((request) => { const row = document.createElement('div'); row.className = 'pending-person'; const avatar = document.createElement('div'); avatar.className = 'person-avatar'; avatar.textContent = initials(request.name); const name = document.createElement('span'); name.textContent = request.name; const actions = document.createElement('div'); actions.className = 'pending-actions'; const admit = document.createElement('button'); admit.className = 'admit'; admit.textContent = 'Permitir'; admit.onclick = () => decide(request.id, 'admit'); const deny = document.createElement('button'); deny.className = 'deny'; deny.textContent = 'Recusar'; deny.onclick = () => decide(request.id, 'deny'); actions.append(admit, deny); row.append(avatar, name, actions); return row; }));
    const toggle = $('#participants-toggle'); toggle.querySelector('.waiting-badge')?.remove(); if (requests.length) { const badge = document.createElement('span'); badge.className = 'waiting-badge'; badge.textContent = requests.length; toggle.appendChild(badge); }
  }
  async function decide(id, action) { try { await api(`/api/rooms/${state.roomCode}/requests/${id}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${state.hostKey}` } }); toast(action === 'admit' ? 'Entrada autorizada.' : 'Solicitação recusada.'); pollPending(); } catch (cause) { toast(cause.message); } }
  async function endForAll() { if (!state.isHost || !confirm('Encerrar a reunião para todos?')) return; try { await api(`/api/rooms/${state.roomCode}/close`, { method: 'POST', headers: { Authorization: `Bearer ${state.hostKey}` } }); await publish('room-control', { action: 'end' }); } finally { leave(); } }
  function openPanel(name) { el.panel.classList.add('open'); document.querySelectorAll('.panel-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.panel === name)); $('#people-panel').classList.toggle('hidden', name !== 'people'); $('#chat-panel').classList.toggle('hidden', name !== 'chat'); }
  function leave(goHome = true) { clearTimeout(state.poll); clearTimeout(state.hostPoll); const room = state.room; state.room = null; state.isHost = false; state.hostKey = ''; state.raised.clear(); room?.disconnect(); document.querySelectorAll('[data-lk-audio]').forEach((node) => node.remove()); if (goHome) { history.replaceState({}, '', location.pathname); show($('#home')); } }

  $('#new-meeting').onclick = () => openPreview('create'); el.code.oninput = () => { el.join.disabled = normalizeCode(el.code.value).length < 6; }; el.join.onclick = () => { const code = normalizeCode(el.code.value); if (code.length >= 6) openPreview('join', code); };
  $('#preview-back').onclick = () => { stopPreview(); show($('#home')); }; $('#preview-mic').onclick = async () => { state.micOn = !state.micOn; await startPreview(); }; $('#preview-camera').onclick = async () => { state.cameraOn = !state.cameraOn; await startPreview(); }; el.name.oninput = () => { el.avatar.textContent = initials(el.name.value); }; $('#enter-room').onclick = enter;
  $('#cancel-request').onclick = () => { state.request = null; clearTimeout(state.poll); show($('#home')); }; $('#mic').onclick = () => toggleSource('mic'); $('#camera').onclick = () => toggleSource('camera'); $('#screen').onclick = () => toggleSource('screen'); $('#hand').onclick = toggleHand; $('#leave').onclick = () => leave(); $('#end-for-all').onclick = endForAll;
  $('#fullscreen').onclick = () => document.fullscreenElement ? document.exitFullscreen() : $('#meeting').requestFullscreen(); $('#copy-link').onclick = async () => { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${encodeURIComponent(state.roomCode)}`); toast('Link da reunião copiado.'); };
  $('#participants-toggle').onclick = () => openPanel('people'); $('#chat-toggle').onclick = () => openPanel('chat'); $('#close-panel').onclick = () => el.panel.classList.remove('open'); document.querySelectorAll('.panel-tabs button').forEach((button) => button.onclick = () => openPanel(button.dataset.panel)); $('#chat-form').onsubmit = sendMessage;
  setInterval(() => { const now = new Date(); $('.clock').textContent = now.toLocaleDateString('pt-BR', { weekday: 'short' }) + ', ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); $('#meeting-time').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }, 1000);
  const queryRoom = normalizeCode(new URLSearchParams(location.search).get('room') || ''); if (queryRoom) { el.code.value = queryRoom; el.join.disabled = false; }
  window.addEventListener('beforeunload', () => { stopPreview(); state.room?.disconnect(); }); show($('#home'));
})();

