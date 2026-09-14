import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync(new URL('../app.json',import.meta.url),'utf8')).expo;
test('photo picker must not globally remove meeting camera/microphone permissions',()=>{
 const picker=config.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-image-picker')[1];
 assert.notEqual(picker.cameraPermission,false);
 assert.notEqual(picker.microphonePermission,false);
 assert(config.android.permissions.includes('CAMERA'));
 assert(config.android.permissions.includes('RECORD_AUDIO'));
});
