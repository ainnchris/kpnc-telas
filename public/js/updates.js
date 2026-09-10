(() => {
 const version='2026-09-10.5';let manifest,dismissed='',checking=false,ready=false,downloading=false,autoInstall=false,installing=false;
 const busy=()=>['preview','waiting','meeting'].some(id=>!document.getElementById(id).classList.contains('hidden'))||!!document.querySelector('dialog[open]');
 const bar=document.createElement('aside');bar.className='update-notice hidden';bar.setAttribute('role','status');bar.innerHTML='<strong>Uma nova versão está disponível</strong><p>Atualize agora ou continue e faça isso depois.</p><button class="primary" id="apply-update">Atualizar agora</button><button id="later-update">Depois</button><small id="update-message"></small>';document.body.append(bar);
 const message=bar.querySelector('small'),progress=document.createElement('progress');progress.max=100;progress.hidden=true;progress.setAttribute('aria-label','Progresso da atualização');bar.append(progress);
 window.meetDesktop?.onUpdateProgress?.(p=>{progress.hidden=false;if(p.percent===null)progress.removeAttribute('value');else progress.value=p.percent;message.textContent='Baixando atualização'+(p.percent===null?'…':': '+p.percent+'%');});
 async function applyReady(){if(!ready||!autoInstall||installing||busy())return;installing=true;message.textContent='Atualizando… O Kpnc Meet abrirá novamente automaticamente.';try{await window.meetDesktop.installUpdate()}catch(e){autoInstall=false;message.textContent='Não foi possível reiniciar: '+e.message;installing=false;}}
 function available(){return manifest&&(manifest.web!==version||window.meetDesktop&&manifest.windows);}
 function display(){const key=JSON.stringify(manifest);bar.classList.toggle('hidden',busy()||!available()||dismissed===key);if(ready&&autoInstall&&!busy())void applyReady();}
 async function check(){if(checking)return;checking=true;try{const response=await fetch('/updates.json',{cache:'no-store'});if(response.ok){const data=await response.json();if(typeof data.web==='string'){manifest=data;if(window.meetDesktop){const desktop=await window.meetDesktop.checkUpdate();manifest.windows=desktop.available?desktop:null;}display();}}}catch{}finally{checking=false}}
 document.getElementById('later-update').onclick=()=>{autoInstall=false;dismissed=JSON.stringify(manifest);display();};
 document.getElementById('apply-update').onclick=async()=>{
   if(busy()||downloading||installing)return;
   if(window.meetDesktop&&manifest?.windows){
     if(ready){try{await window.meetDesktop.installUpdate()}catch(e){message.textContent=e.message;}return;}
     message.textContent='Baixando e verificando a atualização…';downloading=true;autoInstall=!!window.meetDesktop.silentUpdates;
     try{await window.meetDesktop.downloadUpdate();ready=true;
       message.textContent='Atualização pronta. Clique novamente para instalar e reiniciar.';
       document.getElementById('apply-update').textContent='Instalar e reiniciar';progress.value=100;if(autoInstall){message.textContent=busy()?'Atualização pronta. Será aplicada ao sair da reunião.':'Atualizando e reiniciando…';await applyReady();}
     }catch(e){message.textContent='Não foi possível atualizar: '+e.message;}finally{downloading=false;}
   }else location.reload();
 };
 new MutationObserver(display).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','open']});
 setInterval(check,120000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});check();
})();
