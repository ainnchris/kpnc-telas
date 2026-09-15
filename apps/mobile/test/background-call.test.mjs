import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const config=JSON.parse(fs.readFileSync(new URL('../app.json',import.meta.url),'utf8'));
const plugin=fs.readFileSync(new URL('../plugins/with-call-service.js',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../../../.github/workflows/apps.yml',import.meta.url),'utf8');

test('Android declares a private typed foreground call service',()=>{
  const permissions=config.expo.android.permissions;
  for(const name of ['FOREGROUND_SERVICE_MICROPHONE','FOREGROUND_SERVICE_MEDIA_PLAYBACK','POST_NOTIFICATIONS'])assert(permissions.includes(name),`missing ${name}`);
  assert(config.expo.plugins.includes('./plugins/with-call-service'));
  assert(plugin.includes("'android:exported':'false'"));
  assert(plugin.includes("'android:foregroundServiceType':'microphone|mediaPlayback'"));
});

test('persistent notification exposes real call controls',()=>{
  for(const action of ['ACTION_TOGGLE_MIC','ACTION_TOGGLE_SPEAKER','ACTION_LEAVE'])assert(plugin.includes(action),`missing ${action}`);
  assert(plugin.includes('.setOngoing(true)'));
  assert(plugin.includes('ContextCompat.startForegroundService'));
  assert(app.includes("addListener('KpncCallAction'"));
  assert(app.includes("action==='toggleMic'"));
  assert(app.includes("action==='toggleSpeaker'"));
  assert(app.includes("action==='leave'"));
});

test('background mode requests notification consent with a friendly explanation',()=>{
  assert(app.includes('PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS'));
  assert(app.includes('manter a chamada ativa'));
  assert(app.includes('NativeModules.KpncCall?.stop()'));
});

test('Android release build reserves metaspace and limits parallel workers',()=>{
  assert(workflow.includes('MaxMetaspaceSize=1536m'));
  assert(workflow.includes('--max-workers=2'));
  assert(workflow.includes('timeout-minutes: 60'));
});
