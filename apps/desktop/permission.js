'use strict';
window.meetPermission.details().then(types=>{document.getElementById('description').textContent='Permitir que o Kpnc Meet use '+types.map(t=>t==='audio'?'seu microfone':'sua câmera').join(' e ')+'?';}).catch(()=>window.meetPermission.answer(false));
document.getElementById('allow').onclick=()=>window.meetPermission.answer(true);
document.getElementById('deny').onclick=()=>window.meetPermission.answer(false);
