const fs=require('node:fs');
const path=require('node:path');
const {AndroidConfig,withAndroidManifest,withDangerousMod,withMainApplication}=require('expo/config-plugins');

const SERVICE='.KpncCallService';
const PERMISSIONS=[
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.POST_NOTIFICATIONS',
];

function kotlinFiles(packageName){
  return {
    'KpncCallPackage.kt':`package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class KpncCallPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(KpncCallModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`,
    'KpncCallModule.kt':`package ${packageName}

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

class KpncCallModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  init { reactContext = WeakReference(context) }

  override fun getName() = "KpncCall"

  @ReactMethod
  fun start(roomName: String, micEnabled: Boolean, speakerOn: Boolean) {
    KpncCallService.start(context, roomName, micEnabled, speakerOn)
  }

  @ReactMethod
  fun update(micEnabled: Boolean, speakerOn: Boolean) {
    KpncCallService.update(context, micEnabled, speakerOn)
  }

  @ReactMethod
  fun stop() { KpncCallService.stop(context) }

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    if (reactContext?.get() === context) reactContext = null
    super.invalidate()
  }

  companion object {
    @Volatile private var reactContext: WeakReference<ReactApplicationContext>? = null

    fun emit(action: String) {
      val context = reactContext?.get() ?: return
      if (!context.hasActiveReactInstance()) return
      context.runOnUiQueueThread {
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("KpncCallAction", action)
      }
    }
  }
}
`,
    'KpncCallService.kt':`package ${packageName}

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.lang.ref.WeakReference

class KpncCallService : Service() {
  private var roomName = "Reunião"
  private var micEnabled = false
  private var speakerOn = true

  override fun onCreate() {
    super.onCreate()
    current = WeakReference(this)
    createChannel()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_LEAVE -> {
        KpncCallModule.emit("leave")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_TOGGLE_MIC -> KpncCallModule.emit("toggleMic")
      ACTION_TOGGLE_SPEAKER -> KpncCallModule.emit("toggleSpeaker")
      ACTION_START, ACTION_UPDATE -> {
        roomName = intent.getStringExtra(EXTRA_ROOM)?.take(80)?.ifBlank { "Reunião" } ?: roomName
        micEnabled = intent.getBooleanExtra(EXTRA_MIC, micEnabled)
        speakerOn = intent.getBooleanExtra(EXTRA_SPEAKER, speakerOn)
      }
    }
    showNotification()
    return START_STICKY
  }

  fun updateState(mic: Boolean, speaker: Boolean) {
    micEnabled = mic
    speakerOn = speaker
    showNotification()
  }

  private fun showNotification() {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val openIntent = launch?.let { PendingIntent.getActivity(this, 40, it, pendingFlags()) }
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_kpnc_call)
      .setContentTitle("Kpnc Meet · $roomName")
      .setContentText((if (micEnabled) "Microfone ligado" else "Microfone desligado") + " · " + (if (speakerOn) "Alto-falante" else "Fone do aparelho"))
      .setContentIntent(openIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .addAction(R.drawable.ic_kpnc_call, if (micEnabled) "Desligar microfone" else "Ligar microfone", serviceIntent(ACTION_TOGGLE_MIC, 41))
      .addAction(R.drawable.ic_kpnc_call, if (speakerOn) "Usar fone" else "Usar alto-falante", serviceIntent(ACTION_TOGGLE_SPEAKER, 42))
      .addAction(R.drawable.ic_kpnc_call, "Encerrar", serviceIntent(ACTION_LEAVE, 43))
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or
        (if (micEnabled) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
      startForeground(NOTIFICATION_ID, notification, types)
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun serviceIntent(action: String, requestCode: Int): PendingIntent {
    val intent = Intent(this, KpncCallService::class.java).setAction(action)
    return PendingIntent.getService(this, requestCode, intent, pendingFlags())
  }

  private fun pendingFlags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, "Chamada em andamento", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Mantém o áudio e os controles da reunião disponíveis"
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  override fun onDestroy() {
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL_ID = "kpnc_call"
    private const val NOTIFICATION_ID = 2107
    private const val ACTION_START = "dev.kpnc.meet.call.START"
    private const val ACTION_UPDATE = "dev.kpnc.meet.call.UPDATE"
    private const val ACTION_TOGGLE_MIC = "dev.kpnc.meet.call.TOGGLE_MIC"
    private const val ACTION_TOGGLE_SPEAKER = "dev.kpnc.meet.call.TOGGLE_SPEAKER"
    private const val ACTION_LEAVE = "dev.kpnc.meet.call.LEAVE"
    private const val EXTRA_ROOM = "room"
    private const val EXTRA_MIC = "mic"
    private const val EXTRA_SPEAKER = "speaker"
    @Volatile private var current: WeakReference<KpncCallService>? = null

    fun start(context: Context, room: String, mic: Boolean, speaker: Boolean) {
      val intent = Intent(context, KpncCallService::class.java).setAction(ACTION_START)
        .putExtra(EXTRA_ROOM, room).putExtra(EXTRA_MIC, mic).putExtra(EXTRA_SPEAKER, speaker)
      ContextCompat.startForegroundService(context, intent)
    }

    fun update(context: Context, mic: Boolean, speaker: Boolean) {
      current?.get()?.updateState(mic, speaker) ?: start(context, "Reunião", mic, speaker)
    }

    fun stop(context: Context) {
      current?.get()?.let {
        it.stopForeground(Service.STOP_FOREGROUND_REMOVE)
        it.stopSelf()
      } ?: context.stopService(Intent(context, KpncCallService::class.java))
    }
  }
}
`,
  };
}

