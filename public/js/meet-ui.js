(() => {
 'use strict';
 const $=s=>document.querySelector(s),glyph=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
 function linkify(node,text){
  const value=String(text).slice(0,500),pattern=/https?:\/\/[^\s<>]+/gi;let start=0;
  for(const match of value.matchAll(pattern)){
   node.append(document.createTextNode(value.slice(start,match.index)));let href=match[0].replace(/[.,!?;:)\]}]+$/,'');
   try{const u=new URL(href);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw 0;const a=document.createElement('a');a.href=u.href;a.textContent=href;a.target='_blank';a.rel='noopener noreferrer';node.append(a,document.createTextNode(match[0].slice(href.length)));}catch{node.append(document.createTextNode(match[0]));}
   start=match.index+match[0].length;
  }
  node.append(document.createTextNode(value.slice(start)));
 }
 function install({toast,devices,captions,inRoom}){
  $('#clock')?.remove();$('#profile-open svg')?.remove();$('#profile-open').setAttribute('aria-label','Editar perfil');
  const settings=document.createElement('dialog');settings.id='settings-dialog';settings.innerHTML='<form method="dialog" class="dialog-card"><header><h2>Configurações</h2><button aria-label="Fechar">'+glyph('close')+'</button></header><h3>Geral</h3><div id="general-settings"></div><h3>Dispositivos</h3><button type="button" id="settings-devices">'+glyph('mic')+'Microfone, câmera e saída de áudio</button><h3>Legendas</h3><p id="settings-caption-status"></p><button type="button" id="settings-captions">'+glyph('captions')+'Ativar / desativar legendas</button><small>O reconhecimento depende do suporte do navegador. A transcrição pode ser processada pelo serviço de voz do navegador.</small></form>';document.body.append(settings);
  const theme=$('.top-actions .theme-picker'),sounds=$('#home-sounds-toggle');if(theme)$('#general-settings').append(theme);if(sounds){sounds.classList.remove('theme-button');$('#general-settings').append(sounds);}
  function openSettings(){const supported=!!(window.SpeechRecognition||window.webkitSpeechRecognition)&&!window.meetDesktop;$('#settings-caption-status').textContent=supported?'Transcreve sua fala em português e compartilha as legendas na reunião.':'Transcrição de voz indisponível neste aplicativo. Você ainda recebe as legendas enviadas por participantes com navegador compatível.';$('#settings-captions').disabled=!supported||!inRoom();settings.showModal();}
  for(const parent of [$('.top-actions'),$('#more-menu')]){const b=document.createElement('button');b.type='button';b.className='settings-open';b.title='Configurações gerais';b.setAttribute('aria-label','Configurações gerais');b.innerHTML=glyph('settings')+(parent.id?'Configurações gerais':'');b.onclick=openSettings;parent.append(b);}
  $('#settings-devices').onclick=()=>{settings.close();devices()};$('#settings-captions').onclick=()=>{settings.close();captions()};
  // Unicode characters: normal chat text, no proprietary emoji assets.
  const emojis=['😀','😃','😄','😁','😆','😅','😂','🤣','😊','🙂','😉','😍','🥰','😘','😎','🤩','🥳','🤔','🤗','🫡','😴','😭','😮','😱','😅','😔','😡','🤯','👍','👎','👏','🙌','🙏','🤝','👋','✋','👌','💪','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🔥','✨','⭐','🎉','🎊','💯','✅','❌','⚠️','🚀','💡','🎯','🎵','☕','🌈','🐱','🐶','🌻'];
  const emojiPanel=document.createElement('div');emojiPanel.id='emoji-panel';emojiPanel.hidden=true;emojiPanel.setAttribute('aria-label','Emojis');
  const emojiButton=document.createElement('button');emojiButton.type='button';emojiButton.id='emoji-toggle';emojiButton.textContent='☺';emojiButton.title='Escolher emoji';emojiButton.setAttribute('aria-expanded','false');$('#chat-form').prepend(emojiButton);$('#chat-form').before(emojiPanel);
  emojiButton.onclick=()=>{emojiPanel.hidden=!emojiPanel.hidden;emojiButton.setAttribute('aria-expanded',String(!emojiPanel.hidden));};
  for(const emoji of emojis){const b=document.createElement('button');b.type='button';b.textContent=emoji;b.setAttribute('aria-label',emoji);b.onclick=()=>{const input=$('#chat-input'),start=input.selectionStart??input.value.length,end=input.selectionEnd??start;if(input.value.length-end+start+emoji.length>500)return;input.setRangeText(emoji,start,end,'end');input.focus();};emojiPanel.append(b);}
  // Download URLs come only from this project's verified release manifest.
  if(!window.meetDesktop&&sessionStorage.getItem('kpnc-download-dismissed')!=='yes'){
   const card=document.createElement('aside');card.id='download-card';card.innerHTML=glyph('screen')+'<div><strong>Leve o Kpnc Meet com você</strong><small>Aplicativos experimentais para Windows e Android.</small><div class="download-links"></div><small>iPhone: em breve. Por enquanto, use o navegador.</small></div><button type="button" aria-label="Ocultar downloads">'+glyph('close')+'</button>';$('.hero').append(card);card.querySelector('button').onclick=()=>{sessionStorage.setItem('kpnc-download-dismissed','yes');card.remove()};
   fetch('/updates.json',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(manifest=>{for(const [platform,label,ext]of[['windows','Baixar para Windows','exe'],['android','Baixar para Android','apk']]){const item=manifest[platform];if(!item?.url||!new RegExp('^https://github\\.com/ainnchris/kpnc-telas/releases/download/[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+\\.'+ext+'$').test(item.url))continue;const a=document.createElement('a');a.href=item.url;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';card.querySelector('.download-links').append(a);}}).catch(()=>{card.querySelector('.download-links').textContent='Downloads indisponíveis no momento.'});
  }
  if(window.meetDesktop?.windowAction){
   document.body.classList.add('desktop-shell');const bar=document.createElement('header');bar.id='desktop-titlebar';bar.innerHTML='<div class="window-brand"><img src="/img/favicon.png" alt="">Kpnc Meet</div><nav aria-label="Janela"><button data-window="minimize" aria-label="Minimizar">−</button><button data-window="maximize" aria-label="Maximizar">□</button><button data-window="close" aria-label="Fechar janela">×</button></nav>';document.body.prepend(bar);
   const sync=s=>{document.body.classList.toggle('window-fullscreen',!!s.fullscreen);bar.querySelector('[data-window=maximize]').textContent=s.maximized?'❐':'□';bar.querySelector('[data-window=maximize]').setAttribute('aria-label',s.maximized?'Restaurar janela':'Maximizar');};
   bar.querySelectorAll('button').forEach(b=>b.onclick=()=>window.meetDesktop.windowAction(b.dataset.window).then(sync).catch(()=>toast('Não foi possível controlar a janela.')));window.meetDesktop.onWindowState(sync);window.meetDesktop.windowAction('state').then(sync).catch(()=>{});
  }
 }
 window.MeetUI={install,linkify};
})();
