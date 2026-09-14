import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, AppState, findNodeHandle, Image, Linking, Modal, NativeModules, Platform, Pressable, KeyboardAvoidingView, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {AVATAR_PRESETS} from './avatar-presets';
import {MediaStream as NativeMediaStream, RTCView, ScreenCapturePickerView} from '@livekit/react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Ionicons} from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {File,Paths} from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as IntentLauncher from 'expo-intent-launcher';
import * as ScreenOrientation from 'expo-screen-orientation';
import {StatusBar} from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import * as Updates from 'expo-updates';
import {AudioSession, LiveKitRoom, VideoTrack, isTrackReference, useRoomContext, useTracks} from '@livekit/react-native';
import {createLocalAudioTrack, createLocalVideoTrack, LocalVideoTrack, Participant, RoomEvent, Track} from 'livekit-client';
import {api, ApiError, Auth, JoinRequest, Pending, post, Profile, roomCode, WEBSITE} from './api';

const APP_VERSION='0.4.0';
type Glyph = React.ComponentProps<typeof Ionicons>['name'];
type Message = {id:string;name:string;text:string};
type CheckState='off'|'checking'|'good'|'bad';
type ShareResolution='source'|'1440'|'1080'|'720'|'480'|'360';
type ShareFps=30|60|120;
type ViewerMode='screen'|'chat';
const SHARE_SIZES:Record<Exclude<ShareResolution,'source'>,{width:number;height:number}>={
  '1440':{width:2560,height:1440},
  '1080':{width:1920,height:1080},
  '720':{width:1280,height:720},
  '480':{width:854,height:480},
  '360':{width:640,height:360}
};
const SHARE_RESOLUTIONS:ShareResolution[]=['source','1440','1080','720','480','360'];
const SHARE_FPS:ShareFps[]=[30,60,120];
const dark={bg:'#080c12',surface:'#131c2b',text:'#f2f5fc',muted:'#a7b4ca',border:'#29384e',accent:'#438dff'};
const light={bg:'#f2f5fc',surface:'#ffffff',text:'#13223b',muted:'#576981',border:'#d2dceb',accent:'#2068dd'};
const palettes={light,dark,gray:{...dark,bg:'#292d33',surface:'#373c44',border:'#5b626d',muted:'#c2c8d0'},black:{...dark,bg:'#000000',surface:'#101010',border:'#303030',muted:'#b8b8b8'}};
type ThemeName=keyof typeof palettes;
const themeNames:Record<ThemeName,string>={light:'Branco',dark:'Escuro',gray:'Cinza',black:'All black'};
const Theme=React.createContext(dark);
function ThemeChoices({value,onChange}:{value:ThemeName;onChange:(value:ThemeName)=>void}){return <View style={s.row}>{(Object.keys(palettes) as ThemeName[]).map(key=><Button key={key} label={themeNames[key]} icon={key===value?'checkmark-circle':'color-palette'} onPress={()=>onChange(key)}/>)}</View>}
function Presets({onChoose}:{onChoose:(avatar:string)=>void}){return <View style={s.row}>{AVATAR_PRESETS.map((avatar,index)=><Pressable key={index} accessibilityRole="button" accessibilityLabel={'Avatar Explorador '+(index+1)} onPress={()=>onChoose(avatar)} style={{padding:5}}><Image source={{uri:avatar}} style={{width:48,height:48,borderRadius:24}}/></Pressable>)}</View>}
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
function errorMessage(error:unknown){
  if(error instanceof ApiError)return error.message;
  const name=error instanceof Error?error.name:'';
  const value=error instanceof Error?error.message:'';
  if(/^(Informe|Código|Esta reunião|O anfitrião|A atualização|Não foi possível)/i.test(value))return value;
  if(['NotAllowedError','PermissionDeniedError'].includes(name)||/permission|denied|notallowed/i.test(value))return'O acesso foi bloqueado. Autorize câmera e microfone nas configurações do aparelho.';
  if(['NotFoundError','DevicesNotFoundError'].includes(name))return'Nenhuma câmera ou microfone compatível foi encontrado.';
  if(['NotReadableError','TrackStartError'].includes(name))return'O dispositivo está sendo usado por outro aplicativo. Feche-o e tente novamente.';
  if(/network|fetch|offline|connection/i.test(value))return'Não foi possível acessar o serviço. Confira sua internet e tente novamente.';
  return'Não foi possível concluir. Tente novamente.';
}
function DeviceCheck({label,state,detail}:{label:string;state:CheckState;detail:string}){
  const c=React.useContext(Theme),color=state==='good'?'#25a76f':state==='bad'?'#d94b61':state==='checking'?'#e3a326':c.muted;
  return <View style={[s.deviceCheck,{backgroundColor:c.surface,borderColor:c.border}]}><View style={[s.checkDot,{backgroundColor:color}]}/><View style={{flex:1,gap:2}}><Text style={{color:c.text,fontWeight:'700'}}>{label}</Text><Text style={{color:c.muted,fontSize:12}}>{detail}</Text></View></View>;
}

