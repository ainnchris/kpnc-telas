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
test('android branding is configured for modern launchers',()=>{
 assert.equal(config.icon,'./assets/icon.png');
 assert.equal(config.android.package,'dev.kpnc.meet');
 assert.equal(config.android.adaptiveIcon.foregroundImage,'./assets/adaptive-icon.png');
 assert.equal(config.android.adaptiveIcon.monochromeImage,'./assets/monochrome-icon.png');
 for(const file of ['icon.png','adaptive-icon.png','monochrome-icon.png','splash-icon.png'])assert(fs.existsSync(new URL('../assets/'+file,import.meta.url)),file+' missing');
});
test('android updates keep one package and support verified in-app installation',()=>{
 assert.equal(config.runtimeVersion.policy,'appVersion');
 assert(config.android.permissions.includes('REQUEST_INSTALL_PACKAGES'));
 const source=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 assert.match(source,/Updates\.checkForUpdateAsync/);
 assert.match(source,/Crypto\.CryptoDigestAlgorithm\.SHA256/);
 assert.match(source,/android\.intent\.action\.VIEW/);
 assert.match(source,/availableUpdate\.sha256/);
});
test('mobile microphone capture requests voice cleanup',()=>{
 const source=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 assert.match(source,/echoCancellation:true/);
 assert.match(source,/noiseSuppression:true/);
 assert.match(source,/autoGainControl:true/);
});

test('mobile screen sharing offers source through 360p and high frame rates',()=>{
 const source=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 for(const resolution of ["'source'","'1440'","'1080'","'720'","'480'","'360'"])assert(source.includes(resolution),resolution+' missing');
 assert.match(source,/frameRate:shareFps/);
 assert.match(source,/SHARE_FPS:ShareFps\[\]=\[30,60,120\]/);
 assert.match(source,/kpnc-share-quality/);
});
test('immersive mobile viewer keeps fullscreen, zoom, landscape and chat modes together',()=>{
 const source=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 assert.match(source,/OrientationLock\.LANDSCAPE/);
 assert.match(source,/Tela \+ chat/);
 assert.match(source,/Math\.min\(3/);
 assert.match(source,/Math\.max\(1/);
 assert.match(source,/viewerMode==='chat'/);
 assert.match(source,/statusBarTranslucent/);
});
