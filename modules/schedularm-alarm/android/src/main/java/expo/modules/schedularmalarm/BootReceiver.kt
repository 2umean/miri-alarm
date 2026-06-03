package expo.modules.schedularmalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Re-arms the persisted alarm after a reboot. */
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
    val epochMs = AlarmController.persistedAlarmAt(context)
    val now = System.currentTimeMillis()
    Log.i(AlarmConstants.TAG, "BootReceiver.reArm persisted=$epochMs now=$now future=${epochMs > now}")
    // Only re-arm an alarm still in the future; past-due is handled by the app
    // layer as a "missed alarm" warning.
    if (epochMs > 0L && epochMs > now) {
      AlarmController.scheduleAlarm(context, epochMs)
      Log.i(AlarmConstants.TAG, "BootReceiver.reArm: re-armed for $epochMs")
    } else {
      Log.i(AlarmConstants.TAG, "BootReceiver.reArm: nothing to re-arm (no alarm or past-due)")
    }
  }
}