export default function Root(){return <SafeAreaProvider><App/></SafeAreaProvider>}
function App() {
  const [profile,setProfile]=useState<Profile>({name:'',avatar:''});
  const [availableUpdate,setAvailableUpdate]=useState<{version:string;url:string;sha256:string}|null>(null);
  const [nativeUpdating,setNativeUpdating]=useState(false);
  const [otaReady,setOtaReady]=useState(false);
  const [loaded,setLoaded]=useState(false),[theme,setTheme]=useState<ThemeName>('light');
  const [screen,setScreen]=useState<'home'|'preview'|'waiting'|'meeting'>('home');
  const [mode,setMode]=useState<'create'|'join'>('create'),[code,setCode]=useState('');
  const [mic,setMic]=useState(false),[camera,setCamera]=useState(false);
  const [cameraFacing,setCameraFacing]=useState<'user'|'environment'>('user');
  const [checks,setChecks]=useState<{camera:CheckState;microphone:CheckState;network:CheckState}>({camera:'off',microphone:'off',network:'checking'});
  const [networkDetail,setNetworkDetail]=useState('Verificando…');
  const [previewURL,setPreviewURL]=useState('');
  const [previewRevision,setPreviewRevision]=useState(0);
  const stopPreview=useRef<()=>void>(()=>{});
  const [request,setRequest]=useState<JoinRequest|null>(null),[auth,setAuth]=useState<Auth|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const operation=useRef(0);
  const c=palettes[theme],darkMode=theme!=='light';
  const [settingsOpen,setSettingsOpen]=useState(false),[presetsOpen,setPresetsOpen]=useState(false);
  const homeScroll=useRef<ScrollView>(null);
  useEffect(()=>{
    if(screen!=='home'||Platform.OS!=='android')return;
    let active=true;
    const check=async()=>{try{const response=await fetch(WEBSITE+'/updates.json');if(!response.ok)return;const data=await response.json(),u=data.android;
      if(!u||typeof u.version!=='string'||!/^\d+\.\d+\.\d+$/.test(u.version)||typeof u.url!=='string'||typeof u.sha256!=='string'||!/^[a-f\d]{64}$/i.test(u.sha256))return;
      const target=new URL(u.url),a=u.version.split('.').map(Number),b=APP_VERSION.split('.').map(Number),index=a.findIndex((n:number,i:number)=>n!==b[i]);
      if(active&&index>=0&&a[index]>b[index]&&target.protocol==='https:'&&target.hostname==='github.com'&&target.pathname.startsWith('/ainnchris/kpnc-telas/releases/download/')&&target.pathname.endsWith('.apk'))setAvailableUpdate(u);
    }catch{}};
    void check();const timer=setInterval(check,120000),listener=AppState.addEventListener('change',value=>{if(value==='active')void check()});
    return()=>{active=false;clearInterval(timer);listener.remove()};
  },[screen]);
  useEffect(()=>{
    if(screen!=='home'||!Updates.isEnabled)return;
    let active=true;
    void Updates.checkForUpdateAsync().then(result=>result.isAvailable?Updates.fetchUpdateAsync():null).then(result=>{if(active&&result?.isNew)setOtaReady(true)}).catch(()=>{});
    return()=>{active=false};
  },[screen]);
  useEffect(()=>{void SystemUI.setBackgroundColorAsync(c.bg).catch(()=>{})},[c.bg]);
  useEffect(()=>{
    if(screen!=='preview'||!camera)return;
    let cancelled=false;let track:LocalVideoTrack|undefined;
    const cleanup=()=>{cancelled=true;track?.stop();setPreviewURL('')};
    stopPreview.current=cleanup;
    setChecks(value=>({...value,camera:'checking'}));
    void createLocalVideoTrack({facingMode:cameraFacing}).then(result=>{
      if(cancelled){result.stop();return}
      track=result;setPreviewURL((result.mediaStream as unknown as NativeMediaStream)?.toURL()||'');setChecks(value=>({...value,camera:'good'}));
    }).catch(error=>{if(!cancelled){setCamera(false);setChecks(value=>({...value,camera:'bad'}));setError(errorMessage(error))}});
    return cleanup;
  },[screen,camera,previewRevision,cameraFacing]);
  useEffect(()=>{
    if(screen!=='preview'){return}
    if(!camera)setChecks(value=>({...value,camera:'off'}));
    if(!mic){setChecks(value=>({...value,microphone:'off'}));return}
    let active=true;setChecks(value=>({...value,microphone:'checking'}));
    void AudioSession.startAudioSession().then(()=>createLocalAudioTrack({echoCancellation:true,noiseSuppression:true,autoGainControl:true})).then(track=>{track.stop();if(active)setChecks(value=>({...value,microphone:'good'}))}).catch(error=>{if(active){setMic(false);setChecks(value=>({...value,microphone:'bad'}));setError(errorMessage(error))}}).finally(()=>{if(active)void AudioSession.stopAudioSession().catch(()=>{})});
    return()=>{active=false};
  },[screen,mic,camera]);
  useEffect(()=>{
    if(screen!=='preview')return;
    let active=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000),started=Date.now();setChecks(value=>({...value,network:'checking'}));setNetworkDetail('Medindo resposta…');
    void fetch(WEBSITE.replace('kpnc-meet.pages.dev','kpnc-meet-api.erikchristian2.workers.dev')+'/health',{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('health');const latency=Date.now()-started;if(active){setChecks(value=>({...value,network:latency<700?'good':'bad'}));setNetworkDetail(latency<250?`Boa resposta (${latency} ms)`:latency<700?`Resposta moderada (${latency} ms)`:`Resposta lenta (${latency} ms)`)}}).catch(()=>{if(active){setChecks(value=>({...value,network:'bad'}));setNetworkDetail('Não foi possível alcançar o serviço')}}).finally(()=>clearTimeout(timer));
    return()=>{active=false;clearTimeout(timer);controller.abort()};
  },[screen,previewRevision]);
  useEffect(()=>{let active=true;AsyncStorage.multiGet(['kpnc-profile','kpnc-theme']).then(values=>{
    if(!active)return;
    try{const p=JSON.parse(values[0][1]||'{}');setProfile({name:typeof p.name==='string'?p.name.slice(0,48):'',avatar:typeof p.avatar==='string'&&p.avatar.length<=12000?p.avatar:''})}catch{}
    setTheme(!Object.hasOwn(palettes,values[1][1]||'light')?'light':((values[1][1]||'light') as ThemeName));
  }).catch(()=>setError('Não foi possível recuperar seu perfil.')).finally(()=>{if(active)setLoaded(true)});return()=>{active=false}},[]);
  useEffect(()=>{if(loaded)void AsyncStorage.multiSet([['kpnc-profile',JSON.stringify(profile)],['kpnc-theme',theme]]).catch(()=>setError('Não foi possível salvar suas preferências.'))},[profile,theme,loaded]);
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
        const result=await api<Auth&{status:string}>(`/api/join-requests/${request.requestId}?room=${encodeURIComponent(request.room)}`,{headers:{Authorization:`Bearer ${request.requestSecret}`},signal:controller.signal});
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
  async function installNativeUpdate(){
    if(!availableUpdate||nativeUpdating||Platform.OS!=='android')return;
    setNativeUpdating(true);setError('');
    try{
      const target=new File(Paths.cache,`Kpnc-Meet-${availableUpdate.version}.apk`),file=await File.downloadFileAsync(availableUpdate.url,target,{idempotent:true});
      if(file.size>350*1024*1024){file.delete();setError('A atualização excedeu o limite de segurança e foi bloqueada.');return}
      const digest=new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,await file.arrayBuffer())),hex=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
      if(hex.toLowerCase()!==availableUpdate.sha256.toLowerCase()){file.delete();setError('A atualização não passou na verificação de integridade e foi bloqueada.');return}
      const contentUri=await LegacyFileSystem.getContentUriAsync(file.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW',{data:contentUri,flags:1,type:'application/vnd.android.package-archive'});
    }catch{setError('Não foi possível baixar ou abrir a atualização. Confira sua internet e tente novamente.')}
    finally{setNativeUpdating(false)}
  }
  if(!loaded)return <SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><Text style={{color:c.text,padding:24}}>Carregando Kpnc Meet…</Text></SafeAreaView>;
  return <Theme.Provider value={c}><SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><KeyboardAvoidingView style={s.root} behavior={Platform.OS==='ios'?'padding':'height'}><StatusBar style={darkMode?'light':'dark'}/>
    {screen==='meeting'&&auth ? <LiveKitRoom serverUrl={auth.url} token={auth.token} connect audio={mic?{echoCancellation:true,noiseSuppression:true,autoGainControl:true}:false} video={camera} options={{adaptiveStream:{pixelDensity:'screen'},dynacast:true}} onDisconnected={reset} onError={e=>Alert.alert('Reunião',errorMessage(e))}><Meeting auth={auth} onLeave={reset} theme={theme} setTheme={setTheme}/></LiveKitRoom> : <ScrollView ref={homeScroll} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={s.header}><Text style={[s.brand,{color:c.text}]}>Kpnc <Text style={{color:c.accent}}>Meet</Text></Text><Button label="Tema" icon="color-palette" onPress={()=>setSettingsOpen(true)}/></View>
      {screen==='waiting' ? <View style={s.section}><Ionicons name="hourglass" size={54} color={c.accent}/><Text style={[s.title,{color:c.text}]}>Aguardando o anfitrião</Text><Text style={{color:c.muted}}>Sua solicitação foi enviada. Você entrará quando ela for aceita.</Text><Text style={{color:c.muted}}>{request?.room}</Text><Button label="Cancelar" icon="close" onPress={reset}/></View> : <>
      {screen==='preview'&&<Button label="Voltar" icon="arrow-back" onPress={reset} disabled={busy}/>}
      {screen==='home'&&otaReady&&<View style={[s.section,{backgroundColor:c.surface,padding:16,borderRadius:12}]}><Text style={{color:c.text,fontWeight:'700'}}>Atualização rápida pronta</Text><Text style={{color:c.muted}}>A interface já foi baixada pelo próprio Kpnc Meet. Não é necessário instalar outro aplicativo.</Text><Button label="Aplicar e reiniciar" icon="refresh" onPress={()=>void Updates.reloadAsync()}/><Button label="Depois" icon="time" onPress={()=>setOtaReady(false)}/></View>}
      {screen==='home'&&availableUpdate&&!otaReady&&<View style={[s.section,{backgroundColor:c.surface,padding:16,borderRadius:12}]}><Text style={{color:c.text}}>Nova versão {availableUpdate.version} disponível</Text><Text style={{color:c.muted}}>Esta versão altera componentes do Android e precisa da confirmação do sistema. Ela substituirá o Kpnc Meet atual e preservará seus dados.</Text><Button label={nativeUpdating?'Baixando e verificando…':'Atualizar pelo aplicativo'} icon="download" disabled={nativeUpdating} onPress={()=>void installNativeUpdate()}/><Button label="Depois" icon="time" disabled={nativeUpdating} onPress={()=>setAvailableUpdate(null)}/></View>}
      <Text style={[s.title,{color:c.text}]}>{screen==='home'?'Conversas que aproximam.':'Como você quer entrar?'}</Text>
      {screen==='preview'&&!!previewURL&&<><RTCView streamURL={previewURL} objectFit="cover" mirror={cameraFacing==='user'} style={{width:'100%',height:240,borderRadius:20}}/><Button label={cameraFacing==='user'?'Usar câmera traseira':'Usar câmera frontal'} icon="camera-reverse" onPress={()=>setCameraFacing(value=>value==='user'?'environment':'user')}/></>}
      <View style={[s.profile,{backgroundColor:c.surface,borderColor:c.border}]}><Avatar profile={profile}/><View style={s.row}><Button label="Foto" icon="image" onPress={choosePhoto}/><Button label="Avatares" icon="happy" onPress={()=>setPresetsOpen(!presetsOpen)}/>{!!profile.avatar&&<Button label="Remover" icon="trash" onPress={()=>setProfile(p=>({...p,avatar:''}))}/>}</View>{presetsOpen&&<Presets onChoose={avatar=>{setProfile(p=>({...p,avatar}));setPresetsOpen(false)}}/>}<TextInput accessibilityLabel="Seu nome" placeholder="Seu nome" placeholderTextColor={c.muted} maxLength={48} value={profile.name} onChangeText={name=>setProfile(p=>({...p,name}))} style={[s.input,{color:c.text,borderColor:c.border}]}/><Text style={{color:c.muted}}>Seu perfil fica salvo neste aparelho.</Text></View>
      {screen==='home'?<View style={s.section}><Button label="Nova reunião" icon="add-circle" onPress={()=>{setMode('create');setError('');setScreen('preview')}}/><TextInput accessibilityLabel="Código ou link da reunião" placeholder="Código ou link da reunião" placeholderTextColor={c.muted} value={code} onChangeText={setCode} onFocus={()=>setTimeout(()=>homeScroll.current?.scrollToEnd({animated:true}),200)} autoCapitalize="none" autoCorrect={false} style={[s.input,{color:c.text,borderColor:c.border}]}/><Button label="Participar" icon="enter" disabled={!roomCode(code)} onPress={()=>{setMode('join');setError('');setScreen('preview')}}/><Text style={{color:c.muted}}>Windows, navegador, Android e iPhone nas mesmas salas.</Text></View>:<View style={s.section}>
        <Text style={{color:c.muted}}>Câmera e microfone começam desligados. Ative somente se desejar.</Text>
        <View style={s.setting}><Ionicons name="mic" size={24} color={c.text}/><Text style={{color:c.text,flex:1}}>Entrar com microfone</Text><Switch accessibilityLabel="Entrar com microfone" value={mic} onValueChange={setMic}/></View>
        <View style={s.setting}><Ionicons name="videocam" size={24} color={c.text}/><Text style={{color:c.text,flex:1}}>Entrar com câmera</Text><Switch accessibilityLabel="Entrar com câmera" value={camera} onValueChange={setCamera}/></View>
        <View style={s.checks}><Text style={[s.subtitle,{color:c.text}]}>Teste antes de entrar</Text><DeviceCheck label="Câmera" state={checks.camera} detail={checks.camera==='good'?'Imagem pronta':checks.camera==='checking'?'Verificando…':checks.camera==='bad'?'Não foi possível iniciar':'Desligada — você pode entrar assim'}/><DeviceCheck label="Microfone" state={checks.microphone} detail={checks.microphone==='good'?'Permissão e captura prontas':checks.microphone==='checking'?'Verificando…':checks.microphone==='bad'?'Não foi possível iniciar':'Desligado — você pode entrar assim'}/><DeviceCheck label="Internet" state={checks.network} detail={networkDetail}/><Button label="Testar novamente" icon="refresh" onPress={()=>setPreviewRevision(value=>value+1)}/></View>
        <Button label={busy?'Conectando…':mode==='create'?'Criar reunião':'Solicitar entrada'} icon="arrow-forward-circle" onPress={enter} disabled={busy}/>
      </View>}</>}
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </ScrollView>}
    <Modal visible={settingsOpen} animationType="slide" onRequestClose={()=>setSettingsOpen(false)}><SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><ScrollView contentContainerStyle={s.page}><Text style={[s.title,{color:c.text}]}>Seu estilo</Text><Text style={{color:c.muted}}>O tema vale para todas as telas e fica salvo neste aparelho.</Text><ThemeChoices value={theme} onChange={setTheme}/><Button label="Concluir" icon="checkmark-circle" onPress={()=>setSettingsOpen(false)}/></ScrollView></SafeAreaView></Modal>
  </KeyboardAvoidingView></SafeAreaView></Theme.Provider>;
}

