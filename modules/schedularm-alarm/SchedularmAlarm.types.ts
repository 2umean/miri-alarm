/**
 * Status of the OS gates that can silently break an Android alarm.
 * The first three are hard gates for the ring; the last two harden
 * lock-screen presentation and delivery.
 */
/**
 * One OS-guaranteed alarm in the armed set (Schedularm UI v2, Phase 3). The whole
 * set is armed atomically via scheduleAlarms; re-arming replaces it.
 */
export type NativeAlarm = {
  /** Stable pill id — used as the per-alarm key for scheduling, persistence, and the ring. */
  id: string;
  /** Absolute instant to ring, epoch ms. */
  at: number;
  /** Shown on the ring screen to say which alarm fired (the pill name). */
  label: string;
  /** Departure instant for the ring's countdown chip, epoch ms (0 = unknown). Android only. */
  leaveAt: number;
};

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
