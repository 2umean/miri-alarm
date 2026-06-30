package expo.modules.schedularmalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/** One armed alarm. `reqCode` is assigned at schedule time and persisted so the
 *  exact same PendingIntent can be cancelled later (cancel ignores extras, so the
 *  request code is what makes each alarm's PendingIntent distinct). */
data class AlarmEntry(
  val id: String,
  val at: Long,
  val label: String,
  val leaveAt: Long,
  val reqCode: Int,
)

/**
 * Single source of truth for arming / cancelling / silencing the alarm SET.
 * Reused by the JS module, the boot receiver and the full-screen activity.
 * Supports N independent alarms (Phase 3): the whole set is armed atomically and
 * persisted as JSON; each alarm fires, persists and cancels by its own reqCode.
 */
object AlarmController {

  /** Replace the armed set: cancel any prior alarms, persist + schedule the new set. */
  fun scheduleAlarms(context: Context, alarms: List<AlarmEntry>) {
    cancelAllScheduled(context) // cancel PendingIntents of the previously-persisted set
    // Assign a stable, unique request code per alarm (base + index within this set).
    val withCodes = alarms.mapIndexed { i, a -> a.copy(reqCode = AlarmConstants.REQ_FIRE_BASE + i) }
    persistAll(context, withCodes)
    val am = alarmManager(context)
    for (e in withCodes) {
      val info = AlarmManager.AlarmClockInfo(e.at, showPendingIntent(context, e))
      // setAlarmClock is the only API that is BOTH exact AND Doze-exempt.
      am.setAlarmClock(info, firePendingIntent(context, e))
    }
  }

  /** Full dismiss of the WHOLE set: silence the ring AND drop every schedule (app "disarm"). */
  fun dismissAll(context: Context) {
    stopRinging(context)
    cancelAllScheduled(context)
    clearAll(context)
  }

  /**
   * Dismiss the alarm that rang. Single source of truth for the per-alarm vs. whole-set
   * scope decision (used by both the notification action and the ring Activity): a known
   * id drops just that alarm; an unknown/missing id only SILENCES the ring and never
   * cancels the set (so a redelivered null-intent restart can't wipe later alarms).
   */
  fun dismissFired(context: Context, id: String?) {
    if (id != null) dismissOne(context, id) else stopRinging(context)
  }

  /** Dismiss only the alarm that just rang, leaving any later alarms armed (ring "dismiss"). */
  fun dismissOne(context: Context, id: String) {
    stopRinging(context)
    val remaining = loadAll(context).toMutableList()
    val fired = remaining.firstOrNull { it.id == id }
    if (fired != null) {
      cancelPending(context, fired)
      remaining.remove(fired)
    }
    if (remaining.isEmpty()) clearAll(context) else persistAll(context, remaining)
  }

  /** The persisted entry for an id (for the ring screen's label + leave chip). */
  fun findAlarm(context: Context, id: String): AlarmEntry? =
    loadAll(context).firstOrNull { it.id == id }

  /** Stop the ringing foreground service (audio + notification). */
  fun stopRinging(context: Context) {
    context.stopService(Intent(context, AlarmForegroundService::class.java))
  }

  /** All currently-persisted alarms (for boot re-arm and lookups). Parses each
   *  entry independently so one malformed entry drops only itself — never the
   *  whole set (which would silently lose every alarm on boot re-arm). */
  fun loadAll(context: Context): List<AlarmEntry> {
    val raw = prefs(context).getString(AlarmConstants.KEY_ALARMS, null) ?: return emptyList()
    val arr = try {
      JSONArray(raw)
    } catch (e: Exception) {
      Log.e(AlarmConstants.TAG, "Failed to parse persisted alarms array", e)
      return emptyList()
    }
    val out = ArrayList<AlarmEntry>(arr.length())
    for (i in 0 until arr.length()) {
      try {
        val o = arr.getJSONObject(i)
        out.add(
          AlarmEntry(
            id = o.getString("id"),
            at = o.getLong("at"),
            label = o.optString("label", ""),
            leaveAt = o.optLong("leaveAt", 0L),
            reqCode = o.getInt("reqCode"),
          ),
        )
      } catch (e: Exception) {
        Log.e(AlarmConstants.TAG, "Skipping malformed alarm entry at index $i", e)
      }
    }
    return out
  }

  private fun alarmManager(context: Context): AlarmManager =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun cancelAllScheduled(context: Context) {
    val am = alarmManager(context)
    for (e in loadAll(context)) am.cancel(firePendingIntent(context, e))
  }

  private fun cancelPending(context: Context, e: AlarmEntry) {
    alarmManager(context).cancel(firePendingIntent(context, e))
  }

  private fun persistAll(context: Context, alarms: List<AlarmEntry>) {
    val arr = JSONArray()
    for (e in alarms) {
      arr.put(
        JSONObject()
          .put("id", e.id)
          .put("at", e.at)
          .put("label", e.label)
          .put("leaveAt", e.leaveAt)
          .put("reqCode", e.reqCode),
      )
    }
    prefs(context).edit().putString(AlarmConstants.KEY_ALARMS, arr.toString()).apply()
  }

  private fun clearAll(context: Context) =
    prefs(context).edit().remove(AlarmConstants.KEY_ALARMS).apply()

  private fun prefs(context: Context): SharedPreferences {
    // Device-protected storage is readable during direct boot (LOCKED_BOOT_COMPLETED).
    val storageContext =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N)
        context.createDeviceProtectedStorageContext()
      else context
    return storageContext.getSharedPreferences(AlarmConstants.PREFS_NAME, Context.MODE_PRIVATE)
  }

  private fun pendingIntentFlags(): Int =
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  /** Broadcast fired AT alarm time → AlarmReceiver, carrying which alarm fired. */
  private fun firePendingIntent(context: Context, e: AlarmEntry): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java).apply {
      action = AlarmConstants.ACTION_ALARM_FIRE
      putExtra(AlarmConstants.EXTRA_ALARM_ID, e.id)
    }
    return PendingIntent.getBroadcast(context, e.reqCode, intent, pendingIntentFlags())
  }

  /** Shown when the user taps the upcoming-alarm icon → open the app. */
  private fun showPendingIntent(context: Context, e: AlarmEntry): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(context, AlarmActivity::class.java)
    val reqShow = AlarmConstants.REQ_SHOW_BASE + (e.reqCode - AlarmConstants.REQ_FIRE_BASE)
    return PendingIntent.getActivity(context, reqShow, launch, pendingIntentFlags())
  }
}