function Meeting({auth,onLeave,theme,setTheme}:{auth:Auth;onLeave:()=>void;theme:ThemeName;setTheme:(theme:ThemeName)=>void}) {
  const room=useRoomContext(),c=React.useContext(Theme);
  const {width,height}=useWindowDimensions();const wide=width>=700||width>height;
  const [toolsOpen,setToolsOpen]=useState(false),[speakers,setSpeakers]=useState<Set<string>>(new Set());
  const tracks=useTracks([Track.Source.Camera,Track.Source.ScreenShare]);
  const [,refresh]=useState(0),[connection,setConnection]=useState(room.state),[quality,setQuality]=useState('unknown');
  const [panel,setPanel]=useState<'people'|'chat'|null>(null),[pending,setPending]=useState<Pending[]>([]);
  const [locked,setLocked]=useState(false);
  const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState('');
  const [raised,setRaised]=useState<Set<string>>(new Set()),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [focused,setFocused]=useState<string|null>(null),[fitMode,setFitMode]=useState<'contain'|'cover'>('contain'),[unread,setUnread]=useState(0);
  const [shareSettingsOpen,setShareSettingsOpen]=useState(false),[shareResolution,setShareResolution]=useState<ShareResolution>('source'),[shareFps,setShareFps]=useState<ShareFps>(30);
  const [viewerMode,setViewerMode]=useState<ViewerMode>('screen'),[zoom,setZoom]=useState(1);
  const [facing,setFacing]=useState<'user'|'environment'>('user');
  const screenCaptureRef=useRef<React.ElementRef<typeof ScreenCapturePickerView>>(null);
  const [audioOutputs,setAudioOutputs]=useState<string[]|null>(null);
  const panelRef=useRef(panel);panelRef.current=panel;
  const connected=connection==='connected';
  const participants=[room.localParticipant,...Array.from(room.remoteParticipants.values())];
  const update=()=>refresh(n=>n+1);
  useEffect(()=>{
    if(focused===null){void ScreenOrientation.unlockAsync().catch(()=>{});return}
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(()=>{});
    return()=>{void ScreenOrientation.unlockAsync().catch(()=>{})};
  },[focused]);
  useEffect(()=>{void AsyncStorage.getItem('kpnc-share-quality').then(value=>{
    if(!value)return;
    try {
      const saved=JSON.parse(value) as {resolution?:ShareResolution;fps?:ShareFps};
      if(SHARE_RESOLUTIONS.includes(saved.resolution as ShareResolution))setShareResolution(saved.resolution as ShareResolution);
      if(SHARE_FPS.includes(saved.fps as ShareFps))setShareFps(saved.fps as ShareFps);
    } catch {}
  })},[]);
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
    room.on(RoomEvent.DataReceived,data);room.on(RoomEvent.ConnectionStateChanged,setConnection);setConnection(room.state);
    const qualityChanged=(value:unknown,participant:Participant)=>{if(participant===room.localParticipant||participant?.identity===room.localParticipant.identity)setQuality(String(value).toLowerCase())};room.on(RoomEvent.ConnectionQualityChanged,qualityChanged);
    const active=(list:Participant[])=>setSpeakers(new Set(list.map(p=>p.identity)));room.on(RoomEvent.ActiveSpeakersChanged,active);
    return()=>{for(const event of events)room.off(event,update);room.off(RoomEvent.DataReceived,data);room.off(RoomEvent.ConnectionStateChanged,setConnection);room.off(RoomEvent.ConnectionQualityChanged,qualityChanged);room.off(RoomEvent.ActiveSpeakersChanged,active)};
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
  async function act(fn:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');try{await fn();update()}catch(error){console.warn('MEET_MEDIA_ACTION_FAILED',{name:error instanceof Error?error.name:'Error',message:errorMessage(error)});setError(errorMessage(error)+(Platform.OS==='android'&&/permission|denied|notallowed/i.test(errorMessage(error))?' Se você negou a permissão, autorize câmera/microfone nas configurações do Android.':''))}finally{setBusy(false)}}
  const publish=(topic:string,data:unknown)=>room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(data)),{reliable:true,topic});
  async function decide(id:string,decision:'admit'|'deny') {await api(`/api/rooms/${auth.room}/requests/${id}/${decision}`,post({},auth.hostKey));setPending(items=>items.filter(item=>item.id!==id))}
  async function toggleLock(){const result=await api<{locked:boolean}>(`/api/rooms/${auth.room}/settings`,post({locked:!locked},auth.hostKey));setLocked(result.locked)}
  async function muteAll(){const targets=participants.filter(p=>p!==room.localParticipant).map(p=>({p,track:p.getTrackPublication(Track.Source.Microphone)})).filter(item=>item.track&&!item.track.isMuted);await Promise.all(targets.map(({p,track})=>api(`/api/rooms/${auth.room}/participants/${encodeURIComponent(p.identity)}/mute`,post({trackSid:track?.trackSid},auth.hostKey))))}
  async function send(){const text=draft.trim().slice(0,500);if(!text)return;await publish('chat',{text,name:room.localParticipant.name,at:Date.now()});setMessages(items=>[...items,{id:`${Date.now()}-local`,name:'Você',text}].slice(-200));setDraft('')}
  async function hand(){const id=room.localParticipant.identity,on=!raised.has(id);await publish('hand',{raised:on});setRaised(current=>{const next=new Set(current);on?next.add(id):next.delete(id);return next})}
  async function switchCamera(){const track=room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;if(track instanceof LocalVideoTrack){const next=facing==='user'?'environment':'user';await track.restartTrack({facingMode:next});setFacing(next)}}
  async function startScreenShare(){
    const participant=room.localParticipant;
    if(Platform.OS==='ios'){
      const node=findNodeHandle(screenCaptureRef.current);
      if(!node||!NativeModules.ScreenCapturePickerViewManager)throw new Error('O seletor de transmissão não está disponível neste aparelho.');
      await NativeModules.ScreenCapturePickerViewManager.show(node);
    }
    const size=shareResolution==='source'?undefined:SHARE_SIZES[shareResolution];
    const options={
      ...(size?{resolution:{...size,frameRate:shareFps}}:{}),
      contentHint:(shareFps>=60?'motion':'detail') as 'motion'|'detail'
    };
    await participant.setScreenShareEnabled(true,options);
    await AsyncStorage.setItem('kpnc-share-quality',JSON.stringify({resolution:shareResolution,fps:shareFps}));
    setShareSettingsOpen(false);
  }
  function openViewer(key:string){setViewerMode('screen');setFitMode('contain');setZoom(1);setFocused(key)}
  function closeViewer(){setFocused(null);setViewerMode('screen');setZoom(1)}
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
  const tile=(item:(typeof tiles)[number],fullscreen=false)=><View key={item.key} style={[s.tile,{backgroundColor:c.surface,borderColor:speakers.has(item.participant.identity)?'#32d583':c.border,width:fullscreen?'100%':wide?'48.5%':'100%',height:fullscreen?undefined:(wide?Math.max(150,height*.5):Math.min(310,width*.7))},fullscreen&&s.fullTile]}>
    {item.track?<VideoTrack trackRef={item.track} style={[StyleSheet.absoluteFill,fullscreen&&zoom!==1&&{transform:[{scale:zoom}]}]} objectFit={item.track.source===Track.Source.ScreenShare?(fullscreen?fitMode:'contain'):'cover'}/>:<Avatar profile={participantProfile(item.participant)}/>}
    <View style={s.tileCaption}><Ionicons name={item.participant.isMicrophoneEnabled?'mic':'mic-off'} size={16} color="white"/><Text numberOfLines={1} style={s.tileName}>{item.participant.name||'Participante'}{item.participant===room.localParticipant?' (você)':''}{raised.has(item.participant.identity)?' · ✋':''}</Text>{fullscreen&&item.track?.source===Track.Source.ScreenShare&&<Pressable accessibilityRole="button" accessibilityLabel={fitMode==='contain'?'Preencher a tela':'Mostrar a tela inteira'} onPress={()=>setFitMode(value=>value==='contain'?'cover':'contain')}><Ionicons name={fitMode==='contain'?'scan-outline':'contract-outline'} color="white" size={25}/></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel={fullscreen?'Sair da tela cheia':'Ampliar transmissão'} onPress={()=>fullscreen?closeViewer():openViewer(item.key)}><Ionicons name={fullscreen?'contract-outline':'expand-outline'} color="white" size={25}/></Pressable></View>
  </View>;
  const connectionText=!connected?(connection==='reconnecting'?'Reconectando…':'Conectando…'):({excellent:'Conexão ótima',good:'Conexão boa',poor:'Conexão instável',lost:'Conexão perdida'} as Record<string,string>)[quality]||'Conectado';
  return <View style={s.root}><StatusBar hidden={focused!==null} style="light"/>
    {Platform.OS==='ios'&&<View style={{width:1,height:1,position:'absolute',overflow:'hidden'}} pointerEvents="none"><ScreenCapturePickerView ref={screenCaptureRef}/></View>}
    <View style={[s.meetingHeader,{borderColor:c.border}]}><View style={{flex:1,minWidth:0}}><Text style={[s.brand,{color:c.text}]}>Kpnc Meet</Text><Text numberOfLines={2} style={{fontSize:12,color:quality==='poor'||quality==='lost'?'#e3a326':connected?'#43bb97':c.muted}}>{connectionText} · {auth.room}</Text></View><Button label="Convidar" icon="link" onPress={()=>void Share.share({message:`Entre no Kpnc Meet: ${WEBSITE}/?room=${auth.room}`})}/></View>
    <ScrollView contentContainerStyle={[s.grid,wide&&{flexDirection:'row',flexWrap:'wrap'}]}>{tiles.map(item=>tile(item))}</ScrollView>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <View style={[s.primaryControls,{borderColor:c.border,backgroundColor:c.surface}]}>
      {([
        [room.localParticipant.isMicrophoneEnabled?'mic':'mic-off','Mic',()=>void act(()=>room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled,{echoCancellation:true,noiseSuppression:true,autoGainControl:true})),busy||!connected],
        [room.localParticipant.isCameraEnabled?'videocam':'videocam-off','Câmera',()=>void act(()=>room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled)),busy||!connected],
        ['chatbubbles',unread?'Chat ('+unread+')':'Chat',()=>{setPanel('chat');setUnread(0)},false],
        ['people',pending.length?'Pessoas ('+pending.length+')':'Pessoas',()=>setPanel('people'),false],
        ['grid','Mais',()=>setToolsOpen(true),false],
        ['call','Sair',leave,false]
      ] as [Glyph,string,()=>void,boolean][]).map(([icon,label,onPress,disabled])=><Pressable key={label.split(' ')[0]} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[s.primaryControl,{opacity:disabled?.4:1}]}><View style={[s.controlIcon,{backgroundColor:label==='Sair'?'#bd314c':c.bg}]}><Ionicons name={icon} size={22} color={label==='Sair'?'white':c.text}/></View><Text numberOfLines={1} style={{color:c.text,fontSize:10}}>{label}</Text></Pressable>)}
    </View>
    <Modal visible={toolsOpen} animationType="slide" onRequestClose={()=>setToolsOpen(false)}><SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><ScrollView contentContainerStyle={s.page}><Text style={[s.title,{color:c.text}]}>Na sua reunião</Text>
      <Button label={room.localParticipant.isScreenShareEnabled?'Parar apresentação':'Compartilhar tela'} icon="easel" disabled={busy||!connected} onPress={()=>{setToolsOpen(false);if(room.localParticipant.isScreenShareEnabled)void act(()=>room.localParticipant.setScreenShareEnabled(false));else setShareSettingsOpen(true)}}/>
      <Button label={raised.has(room.localParticipant.identity)?'Baixar mão':'Levantar mão'} icon="hand-left" disabled={busy||!connected} onPress={()=>void act(hand)}/>
      <Button label="Saída de áudio" icon="volume-high" disabled={busy||!connected} onPress={()=>{setToolsOpen(false);void act(selectOutput)}}/>
      {room.localParticipant.isCameraEnabled&&<Button label="Inverter câmera" icon="camera-reverse" disabled={busy} onPress={()=>void act(switchCamera)}/>}
      <Text style={[s.subtitle,{color:c.text}]}>Tema</Text><ThemeChoices value={theme} onChange={setTheme}/><Button label="Voltar à reunião" icon="arrow-back-circle" onPress={()=>setToolsOpen(false)}/>
    </ScrollView></SafeAreaView></Modal>
    <Modal visible={shareSettingsOpen} animationType="slide" onRequestClose={()=>setShareSettingsOpen(false)}><SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><ScrollView contentContainerStyle={s.page}>
      <Text style={[s.title,{color:c.text}]}>Qualidade da transmissão</Text>
      <Text style={{color:c.muted}}>O aparelho e a conexão podem adaptar a qualidade quando o formato escolhido não estiver disponível.</Text>
      <Text style={[s.subtitle,{color:c.text}]}>Resolução</Text><View style={s.choiceGrid}>{SHARE_RESOLUTIONS.map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:shareResolution===value}} onPress={()=>setShareResolution(value)} style={[s.choice,{borderColor:shareResolution===value?c.accent:c.border,backgroundColor:shareResolution===value?c.accent+'22':c.surface}]}><Text style={{color:c.text,fontWeight:'700'}}>{value==='source'?'Source':value+'p'}</Text></Pressable>)}</View>
      <Text style={[s.subtitle,{color:c.text}]}>Quadros por segundo</Text><View style={s.choiceGrid}>{SHARE_FPS.map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:shareFps===value}} onPress={()=>setShareFps(value)} style={[s.choice,{borderColor:shareFps===value?c.accent:c.border,backgroundColor:shareFps===value?c.accent+'22':c.surface}]}><Text style={{color:c.text,fontWeight:'700'}}>{value} FPS</Text></Pressable>)}</View>
      <Button label="Iniciar transmissão" icon="easel" disabled={busy||!connected} onPress={()=>void act(startScreenShare)}/><Button label="Cancelar" icon="close" onPress={()=>setShareSettingsOpen(false)}/>
    </ScrollView></SafeAreaView></Modal>
    <Modal visible={focused!==null} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={closeViewer} supportedOrientations={['portrait','landscape']}><SafeAreaView style={[s.root,{backgroundColor:'#000'}]}>
      <View style={s.viewerToolbar}>
        <Pressable accessibilityRole="button" accessibilityState={{selected:viewerMode==='screen'}} accessibilityLabel="Somente transmissão" onPress={()=>setViewerMode('screen')} style={s.viewerAction}><Ionicons name="easel" color="white" size={22}/><Text style={s.viewerActionText}>Tela</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{selected:viewerMode==='chat'}} accessibilityLabel="Transmissão com chat" onPress={()=>setViewerMode('chat')} style={s.viewerAction}><Ionicons name="chatbubbles" color="white" size={22}/><Text style={s.viewerActionText}>Tela + chat</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Diminuir zoom" disabled={zoom<=1} onPress={()=>setZoom(value=>Math.max(1,Math.round((value-.25)*100)/100))} style={[s.viewerAction,{opacity:zoom<=1?.35:1}]}><Ionicons name="remove" color="white" size={24}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Restaurar zoom" onPress={()=>setZoom(1)} style={s.viewerAction}><Text style={s.viewerActionText}>{Math.round(zoom*100)}%</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Aumentar zoom" disabled={zoom>=3} onPress={()=>setZoom(value=>Math.min(3,Math.round((value+.25)*100)/100))} style={[s.viewerAction,{opacity:zoom>=3?.35:1}]}><Ionicons name="add" color="white" size={24}/></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sair da tela cheia" onPress={closeViewer} style={s.viewerAction}><Ionicons name="close" color="white" size={25}/></Pressable>
      </View>
      <View style={[s.viewerBody,{flexDirection:wide?'row':'column'}]}>
        <View style={s.viewerStage}>{tiles.find(t=>t.key===focused)?tile(tiles.find(t=>t.key===focused)!,true):<Text style={{color:'white',padding:24}}>A transmissão terminou.</Text>}</View>
        {viewerMode==='chat'&&<KeyboardAvoidingView style={[s.viewerChat,{backgroundColor:c.bg}]} behavior={Platform.OS==='ios'?'padding':'height'}><ScrollView contentContainerStyle={s.viewerMessages} keyboardShouldPersistTaps="handled">{messages.length===0&&<Text style={{color:c.muted}}>As mensagens aparecem aqui durante a reunião.</Text>}{messages.map(m=><View key={m.id} style={[s.bubble,{backgroundColor:c.surface}]}><Text style={{color:c.accent,fontWeight:'700'}}>{m.name}</Text><Text selectable style={{color:c.text}}>{m.text}</Text></View>)}</ScrollView><View style={s.viewerComposer}><TextInput accessibilityLabel="Mensagem no modo imersivo" placeholder="Escreva uma mensagem" placeholderTextColor={c.muted} value={draft} onChangeText={setDraft} maxLength={500} style={[s.input,{color:c.text,borderColor:c.border,flex:1}]} onSubmitEditing={()=>void act(send)}/><Pressable accessibilityRole="button" accessibilityLabel="Enviar mensagem" disabled={busy||!draft.trim()||!connected} onPress={()=>void act(send)} style={[s.viewerSend,{backgroundColor:c.accent,opacity:busy||!draft.trim()||!connected?.4:1}]}><Ionicons name="send" color="white" size={21}/></Pressable></View></KeyboardAvoidingView>}
      </View>
    </SafeAreaView></Modal>
    <Modal visible={audioOutputs!==null} onRequestClose={()=>setAudioOutputs(null)}><SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><View style={s.section}><Text style={[s.title,{color:c.text}]}>Saída de áudio</Text>{audioOutputs?.map(output=><Button key={output} label={({speaker:'Alto-falante',earpiece:'Fone do aparelho',bluetooth:'Bluetooth',headset:'Fone de ouvido'} as Record<string,string>)[output]||output} icon="volume-high" disabled={busy} onPress={()=>void act(async()=>{await AudioSession.selectAudioOutput(output);setAudioOutputs(null)})}/>)}<Button label="Voltar" icon="arrow-back" onPress={()=>setAudioOutputs(null)}/></View></SafeAreaView></Modal>
    <Modal visible={panel!==null} animationType="slide" onRequestClose={()=>setPanel(null)}><SafeAreaView style={[s.root,{backgroundColor:c.bg}]}><KeyboardAvoidingView style={s.root} behavior={Platform.OS==='ios'?'padding':'height'}><View style={s.meetingHeader}><Text style={[s.brand,{color:c.text,flex:1}]}>{panel==='chat'?'Chat da reunião':'Participantes'}</Text><Button label="Fechar" icon="close" onPress={()=>setPanel(null)}/></View>
      {panel==='chat'?<><ScrollView contentContainerStyle={s.section} keyboardShouldPersistTaps="handled">{messages.length===0&&<Text style={{color:c.muted}}>As mensagens aparecem aqui durante a reunião.</Text>}{messages.map(m=><View key={m.id} style={[s.bubble,{backgroundColor:c.surface}]}><Text style={{color:c.accent,fontWeight:'700'}}>{m.name}</Text><Text selectable style={{color:c.text}}>{m.text}</Text></View>)}</ScrollView><View style={s.composer}><TextInput accessibilityLabel="Mensagem" placeholder="Escreva uma mensagem" placeholderTextColor={c.muted} value={draft} onChangeText={setDraft} maxLength={500} style={[s.input,{color:c.text,borderColor:c.border,flex:1}]} onSubmitEditing={()=>void act(send)}/><Button label="Enviar" icon="send" disabled={busy||!draft.trim()||!connected} onPress={()=>void act(send)}/></View></>:<ScrollView contentContainerStyle={s.section}>
        {auth.host&&<><Text style={[s.subtitle,{color:c.text}]}>Aguardando para entrar ({pending.length})</Text>{pending.map(p=><View key={p.id} style={[s.bubble,{backgroundColor:c.surface}]}><Text style={{color:c.text}}>{p.name}</Text><View style={s.row}><Button label="Aceitar" icon="checkmark" disabled={busy} onPress={()=>void act(()=>decide(p.id,'admit'))}/><Button label="Recusar" icon="close" disabled={busy} onPress={()=>void act(()=>decide(p.id,'deny'))}/></View></View>)}</>}
        <Text style={[s.subtitle,{color:c.text}]}>Na reunião ({participants.length})</Text>{participants.map(p=><View key={p.identity} style={[s.bubble,{backgroundColor:c.surface}]}><View style={s.row}><Avatar profile={participantProfile(p)} size={40}/><Text style={{color:c.text,flex:1}}>{p.name||'Participante'}{p===room.localParticipant?' (você)':''}{p.identity.startsWith('host-')?' · ♛':''}{raised.has(p.identity)?' · ✋':''}</Text><Ionicons name={p.isMicrophoneEnabled?'mic':'mic-off'} size={20} color={c.muted}/></View>{auth.host&&p!==room.localParticipant&&<View style={s.row}><Button label="Silenciar" icon="mic-off" disabled={busy||!p.isMicrophoneEnabled} onPress={()=>void act(async()=>{const trackSid=p.getTrackPublication(Track.Source.Microphone)?.trackSid;if(trackSid)await api(`/api/rooms/${auth.room}/participants/${encodeURIComponent(p.identity)}/mute`,post({trackSid},auth.hostKey))})}/><Button label="Remover" icon="person-remove" disabled={busy} onPress={()=>Alert.alert('Remover participante?',p.name||'Participante',[{text:'Cancelar',style:'cancel'},{text:'Remover',style:'destructive',onPress:()=>void act(()=>api(`/api/rooms/${auth.room}/participants/${encodeURIComponent(p.identity)}/remove`,post({},auth.hostKey)))}])}/></View>}</View>)}
        {auth.host&&<><View style={s.row}><Button label={locked?'Permitir novas entradas':'Bloquear novas entradas'} icon={locked?'lock-open':'lock-closed'} disabled={busy} onPress={()=>void act(toggleLock)}/><Button label="Silenciar todos" icon="mic-off" disabled={busy} onPress={()=>Alert.alert('Silenciar todos?','Os outros participantes ficarão com o microfone desligado.',[{text:'Cancelar',style:'cancel'},{text:'Silenciar',onPress:()=>void act(muteAll)}])}/></View><Button label="Encerrar para todos" icon="stop-circle" danger disabled={busy} onPress={end}/></>}
      </ScrollView>}
      {!!error&&<Text style={s.error}>{error}</Text>}
    </KeyboardAvoidingView></SafeAreaView></Modal>
  </View>;
}
const s=StyleSheet.create({
  root:{flex:1},page:{padding:20,gap:20,paddingBottom:32,width:'100%',maxWidth:780,alignSelf:'center'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},brand:{fontSize:21,fontWeight:'800'},title:{fontSize:30,fontWeight:'800',lineHeight:36},subtitle:{fontSize:20,fontWeight:'700'},section:{padding:18,gap:16},row:{flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},profile:{borderWidth:1,borderRadius:24,padding:22,gap:16,alignItems:'center'},avatar:{backgroundColor:'#308ee3',alignItems:'center',justifyContent:'center'},input:{borderWidth:1,borderRadius:14,padding:16,fontSize:17,minHeight:54,width:'100%'},button:{minHeight:48,padding:12,borderRadius:14,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},buttonText:{fontSize:13,fontWeight:'600'},setting:{flexDirection:'row',alignItems:'center',gap:12,minHeight:48},checks:{gap:9,padding:14,borderRadius:18},deviceCheck:{minHeight:58,padding:12,borderWidth:1,borderRadius:14,flexDirection:'row',alignItems:'center',gap:11},checkDot:{width:10,height:10,borderRadius:5},error:{color:'#e15a6b',padding:14},meetingHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,borderBottomWidth:1,gap:10},grid:{padding:12,gap:12},primaryControls:{flexDirection:'row',padding:8,gap:4,borderTopWidth:1},primaryControl:{flex:1,alignItems:'center',gap:5,minWidth:0},controlIcon:{width:40,height:40,borderRadius:15,alignItems:'center',justifyContent:'center'},tile:{borderWidth:2,height:260,backgroundColor:'#182235',borderRadius:18,overflow:'hidden',alignItems:'center',justifyContent:'center'},fullTile:{flex:1,height:undefined,borderRadius:0},tileCaption:{position:'absolute',bottom:0,left:0,right:0,backgroundColor:'#000a',padding:12,flexDirection:'row',alignItems:'center',gap:8},tileName:{color:'white',flex:1},choiceGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},choice:{minWidth:92,minHeight:48,paddingHorizontal:15,borderRadius:14,borderWidth:1,alignItems:'center',justifyContent:'center'},viewerToolbar:{zIndex:2,minHeight:58,paddingHorizontal:8,paddingVertical:6,backgroundColor:'#080b11ee',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5,flexWrap:'wrap'},viewerAction:{minHeight:42,minWidth:42,paddingHorizontal:10,borderRadius:13,backgroundColor:'#ffffff18',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},viewerActionText:{color:'white',fontSize:12,fontWeight:'700'},viewerBody:{flex:1,minHeight:0},viewerStage:{flex:2,minWidth:0,minHeight:0,overflow:'hidden'},viewerChat:{flex:1,minWidth:280,minHeight:0,borderLeftWidth:1,borderColor:'#ffffff22'},viewerMessages:{padding:10,gap:9},viewerComposer:{padding:8,flexDirection:'row',alignItems:'center',gap:7},viewerSend:{width:48,height:48,borderRadius:14,alignItems:'center',justifyContent:'center'},controls:{padding:10,paddingBottom:16,flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:8,borderTopWidth:1},bubble:{padding:16,borderRadius:16,gap:12},composer:{padding:10,flexDirection:'row',alignItems:'center',gap:8}
});
