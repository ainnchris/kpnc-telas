const fs = require('node:fs');
const path = require('node:path');
const {withInfoPlist,withEntitlementsPlist,withXcodeProject} = require('expo/config-plugins');
const TARGET = 'KpncBroadcast';
const FILES = ['Atomic.swift','DarwinNotificationCenter.swift','SampleHandler.swift','SampleUploader.swift','SocketConnection.swift'];
function xml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
function plist(body){return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>${body}</dict></plist>`}
module.exports = function withBroadcast(config) {
  const bundle=config.ios?.bundleIdentifier;
  if(!bundle)throw new Error('ios.bundleIdentifier is required for screen broadcast');
  const group=`group.${bundle}`;
  config.extra ||= {};
  config.extra.eas ||= {};
  config.extra.eas.build ||= {};
  config.extra.eas.build.experimental ||= {};
  config.extra.eas.build.experimental.ios ||= {};
  const extensionConfig=config.extra.eas.build.experimental.ios;
  extensionConfig.appExtensions=[...(extensionConfig.appExtensions||[]).filter(item=>item.targetName!==TARGET),{targetName:TARGET,bundleIdentifier:`${bundle}.broadcast`,entitlements:{'com.apple.security.application-groups':[group]}}];
  config=withInfoPlist(config,config=>{config.modResults.RTCAppGroupIdentifier=group;config.modResults.RTCScreenSharingExtension=`${bundle}.broadcast`;return config});
  config=withEntitlementsPlist(config,config=>{config.modResults['com.apple.security.application-groups']=Array.from(new Set([...(config.modResults['com.apple.security.application-groups']||[]),group]));return config});
  return withXcodeProject(config,config=>{
    const project=config.modResults;
    const targetDirectory=path.join(config.modRequest.platformProjectRoot,TARGET);
    fs.mkdirSync(targetDirectory,{recursive:true});
    for(const name of [...FILES,'LICENSE','NOTICE'])fs.copyFileSync(path.join(__dirname,'../native/broadcast',name),path.join(targetDirectory,name));
    fs.writeFileSync(path.join(targetDirectory,'Info.plist'),plist(`
      <key>CFBundleDisplayName</key><string>Kpnc Meet · Tela</string>
      <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
      <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
      <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
      <key>CFBundlePackageType</key><string>XPC!</string>
      <key>CFBundleShortVersionString</key><string>${xml(config.version||'0.1.0')}</string>
      <key>CFBundleVersion</key><string>${xml(config.ios?.buildNumber||'1')}</string>
      <key>RTCAppGroupIdentifier</key><string>${xml(group)}</string>
      <key>NSExtension</key><dict>
        <key>NSExtensionPointIdentifier</key><string>com.apple.broadcast-services-upload</string>
        <key>NSExtensionPrincipalClass</key><string>$(PRODUCT_MODULE_NAME).SampleHandler</string>
        <key>RPBroadcastProcessMode</key><string>RPBroadcastProcessModeSampleBuffer</string>
      </dict>`));
    fs.writeFileSync(path.join(targetDirectory,`${TARGET}.entitlements`),plist(`<key>com.apple.security.application-groups</key><array><string>${xml(group)}</string></array>`));
    const existing=Object.entries(project.pbxNativeTargetSection()).find(([key,value])=>!key.endsWith('_comment')&&value.name?.replaceAll('"','')===TARGET);
    const target=existing?{uuid:existing[0],pbxNativeTarget:existing[1]}:project.addTarget(TARGET,'app_extension',TARGET,`${bundle}.broadcast`);
    if(!existing){
      const fileGroup=project.addPbxGroup([],TARGET,TARGET);
      project.addToPbxGroup(fileGroup.uuid,project.getFirstProject().firstProject.mainGroup);
      project.addBuildPhase([],'PBXSourcesBuildPhase','Sources',target.uuid);
      project.addBuildPhase([],'PBXFrameworksBuildPhase','Frameworks',target.uuid);
      project.addBuildPhase([],'PBXResourcesBuildPhase','Resources',target.uuid);
      for(const file of FILES)project.addSourceFile(file,{target:target.uuid},fileGroup.uuid);
      for(const framework of ['ReplayKit.framework','CoreImage.framework','CFNetwork.framework'])project.addFramework(framework,{target:target.uuid});
      project.addResourceFile(`${TARGET}/LICENSE`,{target:target.uuid});
      project.addResourceFile(`${TARGET}/NOTICE`,{target:target.uuid});
    }
    const list=project.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList];
    for(const {value} of list.buildConfigurations){
      Object.assign(project.pbxXCBuildConfigurationSection()[value].buildSettings,{
        PRODUCT_BUNDLE_IDENTIFIER:`"${bundle}.broadcast"`,
        INFOPLIST_FILE:`"${TARGET}/Info.plist"`,
        CODE_SIGN_ENTITLEMENTS:`"${TARGET}/${TARGET}.entitlements"`,
        SWIFT_VERSION:'5.0',IPHONEOS_DEPLOYMENT_TARGET:'16.4',TARGETED_DEVICE_FAMILY:'"1,2"',
        APPLICATION_EXTENSION_API_ONLY:'YES',SKIP_INSTALL:'YES',GENERATE_INFOPLIST_FILE:'NO',
        CODE_SIGN_STYLE:'Automatic',CURRENT_PROJECT_VERSION:config.ios?.buildNumber||'1',MARKETING_VERSION:config.version||'0.1.0',
      });
    }
    return config;
  });
};
