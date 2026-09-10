import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, AppState, findNodeHandle, Image, Linking, Modal, NativeModules, Platform, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {MediaStream as NativeMediaStream, RTCView, ScreenCapturePickerView} from '@livekit/react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Ionicons} from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {StatusBar} from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import {AudioSession, LiveKitRoom, VideoTrack, isTrackReference, useRoomContext, useTracks} from '@livekit/react-native';
import {createLocalVideoTrack, LocalVideoTrack, Participant, RoomEvent, Track} from 'livekit-client';
import {api, ApiError, Auth, JoinRequest, Pending, post, Profile, roomCode, WEBSITE} from './api';

const APP_VERSION='0.2.0';
type Glyph = React.ComponentProps<typeof Ionicons>['name'];
type Message = {id:string;name:string;text:string};
const dark={bg:'#080c12',surface:'#131c2b',text:'#f2f5fc',muted:'#a7b4ca',border:'#29384e',accent:'#438dff'};
const light={bg:'#f2f5fc',surface:'#ffffff',text:'#13223b',muted:'#576981',border:'#d2dceb',accent:'#2068dd'};
const Theme=React.createContext(dark);
function Button({label,icon,onPress,disabled=false,danger=false}:{label:string;icon:Glyph;onPress:()=>void;disabled?:boolean;danger?:boolean}) {
  const c=React.useContext(Theme);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,{backgroundColor:danger?'#b92542':c.surface,borderColor:c.border,opacity:disabled?.4:pressed?.7:1}]}><Ionicons name={icon} size={22} color={danger?'white':c.text}/><Text style={[s.buttonText,{color:danger?'white':c.text}]}>{label}</Text></Pressable>;
}
function Avatar({profile,size=84}:{profile:Profile;size?:number}) {
  return profile.avatar ? <Image source={{uri:profile.avatar}} style={{width:size,height:size,borderRadius:size/2}}/> : <View style={[s.avatar,{width:size,height:size,borderRadius:size/2}]}><Text style={{fontSize:size*.4,color:'white',fontWeight:'700'}}>{profile.name.charAt(0).toUpperCase()||'K'}</Text></View>;
}
function participantProfile(p:Participant):Profile {
  let avatar=''; try{const data=JSON.parse(p.metadata||'{}');data.avatar=data.avatarPoster||data.avatar;if(typeof data.avatar==='string' && /^data:image\/(png|jpeg|webp);base64,/.test(data.avatar) && data.avatar.length<=12000)avatar=data.avatar}catch{}
  return {name:p.name||'Participante',avatar};
}
function errorMessage(error:unknown){return error instanceof Error?error.message:'Não foi possível concluir. Tente novamente.'}

