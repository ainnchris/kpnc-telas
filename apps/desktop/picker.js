'use strict';
document.getElementById('cancel').onclick=()=>window.capturePicker.select(null,false);
window.capturePicker.list().then(({sources,audio})=>{
  document.getElementById('audio-label').hidden=!audio;
  for(const source of sources){
    const button=document.createElement('button'),img=document.createElement('img'),label=document.createElement('span');
    img.src=source.thumbnail; img.alt=''; label.textContent=source.name;
    button.append(img,label);button.onclick=()=>window.capturePicker.select(source.id,document.getElementById('audio').checked);
    document.getElementById('sources').append(button);
  }
  if(!sources.length)document.getElementById('error').textContent='Nenhuma tela disponível.';
}).catch(()=>{document.getElementById('error').textContent='Não foi possível listar as telas. Cancele e tente novamente.';});
