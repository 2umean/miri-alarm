package expo.modules.schedularmalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Re-arms all persisted, still-future alarms after a reboot or an APK update
 * (sideload installs cancel AlarmManager alarms on several OEMs). Alarms whose
 * time passed while the device was off get a loud "missed alarm" notice instead
 * of silently vanishing.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    // Logged so a reboot test can PROVE whether the receiver fired and which
    // action delivered it (e.g. `adb logcat -s SchedularmAlarm`).
    Log.i(AlarmConstants.TAG, "BootReceiver received action=${intent.action}")
    when (intent.action) {
      // FBE devices deliver LOCKED_BOOT_COMPLETED and BOOT_COMPLETED per boot;
      // only the first pass may run — a second would see an alarm that fired in
      // between (possibly ringing right now) as past-due and disturb its entry.
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      "android.intent.action.QUICKBOOT_POWERON",
      "com.htc.intent.action.QUICKBOOT_POWERON" ->
        if (AlarmController.claimBootReArm(context)) reArm(context)
        else Log.i(AlarmConstants.TAG, "BootReceiver: already re-armed this boot — skipping")

      Intent.ACTION_MY_PACKAGE_REPLACED -> reArm(context)
    }
  }

  private fun reArm(context: Context) {
    val now = System.currentTimeMillis()
    val all = AlarmController.loadAll(context)
    val future = all.filter { it.at > now }
    // Only never-delivered entries are misses; fired-but-undismissed ones rang
    // (their ring died with the reboot) and are dropped without a notice.
    val missed = all.filter { it.at <= now && !it.fired }
    Log.i(
      AlarmConstants.TAG,
      "BootReceiver.reArm: ${future.size} future alarm(s) to re-arm, ${missed.size} missed",
    )
    if (missed.isNotEmpty()) {
      // Notification is best-effort (may be blocked) — stash so the in-app
      // banner still reports the miss after re-arming consumes the entries.
      AlarmNotifications.notifyMissed(context, missed)
      AlarmController.stashMissed(context, missed)
    }
    // Always re-persist (even an empty set) so past entries are consumed here —
    // otherwise every later boot would re-report the same alarms.
    AlarmController.scheduleAlarms(context, future)
  }
}
