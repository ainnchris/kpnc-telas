(() => {
 const version='2026-09-10.1';let manifest,dismissed='',checking=false,ready=false,downloading=false;
 const busy=()=>['preview','waiting','meeting'].some(id=>!document.getElementById(id).classList.contains('hidden'))||!!document.querySelector('dialog[open]');
 const bar=document.createElement('aside');bar.className='update-notice hidden';bar.setAttribute('role','status');bar.innerHTML='<strong>Uma nova versão está disponível</strong><p>Atualize agora ou continue e faça isso depois.</p><button class="primary" id="apply-update">Atualizar agora</button><button id="later-update">Depois</button><small id="update-message"></small>';document.body.append(bar);
 const message=bar.querySelector('small');
 function available(){return manifest&&(manifest.web!==version||window.meetDesktop&&manifest.windows);}
 function display(){const key=JSON.stringify(manifest);bar.classList.toggle('hidden',busy()||!available()||dismissed===key);}
 async function check(){if(checking)return;checking=true;try{const response=await fetch('/updates.json',{cache:'no-store'});if(response.ok){const data=await response.json();if(typeof data.web==='string'){manifest=data;if(window.meetDesktop){const desktop=await window.meetDesktop.checkUpdate();manifest.windows=desktop.available?desktop:null;}display();}}}catch{}finally{checking=false}}
 document.getElementById('later-update').onclick=()=>{dismissed=JSON.stringify(manifest);display();};
 document.getElementById('apply-update').onclick=async()=>{
   if(busy()||downloading)return;
   if(window.meetDesktop&&manifest?.windows){
     if(ready){try{await window.meetDesktop.installUpdate()}catch(e){message.textContent=e.message;}return;}
     message.textContent='Baixando e verificando a atualização…';downloading=true;
     try{await window.meetDesktop.downloadUpdate();ready=true;
       message.textContent='Atualização pronta. Clique novamente para instalar e reiniciar.';
       document.getElementById('apply-update').textContent='Instalar e reiniciar';
     }catch(e){message.textContent='Não foi possível atualizar: '+e.message;}finally{downloading=false;}
   }else location.reload();
 };
 new MutationObserver(display).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','open']});
 setInterval(check,120000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});check();
})();
