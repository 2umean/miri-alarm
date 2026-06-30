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
  // A JSON array of {id, at, label, leaveAt, reqCode} — the whole armed set.
  const val PREFS_NAME = "schedularm_alarm_prefs"
  const val KEY_ALARMS = "alarms_json"

  // Notification channel + id (one ring notification at a time).
  const val CHANNEL_ID = "schedularm_alarm_channel"
  const val CHANNEL_NAME = "Alarms"
  const val NOTIFICATION_ID = 4711

  // PendingIntent request codes. Fire/show are per-alarm (base + index) so N
  // alarms get distinct PendingIntents; dismiss/permission are singletons.
  const val REQ_FIRE_BASE = 2000
  const val REQ_SHOW_BASE = 3000
  const val REQ_DISMISS = 1003
  const val REQ_PERMISSION_NOTIFICATIONS = 1004
}
