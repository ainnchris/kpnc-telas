const test=require('node:test'),assert=require('node:assert/strict');
const {checkPermission}=require('../permissions.cjs');
test('capture and output selection reach their device picker; media still needs consent',()=>{
 const grants=new Set();
 assert.equal(checkPermission('display-capture',{},grants),true);
 assert.equal(checkPermission('speaker-selection',{},grants),true);
 assert.equal(checkPermission('media',{mediaType:'audio'},grants),false);
 grants.add('audio');
 assert.equal(checkPermission('media',{mediaType:'audio'},grants),true);
 assert.equal(checkPermission('media',{mediaType:'video'},grants),false);
 assert.equal(checkPermission('media',{mediaType:'unknown'},grants),false);
 grants.add('video');
 assert.equal(checkPermission('media',{mediaType:'unknown'},grants),true);
 assert.equal(checkPermission('usb',{},grants),false);
});
