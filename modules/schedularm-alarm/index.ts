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

/** Snapshot of all five permission gates. */
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

/** Build.MANUFACTURER — used to detect aggressive battery-killing OEMs. */
export function getManufacturer(): string {
  return SchedularmAlarm.getManufacturer();
}

/** Whether the app can draw over other apps ("Appear on top" / "Display over other apps"). */
export function canDrawOverlays(): boolean {
  return SchedularmAlarm.canDrawOverlays();
}

/** Whether this package is exempt from battery optimization. */
export function isBatteryOptimizationIgnored(): boolean {
  return SchedularmAlarm.isBatteryOptimizationIgnored();
}

/** Open the system "Appear on top" / "Display over other apps" settings for this app. Re-read status after. */
export async function requestOverlayPermission(): Promise<PermissionStatus> {
  return SchedularmAlarm.requestOverlayPermission();
}

/** Show the battery-optimization-exemption dialog for this app. Re-read status after. */
export async function requestDisableBatteryOptimization(): Promise<PermissionStatus> {
  return SchedularmAlarm.requestDisableBatteryOptimization();
}
