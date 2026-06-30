import { Platform } from 'react-native';

import * as native from '../../modules/schedularm-alarm';
import { Chain, computeChain, Schedule, reverseCalc } from '../domain';
import { AlarmHealth, deriveHealth, deriveIosHealth } from './alarmHealth';
import { cancelChainAlerts, scheduleChainAlerts } from './chainAlerts';
import { scheduleChainPush } from './chainPushAlerts';

const isAndroid = Platform.OS === 'android';
const isIos = Platform.OS === 'ios';

/** Best-effort: ensure local-notification permission so the companion
 * fall-asleep/leave-home alerts can fire on iOS. Never blocks the AlarmKit
 * wake alarm; failures are swallowed. */
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

  /** Arm the wake-up alarm for a schedule (fires at its derived wake instant). */
  arm(schedule: Schedule): void {
    if (!isAndroid && !isIos) return;
    const d = reverseCalc(schedule);
    native.scheduleAlarm(d.wake, d.leaveHome);
    // Companion fall-asleep/leave-home push alerts — best-effort, never allowed
    // to affect the alarm itself (fire-and-forget, errors swallowed).
    if (isIos) ensureIosNotificationPermission();
    void scheduleChainAlerts(schedule);
  },

  /**
   * v2 arm path (Schedularm UI v2). Phase-2 single-alarm BRIDGE: the earliest
   * alarm pill becomes the one native strong alarm; every other event pill (push,
   * and any later alarm pill) fires a best-effort push. Phase 3 upgrades this to
   * N true native alarms. No-op without a usable arrival.
   */
  armChain(chain: Chain): void {
    if (!isAndroid && !isIos) return;
    const computed = computeChain(chain);
    if (!computed) return;
    const alarmItem = computed.items.find((it) => it.pill.type === 'alarm');
    // leave-instant rides along for the ring countdown; use the arrival anchor.
    if (alarmItem) native.scheduleAlarm(alarmItem.endAt, computed.arrival);
    if (isIos) ensureIosNotificationPermission();
    void scheduleChainPush(chain, alarmItem?.endAt);
  },

  /** Cancel any ringing + scheduled alarm (also clears native boot re-arm on Android). */
  dismiss(): void {
    if (!isAndroid && !isIos) return;
    native.dismiss();
    void cancelChainAlerts();
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

  /** Android only: battery-optimization-exemption dialog (aggressive-OEM onboarding). */
  async requestBattery(): Promise<void> {
    if (!isAndroid) return;
    await native.requestDisableBatteryOptimization();
  },
};
