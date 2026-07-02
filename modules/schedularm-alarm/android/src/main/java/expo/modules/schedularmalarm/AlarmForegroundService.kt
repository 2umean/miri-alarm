package expo.modules.schedularmalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Keeps the device awake and loops the system default alarm sound at
 * USAGE_ALARM (ignores ringer/silent and most DND) until dismissed.
 */
class AlarmForegroundService : Service() {
  private var mediaPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var firingId: String? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Which alarm fired — threaded onto the ring Activity + dismiss action so a
    // per-alarm dismiss leaves later alarms armed. Read before building anything.
    firingId = intent?.getStringExtra(AlarmConstants.EXTRA_ALARM_ID)
    startInForeground()
    launchFullScreenIfPermitted()
    acquireWakeLock()
    startAudio()
    startVibration()
    // REDELIVER_INTENT (not STICKY): if the OS kills us under memory pressure, come
    // back ringing AND redeliver the ORIGINAL intent so EXTRA_ALARM_ID survives —
    // otherwise a null-id restart would dismiss the wrong scope.
    return START_REDELIVER_INTENT
  }

  /**
   * On aggressive OEMs the full-screen INTENT only yields a heads-up banner over
   * the lock screen. With SYSTEM_ALERT_WINDOW ("Appear on top") granted, a FGS may
   * start an Activity from the background — so launch the ring screen directly as a
   * fallback. The full-screen intent still fires; whichever surfaces first wins.
   */
  private fun launchFullScreenIfPermitted() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return
    try {
      val intent = Intent(this, AlarmActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        putExtra(AlarmConstants.EXTRA_ALARM_ID, firingId)
      }
      startActivity(intent)
    } catch (e: Exception) {
      Log.e(AlarmConstants.TAG, "Direct AlarmActivity launch failed", e)
    }
  }

  override fun onDestroy() {
    stopAudio()
    vibrator?.cancel()
    releaseWakeLock()
    stopForegroundCompat()
    getSystemService(NotificationManager::class.java)?.cancel(AlarmConstants.NOTIFICATION_ID)
    super.onDestroy()
  }

  // --- Foreground notification ------------------------------------------------

  private fun startInForeground() {
    createChannel()
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        AlarmConstants.NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED
      )
    } else {
      // < API 34: uses the foregroundServiceType declared in the manifest.
      startForeground(AlarmConstants.NOTIFICATION_ID, notification)
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(AlarmConstants.CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      AlarmConstants.CHANNEL_ID,
      AlarmConstants.CHANNEL_NAME,
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Reverse-alarm ring"
      setSound(null, null) // looping audio handled by MediaPlayer, not the channel
      enableVibration(false) // vibration handled by the service
      setBypassDnd(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
      putExtra(AlarmConstants.EXTRA_ALARM_ID, firingId)
    }
    val fullScreenPi = PendingIntent.getActivity(
      this, AlarmConstants.REQ_SHOW_BASE, fullScreenIntent, piFlags()
    )
    val dismissIntent = Intent(this, AlarmReceiver::class.java).apply {
      action = AlarmConstants.ACTION_ALARM_DISMISS
      putExtra(AlarmConstants.EXTRA_ALARM_ID, firingId)
    }
    val dismissPi = PendingIntent.getBroadcast(
      this, AlarmConstants.REQ_DISMISS, dismissIntent, piFlags()
    )

    return NotificationCompat.Builder(this, AlarmConstants.CHANNEL_ID)
      .setContentTitle("MIRI Alarm")
      .setContentText("Alarm — tap to dismiss")
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setSilent(true)
      .setFullScreenIntent(fullScreenPi, true)
      .setContentIntent(fullScreenPi)
      .addAction(android.R.drawable.ic_lock_idle_alarm, "Dismiss", dismissPi)
      .build()
  }

  private fun piFlags(): Int =
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  // --- Audio ------------------------------------------------------------------

  private fun startAudio() {
    try {
      val uri: Uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)
        ?: Settings.System.DEFAULT_ALARM_ALERT_URI
      mediaPlayer = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        setDataSource(applicationContext, uri)
        isLooping = true
        setOnPreparedListener { start() }
        prepareAsync()
      }
    } catch (e: Exception) {
      Log.e(AlarmConstants.TAG, "Failed to start alarm audio", e)
    }
  }

  private fun stopAudio() {
    mediaPlayer?.let {
      try {
        if (it.isPlaying) it.stop()
        it.release()
      } catch (e: Exception) {
        Log.e(AlarmConstants.TAG, "Failed to stop alarm audio", e)
      }
    }
    mediaPlayer = null
  }

  // --- Vibration --------------------------------------------------------------

  private fun startVibration() {
    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (getSystemService(VibratorManager::class.java)).defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(VIBRATOR_SERVICE) as Vibrator
    }
    val pattern = longArrayOf(0, 800, 800) // wait, buzz, gap — repeats
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
    } else {
      @Suppress("DEPRECATION")
      vibrator?.vibrate(pattern, 0)
    }
  }

  // --- Wake lock --------------------------------------------------------------

  private fun acquireWakeLock() {
    val powerManager = getSystemService(POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK, "schedularm:alarm"
    ).apply {
      setReferenceCounted(false)
      acquire(WAKE_LOCK_TIMEOUT_MS)
    }
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  companion object {
    private const val WAKE_LOCK_TIMEOUT_MS = 10 * 60 * 1000L // 10-minute safety cap
  }
}
