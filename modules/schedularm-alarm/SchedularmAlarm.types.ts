/**
 * Status of the OS gates that can silently break an Android alarm.
 * All five must be true for a reliable lock-screen ring.
 */
export type PermissionStatus = {
  /** AlarmManager.canScheduleExactAlarms() (API 31+); true on older OS. */
  canScheduleExactAlarms: boolean;
  /** NotificationManager.canUseFullScreenIntent() (API 34+); true on older OS. */
  canUseFullScreenIntent: boolean;
  /** POST_NOTIFICATIONS granted (API 33+); true on older OS. */
  canPostNotifications: boolean;
  /** Settings.canDrawOverlays() — enables the direct full-screen fallback. */
  canDrawOverlays: boolean;
  /** PowerManager.isIgnoringBatteryOptimizations() for this package. */
  isBatteryOptimizationIgnored: boolean;
};
