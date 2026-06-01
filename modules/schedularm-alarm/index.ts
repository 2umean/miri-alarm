import { requireNativeModule } from 'expo';

import type { PermissionStatus } from './SchedularmAlarm.types';

export type { PermissionStatus } from './SchedularmAlarm.types';

// Backed by the native SchedularmAlarmModule (Android: bespoke Kotlin; iOS: stub).
const SchedularmAlarm = requireNativeModule('SchedularmAlarm');

/**
 * Arm the single active alarm to fire at an absolute instant (epoch ms).
 * Persists for boot re-arm and uses AlarmManager.setAlarmClock (exact + Doze-exempt).
 */
export function scheduleAlarm(epochMs: number): void {
  SchedularmAlarm.scheduleAlarm(epochMs);
}

/** Stop a ringing alarm AND cancel the scheduled one (clears boot re-arm). */
export function dismiss(): void {
  SchedularmAlarm.dismiss();
}

/** Whether exact alarms can be scheduled right now (else the alarm silently drops). */
export function canScheduleExactAlarms(): boolean {
  return SchedularmAlarm.canScheduleExactAlarms();
}

/** Whether a full-screen intent can show over the lock screen (else heads-up only). */
export function canUseFullScreenIntent(): boolean {
  return SchedularmAlarm.canUseFullScreenIntent();
}

/** Whether notifications are enabled (the ring posts an ongoing FGS notification). */
export function canPostNotifications(): boolean {
  return SchedularmAlarm.canPostNotifications();
}

/** Snapshot of all three permission gates. */
export function getPermissionsStatus(): PermissionStatus {
  return SchedularmAlarm.getPermissionsStatus();
}

/**
 * Route the user to the system settings/prompt for the most critical missing
 * permission (notifications → exact alarm → full-screen intent), one per call.
 * Resolves with the status as known *before* the user acts — re-read with
 * getPermissionsStatus() after they return.
 */
export async function requestPermissions(): Promise<PermissionStatus> {
  return SchedularmAlarm.requestPermissions();
}
