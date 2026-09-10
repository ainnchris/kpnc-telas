(() => {
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,Number(n)||0));
 const normalize=t=>({rotation:Math.round(clamp(t?.rotation,0,270)/90)*90,zoom:clamp(t?.zoom||1,1,3),x:clamp(t?.x,-1,1),y:clamp(t?.y,-1,1)});
 function layout(w,h,t,size){t=normalize(t);const turn=t.rotation%180!==0,rw=turn?h:w,rh=turn?w:h,scale=Math.max(size/rw,size/rh)*t.zoom;return {scale,x:t.x*Math.max(0,rw*scale-size)/2,y:t.y*Math.max(0,rh*scale-size)/2,rotation:t.rotation};}
 function valid(src){return typeof src==='string'&&src.length<=60000&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src);}
 function render(node,name,src,transform){
   node.replaceChildren();node.style.backgroundImage='';node.classList.add('profile-image-container');
   if(!valid(src)){node.textContent=(name||'K').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();return;}
   const img=new Image();img.alt='';img.onload=()=>{const size=node.clientWidth||96,p=layout(img.naturalWidth,img.naturalHeight,transform,size);img.style.width=img.naturalWidth*p.scale+'px';img.style.height=img.naturalHeight*p.scale+'px';img.style.transform='translate(calc(-50% + '+p.x+'px),calc(-50% + '+p.y+'px)) rotate('+p.rotation+'deg)';};img.src=src;node.append(img);
 }
 async function poster(src,transform){const img=new Image();img.src=src;await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d'),p=layout(img.naturalWidth,img.naturalHeight,transform,96);ctx.translate(48+p.x,48+p.y);ctx.rotate(p.rotation*Math.PI/180);ctx.drawImage(img,-img.naturalWidth*p.scale/2,-img.naturalHeight*p.scale/2,img.naturalWidth*p.scale,img.naturalHeight*p.scale);return canvas.toDataURL('image/jpeg',.65);}
 window.MeetAvatar={render,normalize,layout,valid};
 window.installMeetProfile=({get,save,notify})=>{
   const dialog=document.querySelector('#profile-dialog');
   dialog.innerHTML='<form method="dialog" class="dialog-card"><header><h2>Seu perfil</h2><button aria-label="Fechar" value="cancel">×</button></header><div id="profile-preview" class="profile-preview"></div><label class="upload-button">Escolher foto ou GIF<input id="profile-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label><div class="profile-editor"><button type="button" id="profile-rotate">↻ Girar 90°</button><label>Zoom<input id="profile-zoom" type="range" min="1" max="3" step=".01" value="1"></label><label>Posição horizontal<input id="profile-x" type="range" min="-1" max="1" step=".01" value="0"></label><label>Posição vertical<input id="profile-y" type="range" min="-1" max="1" step=".01" value="0"></label></div><button id="profile-remove" type="button">Remover foto</button><label>Nome<input id="profile-name" maxlength="48"></label><button id="profile-save" type="button" class="primary">Salvar perfil</button><small id="profile-hint">A prévia mostra o corte final. Alterações só são aplicadas ao salvar.</small></form>';
   let draft,revision=0;
   const $=id=>dialog.querySelector(id);
   function preview(){render($('#profile-preview'),$('#profile-name').value,draft.avatar,draft.transform);}
   function sync(){for(const key of ['zoom','x','y'])$('#profile-'+key).value=draft.transform[key];preview();}
   function open(){const value=get();draft={...value,transform:normalize(value.transform)};$('#profile-name').value=value.name||'';$('#profile-file').value='';revision++;dialog.showModal();sync();}
   document.querySelector('#profile-open').onclick=open;
   const button=document.createElement('button');button.innerHTML='<svg aria-hidden="true"><use href="#i-people"/></svg>Editar meu perfil';button.onclick=open;document.querySelector('#more-menu').append(button);
   $('#profile-name').oninput=preview;
   for(const key of ['zoom','x','y'])$('#profile-'+key).oninput=e=>{draft.transform[key]=Number(e.target.value);preview();};
   $('#profile-rotate').onclick=()=>{draft.transform.rotation=(draft.transform.rotation+90)%360;preview();};
   $('#profile-remove').onclick=()=>{revision++;draft.avatar='';draft.transform=normalize();sync();};
   $('#profile-file').onchange=async event=>{
     const file=event.target.files[0],id=++revision;if(!file)return;
     try{
       if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('Escolha PNG, JPEG, WebP ou GIF.');
       const gif=file.type==='image/gif';if(file.size>(gif?42000:5000000))throw new Error(gif?'Use um GIF de até 42 KB para manter a reunião leve.':'Escolha uma imagem de até 5 MB.');
       const raw=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
       let src=raw;
       if(!gif){const img=new Image();img.src=raw;await img.decode();const c=document.createElement('canvas'),scale=Math.min(1,384/Math.max(img.width,img.height));c.width=img.width*scale;c.height=img.height*scale;c.getContext('2d').drawImage(img,0,0,c.width,c.height);src=c.toDataURL('image/jpeg',.75);}
       if(id!==revision||!dialog.open)return;
       draft.avatar=src;draft.transform=normalize();sync();
     }catch(e){notify(e.message||'Não foi possível abrir a imagem.');}
   };
   $('#profile-save').onclick=async()=>{
     const button=$('#profile-save');button.disabled=true;
     try{
       const snapshot=draft.avatar?await poster(draft.avatar,draft.transform):'';
       const animated=draft.avatar.startsWith('data:image/gif');
       await save({name:$('#profile-name').value.trim(),avatar:animated?draft.avatar:snapshot,transform:animated?draft.transform:normalize(),poster:snapshot});
       revision++;dialog.close();notify('Perfil salvo.');
     }catch(e){notify(e.message||'Não foi possível salvar o perfil.');}finally{button.disabled=false}
   };
   dialog.addEventListener('close',()=>revision++);
 };
})();
