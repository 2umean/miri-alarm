package expo.modules.schedularmalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Re-arms all persisted, still-future alarms after a reboot. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    // Logged so a reboot test can PROVE whether the receiver fired and which
    // action delivered it (e.g. `adb logcat -s SchedularmAlarm`).
    Log.i(AlarmConstants.TAG, "BootReceiver received action=${intent.action}")
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      "android.intent.action.QUICKBOOT_POWERON",
      "com.htc.intent.action.QUICKBOOT_POWERON" -> reArm(context)
    }
  }

  private fun reArm(context: Context) {
    val now = System.currentTimeMillis()
    // Only re-arm alarms still in the future; past-due is handled by the app
    // layer as a "missed alarm" warning. Re-scheduling reassigns request codes
    // and re-persists just the future set (dropping past entries).
    val future = AlarmController.loadAll(context).filter { it.at > now }
    Log.i(AlarmConstants.TAG, "BootReceiver.reArm: ${future.size} future alarm(s) to re-arm")
    if (future.isNotEmpty()) AlarmController.scheduleAlarms(context, future)
  }
}
