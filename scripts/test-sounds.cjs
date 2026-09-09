const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('sounds are lazy, throttled, optional and persisted',async()=>{
 const storage=new Map(),buttons=[],listeners={},tones=[];let contexts=0,time=10000;
 const node=()=>({setAttribute(){},append(){},prepend(){}});
 const document={createElement(){const b=node();buttons.push(b);return b},querySelector:()=>node(),addEventListener:(type,fn)=>listeners[type]=fn};
 class AudioContext{
   constructor(){contexts++;this.state='running';this.currentTime=0;this.destination={}}
   createOscillator(){const osc={frequency:{},connect(){},disconnect(){},start(){tones.push(osc.frequency.value)},stop(){}};return osc}
   createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
 }
 const window={AudioContext},localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/sounds.js'),'utf8'),{window,document,localStorage,Date:{now:()=>time},Map});
 assert.equal(contexts,0);
 await window.MeetSounds.play('request');assert.deepEqual(tones,[660,880,660]);
 await window.MeetSounds.play('request');assert.equal(tones.length,3);
 time+=1000;await window.MeetSounds.play('shareStart');assert.deepEqual(tones.slice(-3),[440,660,880]);
 buttons[0].onclick();assert.equal(storage.get('kpnc-sounds'),'off');
 time+=1000;await window.MeetSounds.play('join');assert.equal(tones.length,6);
 buttons[1].onclick();assert.equal(storage.get('kpnc-sounds'),'on');
 time+=1000;await window.MeetSounds.play('leave');assert.deepEqual(tones.slice(-2),[520,350]);
 assert.equal(contexts,1);
});
