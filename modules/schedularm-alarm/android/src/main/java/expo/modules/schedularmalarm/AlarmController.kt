package expo.modules.schedularmalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/** One armed alarm. `reqCode` is assigned at schedule time and persisted so the
 *  exact same PendingIntent can be cancelled later (cancel ignores extras, so the
 *  request code is what makes each alarm's PendingIntent distinct). `fired` is
 *  set at broadcast delivery: a past entry WITHOUT it provably never rang, while
 *  one WITH it rang and may still be ringing (entries leave the store on dismiss). */
data class AlarmEntry(
  val id: String,
  val at: Long,
  val label: String,
  val leaveAt: Long,
  val reqCode: Int,
  val fired: Boolean = false,
)

/**
 * Single source of truth for arming / cancelling / silencing the alarm SET.
 * Reused by the JS module, the boot receiver and the full-screen activity.
 * Supports N independent alarms (Phase 3): the whole set is armed atomically and
 * persisted as JSON; each alarm fires, persists and cancels by its own reqCode.
 */
object AlarmController {

  private const val MISSED_STASH_CAP = 5

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

  /** Mark an entry as delivered, at broadcast time — see AlarmEntry.fired. */
  fun markFired(context: Context, id: String?) {
    if (id == null) return
    val all = loadAll(context)
    if (all.none { it.id == id }) return
    persistAll(context, all.map { if (it.id == id) it.copy(fired = true) else it })
  }

  /**
   * Return AND remove entries whose time passed without ever being DELIVERED —
   * evidence the alarm never rang (a force-stop or "put app to sleep" wipes
   * AlarmManager but not this store). Fired-but-undismissed entries stay: they
   * rang and may be ringing right now. Also drains the boot-time missed stash.
   * Must run BEFORE a re-arm replaces the set — the JS launch path calls it first.
   */
  fun consumeMissedAlarms(context: Context): List<AlarmEntry> {
    val now = System.currentTimeMillis()
    val all = loadAll(context)
    val missed = all.filter { it.at <= now && !it.fired }
    if (missed.isNotEmpty()) {
      for (e in missed) cancelPending(context, e) // best-effort; the PIs are likely gone
      val keep = all - missed.toSet()
      if (keep.isEmpty()) clearAll(context) else persistAll(context, keep)
    }
    return drainMissedStash(context) + missed
  }

  /**
   * Boot-time misses are ALSO stashed for the in-app banner: the boot
   * notification is best-effort (notifications may be blocked), and re-arming
   * consumes the entries, so without the stash the evidence would be gone.
   */
  fun stashMissed(context: Context, missed: List<AlarmEntry>) {
    val merged = (decode(prefs(context).getString(AlarmConstants.KEY_MISSED, null)) + missed)
      .takeLast(MISSED_STASH_CAP)
    prefs(context).edit().putString(AlarmConstants.KEY_MISSED, encode(merged)).apply()
  }

  private fun drainMissedStash(context: Context): List<AlarmEntry> {
    val stashed = decode(prefs(context).getString(AlarmConstants.KEY_MISSED, null))
    if (stashed.isNotEmpty()) prefs(context).edit().remove(AlarmConstants.KEY_MISSED).apply()
    return stashed
  }

  /**
   * True once per boot: LOCKED_BOOT_COMPLETED and BOOT_COMPLETED both deliver on
   * FBE devices, and the second pass must not run — it would see an alarm that
   * fired in between (and is still ringing) as past-due and disturb its entry.
   */
  fun claimBootReArm(context: Context): Boolean {
    val bootCount = try {
      Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT)
    } catch (e: Exception) {
      Log.w(AlarmConstants.TAG, "BOOT_COUNT unavailable — re-arming without dedupe", e)
      return true // unknown boot id: better to re-arm twice than never
    }
    if (prefs(context).getInt(AlarmConstants.KEY_LAST_BOOT_REARM, -1) == bootCount) return false
    prefs(context).edit().putInt(AlarmConstants.KEY_LAST_BOOT_REARM, bootCount).apply()
    return true
  }

  /** Stop the ringing foreground service (audio + notification) and any fallback ring. */
  fun stopRinging(context: Context) {
    context.stopService(Intent(context, AlarmForegroundService::class.java))
    AlarmNotifications.cancelFallbackRing(context)
  }

  /** All currently-persisted alarms (for boot re-arm and lookups). */
  fun loadAll(context: Context): List<AlarmEntry> =
    decode(prefs(context).getString(AlarmConstants.KEY_ALARMS, null))

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
    prefs(context).edit().putString(AlarmConstants.KEY_ALARMS, encode(alarms)).apply()
  }

  private fun encode(alarms: List<AlarmEntry>): String {
    val arr = JSONArray()
    for (e in alarms) {
      arr.put(
        JSONObject()
          .put("id", e.id)
          .put("at", e.at)
          .put("label", e.label)
          .put("leaveAt", e.leaveAt)
          .put("reqCode", e.reqCode)
          .put("fired", e.fired),
      )
    }
    return arr.toString()
  }

  /** Parses each entry independently so one malformed entry drops only itself —
   *  never the whole set (which would silently lose every alarm on boot re-arm). */
  private fun decode(raw: String?): List<AlarmEntry> {
    if (raw == null) return emptyList()
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
            fired = o.optBoolean("fired", false),
          ),
        )
      } catch (e: Exception) {
        Log.e(AlarmConstants.TAG, "Skipping malformed alarm entry at index $i", e)
      }
    }
    return out
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
