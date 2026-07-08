package expo.modules.schedularmalarm

/** Shared keys, actions and ids for the bespoke alarm pipeline. */
object AlarmConstants {
  const val TAG = "SchedularmAlarm"

  // Broadcast actions handled by AlarmReceiver.
  const val ACTION_ALARM_FIRE = "expo.modules.schedularmalarm.ACTION_ALARM_FIRE"
  const val ACTION_ALARM_DISMISS = "expo.modules.schedularmalarm.ACTION_ALARM_DISMISS"

  // Which alarm fired/should be dismissed (rides on the fire/dismiss intents).
  const val EXTRA_ALARM_ID = "alarm_id"

  // Persistence (device-protected storage so boot re-arm works pre-unlock).
  // A JSON array of {id, at, label, leaveAt, reqCode, fired} — the whole armed set.
  const val PREFS_NAME = "schedularm_alarm_prefs"
  const val KEY_ALARMS = "alarms_json"
  // Missed alarms found at boot, kept for the in-app banner even when the boot
  // notification could not be shown (notifications blocked).
  const val KEY_MISSED = "missed_json"
  // Settings.Global.BOOT_COUNT of the last boot re-arm — LOCKED_BOOT_COMPLETED
  // and BOOT_COMPLETED both deliver per boot; only the first pass may run.
  const val KEY_LAST_BOOT_REARM = "last_boot_rearm"

  // Notification channel + id (one ring notification at a time).
  const val CHANNEL_ID = "schedularm_alarm_channel"
  const val CHANNEL_NAME = "Alarms"
  const val NOTIFICATION_ID = 4711

  // Loud last-resort channel: missed-alarm notices + the fallback ring posted
  // when the foreground service cannot start. Unlike CHANNEL_ID (silent — the
  // service loops its own audio), this channel carries the alarm sound itself.
  // Name/description live in strings.xml (user-visible in system settings).
  const val ALERT_CHANNEL_ID = "schedularm_alert_channel"
  const val NOTIFICATION_ID_MISSED = 4712
  const val NOTIFICATION_ID_FALLBACK = 4713

  // PendingIntent request codes. Fire/show are per-alarm (base + index) so N
  // alarms get distinct PendingIntents; dismiss/permission are singletons.
  const val REQ_FIRE_BASE = 2000
  const val REQ_SHOW_BASE = 3000
  const val REQ_DISMISS = 1003
  const val REQ_PERMISSION_NOTIFICATIONS = 1004
  const val REQ_MISSED_OPEN = 1005
  const val REQ_FALLBACK_FULLSCREEN = 1006
  // Distinct from REQ_DISMISS: the FGS notification and the fallback ring can be
  // visible at once, and a shared request code would rewrite the other's extras.
  const val REQ_DISMISS_FALLBACK = 1007
}
