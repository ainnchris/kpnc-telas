window.installMeetThemes=()=>{
 const themes=[['light','Branco'],['dark','Escuro'],['gray','Cinza'],['black','All black']];
 const controls=[];
 function apply(value){const theme=themes.some(([id])=>id===value)?value:'dark';document.body.dataset.theme=theme;document.documentElement.dataset.theme=theme;document.body.classList.toggle('dark-theme',theme!=='light');localStorage.setItem('kpnc-theme',theme);for(const select of controls)select.value=theme;}
 for(const parent of [document.querySelector('.top-actions'),document.querySelector('#more-menu')]){
   const label=document.createElement('label');label.className='theme-picker';label.innerHTML='<svg aria-hidden="true"><use href="#i-palette"/></svg>';
   const select=document.createElement('select');select.setAttribute('aria-label','Tema de cores');select.append(...themes.map(([id,name])=>new Option(name,id)));select.onchange=()=>apply(select.value);label.append(select);parent.prepend(label);controls.push(select);
 }
 apply(localStorage.getItem('kpnc-theme')||'dark');
};
