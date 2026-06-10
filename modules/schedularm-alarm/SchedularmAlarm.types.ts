/**
 * Status of the OS gates that can silently break an Android alarm.
 * The first three are hard gates for the ring; the last two harden
 * lock-screen presentation and delivery.
 */
export type PermissionStatus = {
  /** AlarmManager.canScheduleExactAlarms() (API 31+); true on older OS. */
  canScheduleExactAlarms: boolean;
  /** NotificationManager.canUseFullScreenIntent() (API 34+); true on older OS. */
  canUseFullScreenIntent: boolean;
  /** POST_NOTIFICATIONS granted (API 33+); true on older OS. */
  canPostNotifications: boolean;
  /** Settings.canDrawOverlays() — enables the direct full-screen fallback; true on older OS. */
  canDrawOverlays: boolean;
  /** PowerManager.isIgnoringBatteryOptimizations() for this package; true on older OS. */
  isBatteryOptimizationIgnored: boolean;
};
