package expo.modules.schedularmalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.Date

/**
 * Loud last-resort notifications, separate from the ring FGS notification (which
 * is silent because the service loops its own audio). Used when the normal ring
 * pipeline could not run: a missed alarm discovered at boot, or a fire whose
 * foreground-service start was rejected by the OS.
 */
object AlarmNotifications {

  /** "Your alarm may not have rung" — posted by boot re-arm for past-due entries. */
  fun notifyMissed(context: Context, missed: List<AlarmEntry>) {
    val first = missed.minByOrNull { it.at } ?: return
    // Honors the device 12/24-hour preference, unlike a fixed HH:mm pattern.
    val clock = android.text.format.DateFormat.getTimeFormat(context).format(Date(first.at))
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val contentPi = launch?.let {
      PendingIntent.getActivity(context, AlarmConstants.REQ_MISSED_OPEN, it, piFlags())
    }
    val notification = baseBuilder(context)
      .setContentTitle(context.getString(R.string.missed_alarm_title))
      .setContentText(context.getString(R.string.missed_alarm_body, clock))
      .setAutoCancel(true)
      .apply { if (contentPi != null) setContentIntent(contentPi) }
      .build()
    post(context, AlarmConstants.NOTIFICATION_ID_MISSED, notification)
  }

  /**
   * Best-effort ring when the FGS could not start: an insistent alarm-category
   * notification whose CHANNEL carries the alarm sound (FLAG_INSISTENT loops it),
   * with the same full-screen intent + dismiss action the real ring uses.
   */
  fun notifyFallbackRing(context: Context, alarmId: String?) {
    val fullScreen = Intent(context, AlarmActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
      putExtra(AlarmConstants.EXTRA_ALARM_ID, alarmId)
    }
    val fullScreenPi = PendingIntent.getActivity(
      context, AlarmConstants.REQ_FALLBACK_FULLSCREEN, fullScreen, piFlags()
    )
    val dismiss = Intent(context, AlarmReceiver::class.java).apply {
      action = AlarmConstants.ACTION_ALARM_DISMISS
      putExtra(AlarmConstants.EXTRA_ALARM_ID, alarmId)
    }
    // NOT REQ_DISMISS: the FGS ring notification can be visible at the same time,
    // and a shared request code would rewrite its dismiss target's alarm id.
    val dismissPi = PendingIntent.getBroadcast(
      context, AlarmConstants.REQ_DISMISS_FALLBACK, dismiss, piFlags()
    )
    // Same title convention as the FGS ring notification: the alarm's label leads.
    val label = alarmId?.let { AlarmController.findAlarm(context, it)?.label }.orEmpty()
    val notification = baseBuilder(context)
      .setContentTitle(label.ifBlank { context.getString(R.string.fallback_ring_title) })
      .setContentText(context.getString(R.string.fallback_ring_text))
      .setOngoing(true)
      .setFullScreenIntent(fullScreenPi, true)
      .setContentIntent(fullScreenPi)
      // Android 14+ lets users swipe away even ongoing notifications — count
      // that as a dismiss so the entry doesn't resurface as a false "missed".
      .setDeleteIntent(dismissPi)
      .addAction(
        android.R.drawable.ic_lock_idle_alarm,
        context.getString(R.string.ring_dismiss),
        dismissPi
      )
      .build()
      .apply { flags = flags or Notification.FLAG_INSISTENT }
    post(context, AlarmConstants.NOTIFICATION_ID_FALLBACK, notification)
  }

  /** Remove a posted fallback ring (called when a dismiss lands). */
  fun cancelFallbackRing(context: Context) {
    context.getSystemService(NotificationManager::class.java)
      ?.cancel(AlarmConstants.NOTIFICATION_ID_FALLBACK)
  }

  /**
   * The bundled tone, by NAME (not numeric R id): the channel persists this URI
   * in system settings, and numeric ids can shift across app updates. Unlike the
   * system default alarm sound, an APK resource is always readable — including
   * in direct boot, where a user-picked ringtone can be credential-encrypted
   * (these notices post at LOCKED_BOOT_COMPLETED, i.e. exactly then).
   */
  private fun bundledToneUri(context: Context): Uri =
    Uri.parse("android.resource://${context.packageName}/raw/miri_fallback_alarm")

  private fun baseBuilder(context: Context): NotificationCompat.Builder {
    ensureChannel(context)
    return NotificationCompat.Builder(context, AlarmConstants.ALERT_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      // Pre-O sound (the channel owns it on O+).
      .setSound(bundledToneUri(context), AudioManager.STREAM_ALARM)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(AlarmConstants.ALERT_CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      AlarmConstants.ALERT_CHANNEL_ID,
      context.getString(R.string.alert_channel_name),
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = context.getString(R.string.alert_channel_desc)
      setSound(
        bundledToneUri(context),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      enableVibration(true)
      setBypassDnd(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  private fun post(context: Context, id: Int, notification: Notification) {
    try {
      context.getSystemService(NotificationManager::class.java)?.notify(id, notification)
    } catch (e: Exception) {
      // POST_NOTIFICATIONS denied — nothing more we can do from here.
      Log.e(AlarmConstants.TAG, "Failed to post alert notification $id", e)
    }
  }

  private fun piFlags(): Int =
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
}
