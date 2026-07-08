import { requireNativeModule } from 'expo';

import type { MissedAlarm, NativeAlarm, PermissionStatus } from './SchedularmAlarm.types';

export type { MissedAlarm, NativeAlarm, PermissionStatus } from './SchedularmAlarm.types';

// Backed by the native SchedularmAlarmModule (Android: bespoke Kotlin; iOS: AlarmKit).
const SchedularmAlarm = requireNativeModule('SchedularmAlarm');

/**
 * Arm a set of OS-guaranteed alarms atomically (Phase 3). Each fires at its own
 * instant via AlarmManager.setAlarmClock (Android, exact + Doze-exempt, persisted
 * for boot re-arm) / AlarmKit (iOS). Re-arming REPLACES the whole set; pass [] to
 * arm nothing. Returns the native promise — Android resolves immediately (sync);
 * iOS resolves once every alarm is scheduled and REJECTS if any fails (auth
 * revoked, schedule error), so callers must await it before claiming "armed".
 */
export function scheduleAlarms(alarms: NativeAlarm[]): Promise<void> {
  return SchedularmAlarm.scheduleAlarms(alarms);
}

/** Stop any ringing alarm AND cancel every scheduled one (clears boot re-arm). */
export function dismissAll(): void {
  SchedularmAlarm.dismissAll();
}

/**
 * Android only: armed alarms whose time passed with no ring — evidence the OS
 * killed the app (force-stop / "put app to sleep" wipes AlarmManager but not the
 * native store). Read-and-clear: each miss is reported exactly once. Call BEFORE
 * re-arming, which replaces the persisted set and would erase the evidence.
 */
export function consumeMissedAlarms(): MissedAlarm[] {
  return SchedularmAlarm.consumeMissedAlarms();
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

/** AlarmKit authorization state (iOS only; never called on Android). */
export type AuthorizationState = 'authorized' | 'denied' | 'notDetermined';

export function getAuthorizationState(): AuthorizationState {
  return SchedularmAlarm.getAuthorizationState();
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
