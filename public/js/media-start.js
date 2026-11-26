(() => {
 async function startLocalMedia(room,{mic,camera,devices={}},notify){
  // Capture takes priority, as in the stable backup. Output routing must not gate it.
  for(const [kind,enabled,options]of [['microphone',mic,{deviceId:devices.audio&&devices.audio!=='default'?devices.audio:undefined,echoCancellation:true,noiseSuppression:true}],['camera',camera,{deviceId:devices.video&&devices.video!=='default'?devices.video:undefined}]]){
   if(!enabled)continue;
   try{if(kind==='microphone')await room.localParticipant.setMicrophoneEnabled(true,options);else await room.localParticipant.setCameraEnabled(true,options);console.info('MEET_INITIAL_MEDIA',{kind,enabled:kind==='microphone'?room.localParticipant.isMicrophoneEnabled:room.localParticipant.isCameraEnabled});}
   catch(error){console.warn('MEET_INITIAL_MEDIA_FAILED',{kind,name:error?.name||'Error'});notify((kind==='microphone'?'Microfone':'Câmera')+' não pôde ser ativado. Confira a permissão e o dispositivo nas configurações.');}
  }
  if(devices.output&&devices.output!=='default')void room.switchActiveDevice('audiooutput',devices.output).catch(()=>notify('Saída salva indisponível; usando o padrão do sistema.'));
 }
 window.MeetMedia={startLocalMedia};
})();
