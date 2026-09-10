(() => {
 'use strict';
 let frame=0;
 function update(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const v=window.visualViewport;document.documentElement.style.setProperty('--viewport-height',(v?.height||innerHeight)+'px');document.documentElement.style.setProperty('--viewport-top',(v?.offsetTop||0)+'px');});}
 window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);window.addEventListener('resize',update);update();
 document.addEventListener('focusin',e=>{if(!e.target.matches?.('input,textarea')||innerWidth>850)return;setTimeout(()=>e.target.isConnected&&e.target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}),220);});
})();
