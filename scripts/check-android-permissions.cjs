const fs=require('node:fs'),assert=require('node:assert/strict');
const file=process.argv[2];assert(file,'Pass a generated AndroidManifest.xml');
const xml=fs.readFileSync(file,'utf8');
for(const name of ['CAMERA','RECORD_AUDIO']){
 const tag=xml.match(new RegExp('<uses-permission\\b[^>]*android:name="android.permission.'+name+'"[^>]*>'));
 assert(tag,`Missing permission ${name}`);assert(!/tools:node="remove"/.test(tag[0]),`Blocked permission ${name}`);
}
assert(xml.includes('adjustResize'),'Keyboard resize must be enabled');
console.log('PASS: generated Android media permissions and keyboard resize');
