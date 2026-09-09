const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SITE,isMeetURL,meetingLink}=require('../policy.cjs');
test('only exact HTTPS app origin is trusted',()=>{
  assert.ok(isMeetURL(SITE+'/?room=abc-def'));
  for(const url of ['http://kpnc-meet.pages.dev','https://kpnc-meet.pages.dev.evil.test','file:///app','javascript:alert(1)','https://user@kpnc-meet.pages.dev'])assert.equal(isMeetURL(url),false);
});
test('deep links only accept validated room codes',()=>{
  assert.equal(meetingLink('kpncmeet://join/abc-def'),SITE+'/?room=abc-def');
  for(const url of ['kpncmeet://evil/abc-def','kpncmeet://join/%3Cscript%3E','kpncmeet://join/a','https://evil.test'])assert.equal(meetingLink(url),null);
});