export default function App() {
  const [profile,setProfile]=useState<Profile>({name:'',avatar:''});
  const [availableUpdate,setAvailableUpdate]=useState<{version:string;url:string}|null>(null);
  const [loaded,setLoaded]=useState(false),[darkMode,setDarkMode]=useState(true);
  const [screen,setScreen]=useState<'home'|'preview'|'waiting'|'meeting'>('home');
  const [mode,setMode]=useState<'create'|'join'>('create'),[code,setCode]=useState('');
  const [mic,setMic]=useState(false),[camera,setCamera]=useState(false);
  const [previewURL,setPreviewURL]=useState('');
  const [previewRevision,setPreviewRevision]=useState(0);
  const stopPreview=useRef<()=>void>(()=>{});
  const [request,setRequest]=useState<JoinRequest|null>(null),[auth,setAuth]=useState<Auth|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const operation=useRef(0);
  const c=darkMode?dark:light;
  useEffect(()=>{
    if(screen!=='home'||Platform.OS!=='android')return;
    let active=true;
    const check=async()=>{try{const response=await fetch(WEBSITE+'/updates.json');if(!response.ok)return;const data=await response.json(),u=data.android;
      if(!u||typeof u.version!=='string'||!/^\d+\.\d+\.\d+$/.test(u.version)||typeof u.url!=='string')return;
      const target=new URL(u.url),a=u.version.split('.').map(Number),b=APP_VERSION.split('.').map(Number),index=a.findIndex((n:number,i:number)=>n!==b[i]);
      if(active&&index>=0&&a[index]>b[index]&&target.protocol==='https:'&&target.hostname==='github.com'&&target.pathname.startsWith('/ainnchris/kpnc-telas/releases/download/')&&target.pathname.endsWith('.apk'))setAvailableUpdate(u);
    }catch{}};
    void check();const timer=setInterval(check,120000),listener=AppState.addEventListener('change',value=>{if(value==='active')void check()});
    return()=>{active=false;clearInterval(timer);listener.remove()};
  },[screen]);
  useEffect(()=>{void SystemUI.setBackgroundColorAsync(c.bg).catch(()=>{})},[c.bg]);
  useEffect(()=>{
    if(screen!=='preview'||!camera)return;
    let cancelled=false;let track:LocalVideoTrack|undefined;
    const cleanup=()=>{cancelled=true;track?.stop();setPreviewURL('')};
    stopPreview.current=cleanup;
    void createLocalVideoTrack({facingMode:'user'}).then(result=>{
      if(cancelled){result.stop();return}
      track=result;setPreviewURL((result.mediaStream as unknown as NativeMediaStream)?.toURL()||'');
    }).catch(error=>{if(!cancelled){setCamera(false);setError(errorMessage(error))}});
    return cleanup;
  },[screen,camera,previewRevision]);
  useEffect(()=>{let active=true;AsyncStorage.multiGet(['kpnc-profile','kpnc-theme']).then(values=>{
    if(!active)return;
    try{const p=JSON.parse(values[0][1]||'{}');setProfile({name:typeof p.name==='string'?p.name.slice(0,48):'',avatar:typeof p.avatar==='string'&&p.avatar.length<=12000?p.avatar:''})}catch{}
    setDarkMode(values[1][1]!=='light');
  }).catch(()=>setError('Não foi possível recuperar seu perfil.')).finally(()=>{if(active)setLoaded(true)});return()=>{active=false}},[]);
  useEffect(()=>{if(loaded)void AsyncStorage.multiSet([['kpnc-profile',JSON.stringify(profile)],['kpnc-theme',darkMode?'dark':'light']]).catch(()=>setError('Não foi possível salvar suas preferências.'))},[profile,darkMode,loaded]);
  useEffect(()=>{
    const receive=(url:string|null)=>{if(!url)return;const parsed=roomCode(url);if(parsed)setCode(parsed)};
    void Linking.getInitialURL().then(receive);
    const listener=Linking.addEventListener('url',e=>receive(e.url));return()=>listener.remove();
  },[]);
  const reset=useCallback(()=>{operation.current++;stopPreview.current();setRequest(null);setAuth(null);setScreen('home');setBusy(false);setMic(false);setCamera(false);void AudioSession.stopAudioSession().catch(()=>{})},[]);
  useEffect(()=>{
    if(screen!=='waiting'||!request)return;
    let active=true;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
    const poll=async()=>{
      try {
        const result=await api<Auth&{status:string}>(`/api/join-requests/${request.requestId}?room=${encodeURIComponent(request.room)}&secret=${encodeURIComponent(request.requestSecret)}`,{signal:controller.signal});
        if(!active)return;
        if(result.status==='denied'){setError('O anfitrião recusou sua entrada.');reset();return}
        if(result.status==='approved'){await AudioSession.startAudioSession();if(!active){void AudioSession.stopAudioSession();return}setAuth(result);setScreen('meeting');return}
        setError('');
      } catch(error){if(active){setError(errorMessage(error));if(error instanceof ApiError&&error.status===404){reset();return}}}
      if(active)timer=setTimeout(poll,1800);
    };
    void poll();return()=>{active=false;controller.abort();clearTimeout(timer)};
  },[request,screen,reset]);
  async function enter(){
    if(busy)return;
    stopPreview.current();
    const attempt=++operation.current;
    setBusy(true);setError('');
    try {
      if(profile.name.trim().length<2)throw new Error('Informe um nome com pelo menos 2 caracteres.');
      const body={...profile,name:profile.name.trim()};
      if(mode==='create'){
        const result=await api<Auth>('/api/rooms',post(body));
        if(attempt!==operation.current)return;
        await AudioSession.startAudioSession();
        if(attempt!==operation.current){void AudioSession.stopAudioSession();return}
        setAuth(result);setScreen('meeting');
      }else{
        const room=roomCode(code);if(!room)throw new Error('Código ou link de reunião inválido.');
        const result=await api<JoinRequest>('/api/join-requests',post({...body,room}));
        if(attempt===operation.current){setRequest(result);setScreen('waiting')}
      }
    }catch(error){if(attempt===operation.current)setError(errorMessage(error))}
    finally{if(attempt===operation.current){setBusy(false);setPreviewRevision(n=>n+1)}}
  }
  async function choosePhoto(){
    try {
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.8});
      if(result.canceled)return;
      const image=await ImageManipulator.manipulateAsync(result.assets[0].uri,[{resize:{width:96,height:96}}],{base64:true,compress:.65,format:ImageManipulator.SaveFormat.JPEG});
      const avatar=`data:image/jpeg;base64,${image.base64}`;
      if(avatar.length>12000)throw new Error('Escolha uma foto menor.');
      setProfile(p=>({...p,avatar}));
    }catch(error){setError(errorMessage(error))}
  }
  if(!loaded)return <SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><Text style={{color:c.text,padding:24}}>Carregando Kpnc Meet…</Text></SafeAreaView>;
  return <Theme.Provider value={c}><SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><StatusBar style={darkMode?'light':'dark'}/>
    {screen==='meeting'&&auth ? <LiveKitRoom serverUrl={auth.url} token={auth.token} connect audio={mic} video={camera} options={{adaptiveStream:{pixelDensity:'screen'},dynacast:true}} onDisconnected={reset} onError={e=>Alert.alert('Reunião',e.message)}><Meeting auth={auth} onLeave={reset}/></LiveKitRoom> : <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.header}><Text style={[s.brand,{color:c.text}]}>Kpnc <Text style={{color:c.accent}}>Meet</Text></Text><Button label={darkMode?'Tema claro':'Tema escuro'} icon={darkMode?'sunny-outline':'moon-outline'} onPress={()=>setDarkMode(!darkMode)}/></View>
      {screen==='waiting' ? <View style={s.section}><Ionicons name="hourglass-outline" size={54} color={c.accent}/><Text style={[s.title,{color:c.text}]}>Aguardando o anfitrião</Text><Text style={{color:c.muted}}>Sua solicitação foi enviada. Você entrará quando ela for aceita.</Text><Text style={{color:c.muted}}>{request?.room}</Text><Button label="Cancelar" icon="close-outline" onPress={reset}/></View> : <>
      {screen==='preview'&&<Button label="Voltar" icon="arrow-back-outline" onPress={reset} disabled={busy}/>}
      {screen==='home'&&availableUpdate&&<View style={[s.section,{backgroundColor:c.surface,padding:16,borderRadius:12}]}><Text style={{color:c.text}}>Nova versão {availableUpdate.version} disponível</Text><Text style={{color:c.muted}}>O Android pedirá confirmação para instalar. Nenhuma reunião será interrompida.</Text><Button label="Baixar atualização" icon="download-outline" onPress={()=>{void Linking.openURL(availableUpdate.url).catch(()=>setError('Não foi possível abrir o download.'))}}/><Button label="Depois" icon="time-outline" onPress={()=>setAvailableUpdate(null)}/></View>}
      <Text style={[s.title,{color:c.text}]}>{screen==='home'?'Conversas que aproximam.':'Como você quer entrar?'}</Text>
      {screen==='preview'&&!!previewURL&&<RTCView streamURL={previewURL} objectFit="cover" mirror style={{width:'100%',height:240,borderRadius:20}}/>}
      <View style={[s.profile,{backgroundColor:c.surface,borderColor:c.border}]}><Avatar profile={profile}/><View style={s.row}><Button label="Foto" icon="image-outline" onPress={choosePhoto}/>{!!profile.avatar&&<Button label="Remover" icon="trash-outline" onPress={()=>setProfile(p=>({...p,avatar:''}))}/>}</View><TextInput accessibilityLabel="Seu nome" placeholder="Seu nome" placeholderTextColor={c.muted} maxLength={48} value={profile.name} onChangeText={name=>setProfile(p=>({...p,name}))} style={[s.input,{color:c.text,borderColor:c.border}]}/><Text style={{color:c.muted}}>Seu perfil fica salvo neste aparelho.</Text></View>
      {screen==='home'?<View style={s.section}><Button label="Nova reunião" icon="add-circle-outline" onPress={()=>{setMode('create');setError('');setScreen('preview')}}/><TextInput accessibilityLabel="Código ou link da reunião" placeholder="Código ou link da reunião" placeholderTextColor={c.muted} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} style={[s.input,{color:c.text,borderColor:c.border}]}/><Button label="Participar" icon="enter-outline" disabled={!roomCode(code)} onPress={()=>{setMode('join');setError('');setScreen('preview')}}/><Text style={{color:c.muted}}>Windows, navegador, Android e iPhone nas mesmas salas.</Text></View>:<View style={s.section}>
        <Text style={{color:c.muted}}>Câmera e microfone começam desligados. Ative somente se desejar.</Text>
        <View style={s.setting}><Ionicons name="mic-outline" size={24} color={c.text}/><Text style={{color:c.text,flex:1}}>Entrar com microfone</Text><Switch accessibilityLabel="Entrar com microfone" value={mic} onValueChange={setMic}/></View>
        <View style={s.setting}><Ionicons name="videocam-outline" size={24} color={c.text}/><Text style={{color:c.text,flex:1}}>Entrar com câmera</Text><Switch accessibilityLabel="Entrar com câmera" value={camera} onValueChange={setCamera}/></View>
        <Button label={busy?'Conectando…':mode==='create'?'Criar reunião':'Solicitar entrada'} icon="arrow-forward-circle-outline" onPress={enter} disabled={busy}/>
      </View>}</>}
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </ScrollView>}
  </SafeAreaView></Theme.Provider>;
}

