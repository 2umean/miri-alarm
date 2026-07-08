package expo.modules.schedularmalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Receives the exact alarm broadcast and starts the ringing foreground service
 * for the alarm that fired, and handles the notification "Dismiss" action.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(AlarmConstants.EXTRA_ALARM_ID)
    when (intent.action) {
      AlarmConstants.ACTION_ALARM_DISMISS -> AlarmController.dismissFired(context, id)
      else -> startRinging(context, id) // ACTION_ALARM_FIRE
    }
  }

  private fun startRinging(context: Context, id: String?) {
    // Delivered ≠ dismissed: the fired flag is what separates "rang but not yet
    // dismissed" from "provably never rang" in the missed-alarm detection.
    AlarmController.markFired(context, id)
    val serviceIntent = Intent(context, AlarmForegroundService::class.java)
      .putExtra(AlarmConstants.EXTRA_ALARM_ID, id)
    try {
      // An exact-alarm receiver is temporarily allowlisted to start a FGS.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }
    } catch (e: Exception) {
      // Some OEM power managers reject the FGS start despite the exact-alarm
      // exemption. Never swallow the fire: fall back to an insistent
      // alarm-sound notification with the same full-screen intent.
      Log.e(AlarmConstants.TAG, "FGS start failed; posting fallback ring", e)
      AlarmNotifications.notifyFallbackRing(context, id)
    }
  }
}
