import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const withBroadcast=require('../plugins/with-broadcast');
test('broadcast plugin declares signing targets without replacing the EAS project',()=>{
  let config={name:'Kpnc Meet',slug:'kpnc-meet',ios:{bundleIdentifier:'dev.kpnc.meet'},extra:{eas:{projectId:'test-project'}}};
  config=withBroadcast(config);
  config=withBroadcast(config);
  assert.equal(config.extra.eas.projectId,'test-project');
  const extensions=config.extra.eas.build.experimental.ios.appExtensions;
  assert.equal(extensions.length,1);
  assert.equal(extensions[0].bundleIdentifier,'dev.kpnc.meet.broadcast');
  assert.deepEqual(extensions[0].entitlements['com.apple.security.application-groups'],['group.dev.kpnc.meet']);
});
test('broadcast plugin rejects a missing app identity',()=>assert.throws(()=>withBroadcast({}),/bundleIdentifier/));
