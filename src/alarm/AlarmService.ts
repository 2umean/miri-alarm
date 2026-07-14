import { Platform } from 'react-native';

import * as native from '../../modules/schedularm-alarm';
import { Chain, computeChain } from '../domain';
import { AlarmHealth, deriveHealth, deriveIosHealth } from './alarmHealth';
import { planNativeAlarms } from './alarmPlan';
import { cancelChainPush, scheduleChainPush } from './chainPushAlerts';

const isAndroid = Platform.OS === 'android';
const isIos = Platform.OS === 'ios';

/** Best-effort: ensure local-notification permission so companion push pills can
 * fire on iOS. Never blocks the AlarmKit wake alarm; failures are swallowed. */
function ensureIosNotificationPermission(): void {
  void (async () => {
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.requestPermissionsAsync();
    } catch {
      // expo-notifications unavailable — companion alerts simply won't fire.
    }
  })();
}

/**
 * The safety-critical seam. UI and hooks talk ONLY to this object, never to the
 * native module directly. Android: bespoke Kotlin (AlarmManager.setAlarmClock +
 * full-screen Activity). iOS: AlarmKit (OS-guaranteed ring through silent/Focus).
 */
export const AlarmService = {
  isSupported: isAndroid || isIos,

  /**
   * Arm a chain (Schedularm UI v2, Phase 3): EVERY alarm pill becomes an
   * OS-guaranteed native alarm; push pills go through expo-notifications. Awaits
   * the native scheduling and REJECTS if it fails (e.g. iOS AlarmKit auth), so the
   * caller never marks a chain "armed" when nothing was actually scheduled. No-op
   * without a usable arrival.
   */
  async armChain(chain: Chain): Promise<void> {
    if (!isAndroid && !isIos) return;
    const computed = computeChain(chain);
    if (!computed) return;
    const alarms = planNativeAlarms(computed, Date.now());
    // Await native FIRST — if it throws, the caller leaves the chain un-armed.
    if (alarms.length) await native.scheduleAlarms(alarms);
    if (isIos) ensureIosNotificationPermission();
    // Push pills only; alarm pill ids are excluded (they ring natively).
    void scheduleChainPush(chain, computed, new Set(alarms.map((a) => a.id)));
  },

  /**
   * Android only: alarms that should have rung but provably never did (read-and-
   * clear). Must be called BEFORE any re-arm, which replaces the native store.
   */
  consumeMissed(): native.MissedAlarm[] {
    if (!isAndroid) return [];
    try {
      return native.consumeMissedAlarms();
    } catch (e) {
      console.warn('[AlarmService] consumeMissedAlarms failed:', e);
      return [];
    }
  },

  /** Cancel any ringing + scheduled alarm (also clears native boot re-arm on Android). */
  dismiss(): void {
    if (!isAndroid && !isIos) return;
    native.dismissAll();
    void cancelChainPush();
  },

  /** Current health snapshot. */
  getHealth(): AlarmHealth {
    if (isIos) return deriveIosHealth(native.getAuthorizationState());
    if (isAndroid) return deriveHealth(native.getPermissionsStatus(), native.getManufacturer());
    return { reasons: [], isArmReliable: false, isAggressiveOEM: false };
  },

  /** Route the user to grant the critical permission (Android gates / iOS AlarmKit auth). */
  async requestCritical(): Promise<void> {
    if (!isAndroid && !isIos) return;
    await native.requestPermissions();
  },

  /** Android only: "Appear on top" settings (overlay → full-screen-over-lock fallback). */
  async requestOverlay(): Promise<void> {
    if (!isAndroid) return;
    await native.requestOverlayPermission();
  },

  /** Android only: open the battery-optimization settings list (aggressive-OEM onboarding). */
  async requestBattery(): Promise<void> {
    if (!isAndroid) return;
    await native.requestDisableBatteryOptimization();
  },
};
