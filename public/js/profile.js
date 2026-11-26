(() => {
 const clamp=(n,a,b)=>Math.min(b,Math.max(a,Number(n)||0));
 const normalize=t=>({rotation:Math.round(clamp(t?.rotation,0,270)/90)*90,zoom:clamp(t?.zoom||1,1,3),x:clamp(t?.x,-1,1),y:clamp(t?.y,-1,1)});
 function layout(w,h,t,size){t=normalize(t);const turn=t.rotation%180!==0,rw=turn?h:w,rh=turn?w:h,scale=Math.max(size/rw,size/rh)*t.zoom;return {scale,x:t.x*Math.max(0,rw*scale-size)/2,y:t.y*Math.max(0,rh*scale-size)/2,rotation:t.rotation};}
 function valid(src){return typeof src==='string'&&src.length<=60000&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src);}
 function render(node,name,src,transform){
   node.style.backgroundImage='';node.classList.add('profile-image-container');
   if(!valid(src)){node.textContent=(name||'K').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();return;}
   let img=node.querySelector('img');if(!img||img.getAttribute('src')!==src){img=new Image();img.alt='';node.replaceChildren(img);img.src=src;}
   // Relative dimensions remain correct when the avatar is hidden or resized.
   const draw=()=>{const p=layout(img.naturalWidth,img.naturalHeight,transform,node.classList.contains('crop-source')?.8:1);img.style.width=img.naturalWidth*p.scale*100+'%';img.style.height=img.naturalHeight*p.scale*100+'%';img.style.left=(50+p.x*100)+'%';img.style.top=(50+p.y*100)+'%';img.style.transform='translate(-50%,-50%) rotate('+p.rotation+'deg)';};img.onload=draw;if(img.complete&&img.naturalWidth)draw();
 }
 async function poster(src,transform){const img=new Image();img.src=src;await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d'),p=layout(img.naturalWidth,img.naturalHeight,transform,96);ctx.translate(48+p.x,48+p.y);ctx.rotate(p.rotation*Math.PI/180);ctx.drawImage(img,-img.naturalWidth*p.scale/2,-img.naturalHeight*p.scale/2,img.naturalWidth*p.scale,img.naturalHeight*p.scale);return canvas.toDataURL('image/jpeg',.65);}
 window.MeetAvatar={render,normalize,layout,valid};
 window.installMeetProfile=({get,save,notify})=>{
   const dialog=document.querySelector('#profile-dialog');
   dialog.innerHTML='<form method="dialog" class="dialog-card"><header><h2>Seu perfil</h2><button aria-label="Fechar" value="cancel">×</button></header><label>Nome<input id="profile-name" maxlength="48" autocomplete="name"></label><div class="profile-crop-stage"><div id="profile-preview" class="profile-preview crop-source"></div><div class="crop-ring" aria-hidden="true"></div></div><p class="crop-instruction">Arraste a imagem para posicionar dentro do círculo.</p><div class="profile-editor"><span aria-hidden="true">−</span><input aria-label="Zoom da foto" id="profile-zoom" type="range" min="1" max="3" step=".01" value="1"><span aria-hidden="true">+</span><button type="button" id="profile-rotate" title="Girar 90 graus" aria-label="Girar 90 graus">↻</button></div><div class="profile-file-actions"><label class="upload-button">＋ Foto ou GIF<input id="profile-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label><button id="profile-remove" type="button" title="Remover foto">⌫ Remover</button></div><details class="avatar-presets"><summary>Ou escolha um avatar Kpnc</summary><div id="avatar-presets" aria-label="Avatares genéricos"></div></details><button id="profile-save" type="button" class="primary">Salvar perfil</button><small id="profile-hint">Alterações só são aplicadas ao salvar. GIFs animados: até 42 KB.</small></form>';
   let draft,revision=0;
   const $=id=>dialog.querySelector(id);
   function preview(){render($('#profile-preview'),$('#profile-name').value,draft.avatar,draft.transform);}
   function sync(){$('#profile-zoom').value=draft.transform.zoom;preview();}
   function open(){const value=get();draft={...value,transform:normalize(value.transform)};$('#profile-name').value=value.name||'';$('#profile-file').value='';revision++;dialog.showModal();sync();}
   document.querySelector('#profile-open').onclick=open;
   const button=document.createElement('button');button.innerHTML='<svg aria-hidden="true"><use href="#i-people"/></svg>Editar meu perfil';button.onclick=open;document.querySelector('#more-menu').append(button);
   $('#profile-name').oninput=preview;
   $('#profile-zoom').oninput=e=>{draft.transform.zoom=Number(e.target.value);preview();};
   let drag=null;const stage=$('.profile-crop-stage');
   stage.onpointerdown=e=>{if(!draft.avatar)return;stage.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,tx:draft.transform.x,ty:draft.transform.y};};
   stage.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const img=$('#profile-preview img');if(!img?.naturalWidth)return;const size=stage.clientWidth*.8,p=layout(img.naturalWidth,img.naturalHeight,draft.transform,size),turn=p.rotation%180!==0,dx=Math.max(0,((turn?img.naturalHeight:img.naturalWidth)*p.scale-size)/2),dy=Math.max(0,((turn?img.naturalWidth:img.naturalHeight)*p.scale-size)/2);draft.transform.x=dx?clamp(drag.tx+(e.clientX-drag.x)/dx,-1,1):0;draft.transform.y=dy?clamp(drag.ty+(e.clientY-drag.y)/dy,-1,1):0;preview();};
   stage.onpointerup=stage.onpointercancel=stage.onlostpointercapture=()=>{drag=null};
   stage.tabIndex=0;stage.setAttribute('role','group');stage.setAttribute('aria-label','Posicionar foto. Use as setas ou arraste.');
   stage.onkeydown=e=>{const axis={ArrowLeft:['x',-.05],ArrowRight:['x',.05],ArrowUp:['y',-.05],ArrowDown:['y',.05]}[e.key];if(axis){e.preventDefault();draft.transform[axis[0]]=clamp(draft.transform[axis[0]]+axis[1],-1,1);preview();}};
   for(let i=0;i<16;i++){const src=window.MeetPresets.avatar(i),b=document.createElement('button'),img=new Image();b.type='button';b.title='Explorador '+(i+1);b.setAttribute('aria-label',b.title);img.src=src;img.alt='';b.append(img);b.onclick=()=>{revision++;draft.avatar=src;draft.transform=normalize();sync();};$('#avatar-presets').append(b);}
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
