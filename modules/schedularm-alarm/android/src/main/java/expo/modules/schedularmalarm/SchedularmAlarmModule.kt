package expo.modules.schedularmalarm

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** JS NativeAlarm → native. JS numbers arrive as Double (epoch ms exceeds Int). */
class NativeAlarmRecord : Record {
  @Field var id: String = ""
  @Field var at: Double = 0.0
  @Field var label: String = ""
  @Field var leaveAt: Double = 0.0
}

class SchedularmAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SchedularmAlarm")

    // Arm the whole set atomically (Phase 3). reqCode is assigned inside the
    // controller (base + index); 0 here is just a placeholder.
    Function("scheduleAlarms") { alarms: List<NativeAlarmRecord> ->
      AlarmController.scheduleAlarms(
        context,
        alarms.map { AlarmEntry(it.id, it.at.toLong(), it.label, it.leaveAt.toLong(), 0) },
      )
    }

    Function("dismissAll") {
      AlarmController.dismissAll(context)
    }

    // Entries whose time passed with no ring/dismiss (e.g. force-stop wiped
    // AlarmManager). Consuming clears them so each miss is reported once.
    Function("consumeMissedAlarms") {
      AlarmController.consumeMissedAlarms(context).map {
        mapOf("id" to it.id, "at" to it.at.toDouble(), "label" to it.label)
      }
    }

    Function("canScheduleExactAlarms") { canScheduleExactAlarms() }

    Function("canUseFullScreenIntent") { canUseFullScreenIntent() }

    Function("canPostNotifications") { canPostNotifications() }

    Function("getPermissionsStatus") { permissionsStatus() }

    Function("getManufacturer") { Build.MANUFACTURER ?: "" }

    Function("canDrawOverlays") { canDrawOverlays() }

    Function("isBatteryOptimizationIgnored") { isBatteryOptimizationIgnored() }

    AsyncFunction("requestOverlayPermission") { promise: Promise ->
      openSettings(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
      promise.resolve(permissionsStatus())
    }

    AsyncFunction("requestDisableBatteryOptimization") { promise: Promise ->
      requestIgnoreBatteryOptimization()
      promise.resolve(permissionsStatus())
    }

    AsyncFunction("requestPermissions") { promise: Promise ->
      requestMostCriticalMissingPermission()
      promise.resolve(permissionsStatus())
    }
  }

  // --- Permission checks ------------------------------------------------------

  private fun canScheduleExactAlarms(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return alarmManager.canScheduleExactAlarms()
  }

  private fun canUseFullScreenIntent(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    val notificationManager =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return notificationManager.canUseFullScreenIntent()
  }

  private fun canPostNotifications(): Boolean {
    val compat = NotificationManagerCompat.from(context)
    if (!compat.areNotificationsEnabled()) return false
    // A blocked channel silences its ring surface even when the app-level toggle
    // is on — check the ring channel AND the last-resort alert channel. Channels
    // may not exist before their first use (and never pre-O); null is fine.
    return !isChannelBlocked(compat, AlarmConstants.CHANNEL_ID) &&
      !isChannelBlocked(compat, AlarmConstants.ALERT_CHANNEL_ID)
  }

  private fun isChannelBlocked(compat: NotificationManagerCompat, id: String): Boolean {
    val channel = compat.getNotificationChannelCompat(id) ?: return false
    return channel.importance == NotificationManagerCompat.IMPORTANCE_NONE
  }

  private fun canDrawOverlays(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(context) else true

  private fun isBatteryOptimizationIgnored(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
  }

  private fun requestIgnoreBatteryOptimization() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    // Play restricts the direct-grant dialog (ACTION_REQUEST_IGNORE_BATTERY_
    // OPTIMIZATIONS + its permission) to app classes that don't include alarm
    // apps. Open the optimization LIST instead — the user picks MIRI there.
    // The list action takes no package data URI.
    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    (appContext.currentActivity ?: context).startActivity(intent)
  }

  private fun permissionsStatus(): Map<String, Any> = mapOf(
    "canScheduleExactAlarms" to canScheduleExactAlarms(),
    "canUseFullScreenIntent" to canUseFullScreenIntent(),
    "canPostNotifications" to canPostNotifications(),
    "canDrawOverlays" to canDrawOverlays(),
    "isBatteryOptimizationIgnored" to isBatteryOptimizationIgnored()
  )

  // --- Permission routing -----------------------------------------------------

  /**
   * Route the user to fix the single most critical missing permission.
   * Order: notifications (runtime prompt) → exact alarm → full-screen intent.
   * One per call to avoid stacking settings screens.
   */
  private fun requestMostCriticalMissingPermission() {
    val activity = appContext.currentActivity

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      !canPostNotifications() && activity != null
    ) {
      ActivityCompat.requestPermissions(
        activity,
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        AlarmConstants.REQ_PERMISSION_NOTIFICATIONS
      )
      return
    }

    if (!canScheduleExactAlarms()) {
      openSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
      return
    }

    if (!canUseFullScreenIntent()) {
      openSettings(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
      return
    }
  }

  private fun openSettings(action: String) {
    val intent = Intent(action).apply {
      data = Uri.parse("package:${context.packageName}")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    (appContext.currentActivity ?: context).startActivity(intent)
  }
}
