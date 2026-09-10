(() => {
  'use strict';
  const patterns={click:[640],join:[520,780],leave:[520,350],request:[660,880,660],shareStart:[440,660,880],shareStop:[660,440],message:[880,720]};
  let context,enabled=localStorage.getItem('kpnc-sounds')!=='off';
  const last=new Map();
  async function play(name){
    if(!enabled||!patterns[name])return;
    const now=Date.now();if(now-(last.get(name)||0)<(name==='click'?70:700))return;last.set(name,now);
    try{
      if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;context=new Audio();}
      if(context.state==='suspended')await context.resume();
      if(!enabled||context.state!=='running')return;
      patterns[name].forEach((frequency,index)=>{
        const osc=context.createOscillator(),gain=context.createGain(),start=context.currentTime+index*.105,duration=name==='click'?.035:.10;
        osc.type='sine';osc.frequency.value=frequency;
        gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(name==='click'?.03:.09,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        osc.connect(gain);gain.connect(context.destination);osc.start(start);osc.stop(start+duration+.01);osc.onended=()=>{osc.disconnect();gain.disconnect();};
      });
    }catch{/* Sound must never block a meeting action. */}
  }
  const button=document.createElement('button');button.type='button';button.id='sounds-toggle';
  const homeButton=document.createElement('button');homeButton.type='button';homeButton.id='home-sounds-toggle';homeButton.className='theme-button';document.querySelector('.top-actions').prepend(homeButton);
  function sync(){const label='Sons de interação: '+(enabled?'ligados':'desligados'),glyph='<svg aria-hidden="true"><use href="#i-'+(enabled?'volume-high':'volume-off')+'"/></svg>';button.setAttribute('aria-pressed',String(enabled));button.innerHTML=glyph+'<span>'+label+'</span>';homeButton.innerHTML=glyph+'<span>'+label+'</span>';homeButton.title=label;homeButton.setAttribute('aria-label',label);homeButton.setAttribute('aria-pressed',String(enabled));}
  button.onclick=homeButton.onclick=()=>{enabled=!enabled;localStorage.setItem('kpnc-sounds',enabled?'on':'off');sync();if(enabled)play('click');};
  document.querySelector('#more-menu').append(button);sync();
  document.addEventListener('click',event=>{const target=event.target.closest?.('button');if(target&&!target.disabled&&target!==button&&target!==homeButton)play('click');},true);
  window.MeetSounds={play};
})();