function Meeting({auth,onLeave}:{auth:Auth;onLeave:()=>void}) {
  const room=useRoomContext(),c=React.useContext(Theme);
  const tracks=useTracks([Track.Source.Camera,Track.Source.ScreenShare]);
  const [,refresh]=useState(0),[connection,setConnection]=useState(room.state);
  const [panel,setPanel]=useState<'people'|'chat'|null>(null),[pending,setPending]=useState<Pending[]>([]);
  const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState('');
  const [raised,setRaised]=useState<Set<string>>(new Set()),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [focused,setFocused]=useState<string|null>(null),[unread,setUnread]=useState(0);
  const [facing,setFacing]=useState<'user'|'environment'>('user');
  const screenCaptureRef=useRef<React.ElementRef<typeof ScreenCapturePickerView>>(null);
  const [audioOutputs,setAudioOutputs]=useState<string[]|null>(null);
  const panelRef=useRef(panel);panelRef.current=panel;
  const connected=connection==='connected';
  const participants=[room.localParticipant,...Array.from(room.remoteParticipants.values())];
  const update=()=>refresh(n=>n+1);
  useEffect(()=>{
    const events=[RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished,RoomEvent.ParticipantMetadataChanged] as const;
    for(const event of events)room.on(event,update);
    const data=(payload:Uint8Array,p:Participant|undefined,_kind:unknown,topic?:string)=>{
      if(!p || payload.length>16000)return;
      try {
        const d=JSON.parse(new TextDecoder().decode(payload));
        if(topic==='chat'&&typeof d.text==='string'){
          setMessages(items=>[...items,{id:`${Date.now()}-${Math.random()}`,name:p.name||'Participante',text:d.text.slice(0,500)}].slice(-200));
          if(panelRef.current!=='chat')setUnread(n=>n+1);
        }
        if(topic==='hand')setRaised(current=>{const next=new Set(current);d.raised===true?next.add(p.identity):next.delete(p.identity);return next});
        // The identity prefix is assigned by the token endpoint, unlike editable metadata.
        if(topic==='room-control'&&d.action==='end'&&p.identity.startsWith('host-')){Alert.alert('Reunião encerrada','O anfitrião encerrou a reunião.');void room.disconnect();onLeave()}
      }catch{}
    };
    room.on(RoomEvent.DataReceived,data);room.on(RoomEvent.ConnectionStateChanged,setConnection);
    return()=>{for(const event of events)room.off(event,update);room.off(RoomEvent.DataReceived,data);room.off(RoomEvent.ConnectionStateChanged,setConnection)};
  },[room,onLeave]);
  useEffect(()=>{
    if(!auth.host||!auth.hostKey)return;
    let active=true;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
    const poll=async()=>{
      try{const result=await api<{requests:Pending[]}>(`/api/rooms/${auth.room}/requests`,{headers:{Authorization:`Bearer ${auth.hostKey}`},signal:controller.signal});if(active)setPending(result.requests)}
      catch(error){if(active)setError(errorMessage(error))}
      if(active)timer=setTimeout(poll,1800);
    };
    void poll();return()=>{active=false;controller.abort();clearTimeout(timer)};
  },[auth]);
  async function act(fn:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');try{await fn();update()}catch(error){setError(errorMessage(error))}finally{setBusy(false)}}
  const publish=(topic:string,data:unknown)=>room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(data)),{reliable:true,topic});
  async function decide(id:string,decision:'admit'|'deny') {await api(`/api/rooms/${auth.room}/requests/${id}/${decision}`,post({},auth.hostKey));setPending(items=>items.filter(item=>item.id!==id))}
  async function send(){const text=draft.trim().slice(0,500);if(!text)return;await publish('chat',{text,name:room.localParticipant.name,at:Date.now()});setMessages(items=>[...items,{id:`${Date.now()}-local`,name:'Você',text}].slice(-200));setDraft('')}
  async function hand(){const id=room.localParticipant.identity,on=!raised.has(id);await publish('hand',{raised:on});setRaised(current=>{const next=new Set(current);on?next.add(id):next.delete(id);return next})}
  async function switchCamera(){const track=room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;if(track instanceof LocalVideoTrack){const next=facing==='user'?'environment':'user';await track.restartTrack({facingMode:next});setFacing(next)}}
  async function screenShare(){
    const participant=room.localParticipant;
    if(participant.isScreenShareEnabled){await participant.setScreenShareEnabled(false);return}
    if(Platform.OS==='ios'){
      const node=findNodeHandle(screenCaptureRef.current);
      if(!node||!NativeModules.ScreenCapturePickerViewManager)throw new Error('O seletor de transmissão não está disponível neste aparelho.');
      await NativeModules.ScreenCapturePickerViewManager.show(node);
    }
    await participant.setScreenShareEnabled(true);
  }
  async function selectOutput(){
    if(Platform.OS==='ios'){await AudioSession.showAudioRoutePicker();return}
    const outputs=await AudioSession.getAudioOutputs();
    setAudioOutputs(outputs);
  }
  const leave=()=>{void room.disconnect();onLeave()};
  const end=()=>Alert.alert('Encerrar para todos?','Todos os participantes sairão da reunião.',[{text:'Cancelar',style:'cancel'},{text:'Encerrar',style:'destructive',onPress:()=>void act(async()=>{await api(`/api/rooms/${auth.room}/close`,post({},auth.hostKey));await publish('room-control',{action:'end'});leave()})}]);
  const visibleTracks=tracks.filter(isTrackReference);
  type Tile={key:string;participant:Participant;track:(typeof visibleTracks)[number]|null};
  const tiles=participants.flatMap<Tile>(p=>{
    const own=visibleTracks.filter(t=>t.participant.identity===p.identity && !t.publication.isMuted);
    return own.length?own.map(track=>({key:`${p.identity}:${track.source}`,participant:p,track})): [{key:`${p.identity}:avatar`,participant:p,track:null}];
  });
  const tile=(item:(typeof tiles)[number],fullscreen=false)=><View key={item.key} style={[s.tile,fullscreen&&s.fullTile]}>
    {item.track?<VideoTrack trackRef={item.track} style={StyleSheet.absoluteFill} objectFit={item.track.source===Track.Source.ScreenShare?'contain':'cover'}/>:<Avatar profile={participantProfile(item.participant)}/>}
    <View style={s.tileCaption}><Ionicons name={item.participant.isMicrophoneEnabled?'mic':'mic-off'} size={16} color="white"/><Text numberOfLines={1} style={s.tileName}>{item.participant.name||'Participante'}{item.participant===room.localParticipant?' (você)':''}{raised.has(item.participant.identity)?' · ✋':''}</Text><Pressable accessibilityRole="button" accessibilityLabel={fullscreen?'Sair da tela cheia':'Ampliar transmissão'} onPress={()=>setFocused(fullscreen?null:item.key)}><Ionicons name={fullscreen?'contract-outline':'expand-outline'} color="white" size={25}/></Pressable></View>
  </View>;
  return <View style={s.root}>
    {Platform.OS==='ios'&&<View style={{width:1,height:1,position:'absolute',overflow:'hidden'}} pointerEvents="none"><ScreenCapturePickerView ref={screenCaptureRef}/></View>}
    <View style={[s.meetingHeader,{borderColor:c.border}]}><View><Text style={[s.brand,{color:c.text}]}>Kpnc Meet</Text><Text style={{color:connected?'#43bb97':c.muted}}>{connected?'Conectado':connection==='reconnecting'?'Reconectando…':'Conectando…'} · {auth.room}</Text></View><Button label="Convidar" icon="link-outline" onPress={()=>void Share.share({message:`Entre no Kpnc Meet: ${WEBSITE}/?room=${auth.room}`})}/></View>
    <ScrollView contentContainerStyle={s.grid}>{tiles.map(item=>tile(item))}</ScrollView>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <View style={[s.controls,{borderColor:c.border}]}>
      <Button label="Microfone" icon={room.localParticipant.isMicrophoneEnabled?'mic':'mic-off'} disabled={busy||!connected} onPress={()=>void act(()=>room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled))}/>
      <Button label="Câmera" icon={room.localParticipant.isCameraEnabled?'videocam':'videocam-off'} disabled={busy||!connected} onPress={()=>void act(()=>room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled))}/>
      {room.localParticipant.isCameraEnabled&&<Button label="Inverter" icon="camera-reverse-outline" disabled={busy||!connected} onPress={()=>void act(switchCamera)}/>}
      <Button label="Áudio" icon="volume-high-outline" disabled={busy||!connected} onPress={()=>void act(selectOutput)}/>
      <Button label={room.localParticipant.isScreenShareEnabled?'Parar tela':'Apresentar'} icon="easel-outline" disabled={busy||!connected} onPress={()=>void act(screenShare)}/>
      <Button label={raised.has(room.localParticipant.identity)?'Baixar mão':'Mão'} icon="hand-left-outline" disabled={busy||!connected} onPress={()=>void act(hand)}/>
      <Button label={`Pessoas${pending.length?` (${pending.length})`:''}`} icon="people-outline" onPress={()=>setPanel('people')}/>
      <Button label={`Chat${unread?` (${unread})`:''}`} icon="chatbubble-outline" onPress={()=>{setPanel('chat');setUnread(0)}}/>
      <Button label="Sair" icon="call-outline" danger onPress={leave}/>
    </View>
    <Modal visible={focused!==null} onRequestClose={()=>setFocused(null)} supportedOrientations={['portrait','landscape']}><SafeAreaView style={[s.root,{backgroundColor:'#080c12'}]}>{tiles.find(t=>t.key===focused)?tile(tiles.find(t=>t.key===focused)!,true):<Text style={{color:'white',padding:24}}>A transmissão terminou.</Text>}<Button label="Voltar à reunião" icon="contract-outline" onPress={()=>setFocused(null)}/></SafeAreaView></Modal>
    <Modal visible={audioOutputs!==null} onRequestClose={()=>setAudioOutputs(null)}><SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><View style={s.section}><Text style={[s.title,{color:c.text}]}>Saída de áudio</Text>{audioOutputs?.map(output=><Button key={output} label={({speaker:'Alto-falante',earpiece:'Fone do aparelho',bluetooth:'Bluetooth',headset:'Fone de ouvido'} as Record<string,string>)[output]||output} icon="volume-high-outline" disabled={busy} onPress={()=>void act(async()=>{await AudioSession.selectAudioOutput(output);setAudioOutputs(null)})}/>)}<Button label="Voltar" icon="arrow-back-outline" onPress={()=>setAudioOutputs(null)}/></View></SafeAreaView></Modal>
    <Modal visible={panel!==null} animationType="slide" onRequestClose={()=>setPanel(null)}><SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><View style={s.meetingHeader}><Text style={[s.brand,{color:c.text}]}>{panel==='chat'?'Chat da reunião':'Participantes'}</Text><Button label="Fechar" icon="close-outline" onPress={()=>setPanel(null)}/></View>
      {panel==='chat'?<><ScrollView contentContainerStyle={s.section} keyboardShouldPersistTaps="handled">{messages.length===0&&<Text style={{color:c.muted}}>As mensagens aparecem aqui durante a reunião.</Text>}{messages.map(m=><View key={m.id} style={[s.bubble,{backgroundColor:c.surface}]}><Text style={{color:c.accent,fontWeight:'700'}}>{m.name}</Text><Text selectable style={{color:c.text}}>{m.text}</Text></View>)}</ScrollView><View style={s.composer}><TextInput accessibilityLabel="Mensagem" placeholder="Escreva uma mensagem" placeholderTextColor={c.muted} value={draft} onChangeText={setDraft} maxLength={500} style={[s.input,{color:c.text,borderColor:c.border,flex:1}]} onSubmitEditing={()=>void act(send)}/><Button label="Enviar" icon="send-outline" disabled={busy||!draft.trim()||!connected} onPress={()=>void act(send)}/></View></>:<ScrollView contentContainerStyle={s.section}>
        {auth.host&&<><Text style={[s.subtitle,{color:c.text}]}>Aguardando para entrar ({pending.length})</Text>{pending.map(p=><View key={p.id} style={[s.bubble,{backgroundColor:c.surface}]}><Text style={{color:c.text}}>{p.name}</Text><View style={s.row}><Button label="Aceitar" icon="checkmark-outline" disabled={busy} onPress={()=>void act(()=>decide(p.id,'admit'))}/><Button label="Recusar" icon="close-outline" disabled={busy} onPress={()=>void act(()=>decide(p.id,'deny'))}/></View></View>)}</>}
        <Text style={[s.subtitle,{color:c.text}]}>Na reunião ({participants.length})</Text>{participants.map(p=><View key={p.identity} style={[s.bubble,{backgroundColor:c.surface}]}><View style={s.row}><Avatar profile={participantProfile(p)} size={40}/><Text style={{color:c.text,flex:1}}>{p.name||'Participante'}{p===room.localParticipant?' (você)':''}{raised.has(p.identity)?' · ✋':''}</Text><Ionicons name={p.isMicrophoneEnabled?'mic':'mic-off'} size={20} color={c.muted}/></View>{auth.host&&p!==room.localParticipant&&<View style={s.row}><Button label="Silenciar" icon="mic-off-outline" disabled={busy||!p.isMicrophoneEnabled} onPress={()=>void act(async()=>{const trackSid=p.getTrackPublication(Track.Source.Microphone)?.trackSid;if(trackSid)await api(`/api/rooms/${auth.room}/participants/${encodeURIComponent(p.identity)}/mute`,post({trackSid},auth.hostKey))})}/><Button label="Remover" icon="person-remove-outline" disabled={busy} onPress={()=>Alert.alert('Remover participante?',p.name||'Participante',[{text:'Cancelar',style:'cancel'},{text:'Remover',style:'destructive',onPress:()=>void act(()=>api(`/api/rooms/${auth.room}/participants/${encodeURIComponent(p.identity)}/remove`,post({},auth.hostKey)))}])}/></View>}</View>)}
        {auth.host&&<Button label="Encerrar para todos" icon="stop-circle-outline" danger disabled={busy} onPress={end}/>}
      </ScrollView>}
      {!!error&&<Text style={s.error}>{error}</Text>}
    </SafeAreaView></Modal>
  </View>;
}
const s=StyleSheet.create({
  root:{flex:1},page:{padding:22,gap:24,paddingBottom:44},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},brand:{fontSize:23,fontWeight:'800'},title:{fontSize:34,fontWeight:'800',lineHeight:40},subtitle:{fontSize:20,fontWeight:'700'},section:{padding:18,gap:16},row:{flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},profile:{borderWidth:1,borderRadius:24,padding:22,gap:16,alignItems:'center'},avatar:{backgroundColor:'#308ee3',alignItems:'center',justifyContent:'center'},input:{borderWidth:1,borderRadius:14,padding:16,fontSize:17,minHeight:54,width:'100%'},button:{minHeight:48,padding:12,borderRadius:14,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},buttonText:{fontSize:13,fontWeight:'600'},setting:{flexDirection:'row',alignItems:'center',gap:12,minHeight:48},error:{color:'#e15a6b',padding:14},meetingHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,borderBottomWidth:1,gap:10},grid:{padding:12,gap:12},tile:{height:260,backgroundColor:'#182235',borderRadius:18,overflow:'hidden',alignItems:'center',justifyContent:'center'},fullTile:{flex:1,height:undefined,borderRadius:0},tileCaption:{position:'absolute',bottom:0,left:0,right:0,backgroundColor:'#000a',padding:12,flexDirection:'row',alignItems:'center',gap:8},tileName:{color:'white',flex:1},controls:{padding:10,paddingBottom:16,flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:8,borderTopWidth:1},bubble:{padding:16,borderRadius:16,gap:12},composer:{padding:14,flexDirection:'row',alignItems:'center',gap:8}
});
