const fs=require('node:fs'),assert=require('node:assert/strict');
const file=process.argv[2];assert(file,'Pass a generated AndroidManifest.xml');
const xml=fs.readFileSync(file,'utf8');
for(const name of ['CAMERA','RECORD_AUDIO','FOREGROUND_SERVICE','FOREGROUND_SERVICE_MICROPHONE','FOREGROUND_SERVICE_MEDIA_PLAYBACK','POST_NOTIFICATIONS']){
 const tag=xml.match(new RegExp('<uses-permission\\b[^>]*android:name="android.permission.'+name+'"[^>]*>'));
 assert(tag,`Missing permission ${name}`);assert(!/tools:node="remove"/.test(tag[0]),`Blocked permission ${name}`);
}
assert(xml.includes('adjustResize'),'Keyboard resize must be enabled');
assert(/android:name="\.KpncCallService"/.test(xml),'Missing call foreground service');
assert(/android:foregroundServiceType="(?:microphone\|mediaPlayback|mediaPlayback\|microphone)"/.test(xml),'Call service must declare microphone and media playback types');
assert(/android:exported="false"/.test(xml),'Call foreground service must not be exported');
console.log('PASS: generated Android media permissions, foreground call service and keyboard resize');