module.exports=function withCallService(config){
  const packageName=config.android?.package;
  if(!packageName)throw new Error('android.package is required for the call foreground service');

  config=withAndroidManifest(config,config=>{
    const manifest=config.modResults.manifest;
    manifest['uses-permission'] ||= [];
    for(const permission of PERMISSIONS){
      if(!manifest['uses-permission'].some(item=>item.$?.['android:name']===permission))manifest['uses-permission'].push({$:{'android:name':permission}});
    }
    const application=AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.service ||= [];
    application.service=application.service.filter(item=>item.$?.['android:name']!==SERVICE);
    application.service.push({$:{'android:name':SERVICE,'android:exported':'false','android:stopWithTask':'false','android:foregroundServiceType':'microphone|mediaPlayback'}});
    return config;
  });

  config=withMainApplication(config,config=>{
    const marker='PackageList(this).packages.apply {';
    if(!config.modResults.contents.includes('add(KpncCallPackage())')){
      if(!config.modResults.contents.includes(marker))throw new Error('Unable to register KpncCallPackage in MainApplication');
      config.modResults.contents=config.modResults.contents.replace(marker,`${marker}\n              add(KpncCallPackage())`);
    }
    return config;
  });

  return withDangerousMod(config,['android',config=>{
    const sourceDir=path.join(config.modRequest.platformProjectRoot,'app/src/main/java',...packageName.split('.'));
    fs.mkdirSync(sourceDir,{recursive:true});
    for(const [name,contents] of Object.entries(kotlinFiles(packageName)))fs.writeFileSync(path.join(sourceDir,name),contents);
    const drawableDir=path.join(config.modRequest.platformProjectRoot,'app/src/main/res/drawable');
    fs.mkdirSync(drawableDir,{recursive:true});
    fs.writeFileSync(path.join(drawableDir,'ic_kpnc_call.xml'),'<?xml version="1.0" encoding="utf-8"?><vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M6.6,10.8c1.5,3 3.6,5.1 6.6,6.6l2.2,-2.2c0.3,-0.3 0.7,-0.4 1.1,-0.3 1.2,0.4 2.5,0.6 3.8,0.6 0.6,0 1.1,0.5 1.1,1.1v3.7c0,0.6 -0.5,1.1 -1.1,1.1C10.5,21.4 2.6,13.5 2.6,3.7c0,-0.6 0.5,-1.1 1.1,-1.1h3.7c0.6,0 1.1,0.5 1.1,1.1 0,1.3 0.2,2.6 0.6,3.8 0.1,0.4 0,0.8 -0.3,1.1z"/></vector>');
    return config;
  }]);
};
