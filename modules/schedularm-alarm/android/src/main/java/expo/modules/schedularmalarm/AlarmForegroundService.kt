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
    try {
      startInForeground()
    } catch (e: Exception) {
      // API 34+ / OEM builds can reject startForeground itself. Never die
      // silently: hand off to the insistent fallback notification instead.
      Log.e(AlarmConstants.TAG, "startForeground failed; posting fallback ring", e)
      AlarmNotifications.notifyFallbackRing(this, firingId)
      stopSelf()
      return START_NOT_STICKY
    }
    launchFullScreenIfPermitted()
    acquireWakeLock()
    // A second alarm can fire while one is still ringing: onStartCommand re-enters
    // on the live instance, so stop the previous audio/vibration first — an
    // overwritten MediaPlayer would keep looping with no way to ever stop it.
    stopAudio()
    stopVibration()
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
    stopVibration()
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

    // Lead with the alarm's label (event emoji + name) — this notification is the
    // ring surface when the phone is unlocked and in use (heads-up banner).
    val label = firingId?.let { AlarmController.findAlarm(this, it)?.label }.orEmpty()
    return NotificationCompat.Builder(this, AlarmConstants.CHANNEL_ID)
      .setContentTitle(label.ifBlank { getString(R.string.fallback_ring_title) })
      .setContentText(getString(R.string.fallback_ring_text))
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setSilent(true)
      .setFullScreenIntent(fullScreenPi, true)
      .setContentIntent(fullScreenPi)
      .addAction(
        android.R.drawable.ic_lock_idle_alarm,
        getString(R.string.ring_dismiss),
        dismissPi
      )
      .build()
  }

  private fun piFlags(): Int =
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  // --- Audio ------------------------------------------------------------------

  /**
   * Ringtone sources in preference order. The user's pick can be unreadable here
   * (a custom media-store song needs READ_MEDIA_AUDIO; credential-encrypted files
   * are unreadable in direct boot before first unlock) — so the chain must end in
   * a bundled tone that can NEVER fail. A silent "ring" is an oversleep.
   */
  private fun audioCandidates(): List<Uri> = listOfNotNull(
    RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM),
    RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE),
    Settings.System.DEFAULT_ALARM_ALERT_URI,
    Uri.parse("android.resource://$packageName/${R.raw.miri_fallback_alarm}"),
  ).distinct()

  /** Try each candidate in order, advancing on both sync and async failures. */
  private fun startAudio(candidates: List<Uri> = audioCandidates(), index: Int = 0) {
    if (index >= candidates.size) {
      Log.e(AlarmConstants.TAG, "Every alarm audio source failed — ringing silently")
      return
    }
    val uri = candidates[index]
    // Build into a local first: the field must only hold successfully-configured
    // players, and the error listener must ignore players it no longer owns
    // (a re-entered onStartCommand may have replaced the field meanwhile).
    val player = MediaPlayer()
    try {
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      player.setDataSource(applicationContext, uri)
      player.isLooping = true
      player.setOnPreparedListener { it.start() }
      player.setOnErrorListener { _, what, extra ->
        if (mediaPlayer === player) {
          Log.e(AlarmConstants.TAG, "Alarm audio error ($what/$extra) on $uri — trying next")
          stopAudio()
          startAudio(candidates, index + 1)
        }
        true
      }
      player.prepareAsync()
      mediaPlayer = player
    } catch (e: Exception) {
      Log.e(AlarmConstants.TAG, "Alarm audio source $uri failed — trying next", e)
      try {
        player.release()
      } catch (releaseError: Exception) {
        Log.e(AlarmConstants.TAG, "Failed to release broken player", releaseError)
      }
      startAudio(candidates, index + 1)
    }
  }

  private fun stopAudio() {
    mediaPlayer?.let {
      // Separate guards: isPlaying throws in the Error state, and release()
      // (valid in every state) must still run or the player leaks.
      try {
        if (it.isPlaying) it.stop()
      } catch (e: Exception) {
        Log.e(AlarmConstants.TAG, "Failed to stop alarm audio", e)
      }
      try {
        it.release()
      } catch (e: Exception) {
        Log.e(AlarmConstants.TAG, "Failed to release alarm audio", e)
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

  private fun stopVibration() {
    vibrator?.cancel()
    vibrator = null
  }

  // --- Wake lock --------------------------------------------------------------

  private fun acquireWakeLock() {
    releaseWakeLock() // re-entry (second alarm) must not orphan the held lock
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
