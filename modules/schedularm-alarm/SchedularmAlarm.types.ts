/**
 * Status of the three OS gates that can silently break an Android alarm.
 * All three must be true for a reliable lock-screen ring.
 */
export type PermissionStatus = {
  /** AlarmManager.canScheduleExactAlarms() (API 31+); true on older OS. */
  canScheduleExactAlarms: boolean;
  /** NotificationManager.canUseFullScreenIntent() (API 34+); true on older OS. */
  canUseFullScreenIntent: boolean;
  /** POST_NOTIFICATIONS granted (API 33+); true on older OS. */
  canPostNotifications: boolean;
};
