/** Snapshot from the native module (Android). All booleans default true on older OS. */
export type NativePermissionSnapshot = {
  canPostNotifications: boolean;
  canScheduleExactAlarms: boolean;
  canUseFullScreenIntent: boolean;
  canDrawOverlays: boolean;
  isBatteryOptimizationIgnored: boolean;
};

export type HealthReason =
  | 'notifications-denied'
  | 'exact-alarm-denied'
  | 'full-screen-denied'
  | 'overlay-denied'
  | 'battery-not-whitelisted';

export type AlarmHealth = {
  /** Ordered list of everything currently at risk (for banner + onboarding). */
  reasons: HealthReason[];
  /** True when no reason would silently break the ring. Gates the green/red banner. */
  isArmReliable: boolean;
  /** Build.MANUFACTURER is a known aggressive battery-killer (spec §8). */
  isAggressiveOEM: boolean;
};

/** Manufacturers that silently kill backgrounded alarms (spec §8, M0 RESULTS). */
const AGGRESSIVE_OEMS = [
  'samsung', 'xiaomi', 'redmi', 'poco', 'huawei', 'honor',
  'oneplus', 'oppo', 'vivo', 'realme', 'meizu',
];

export function deriveHealth(
  snapshot: NativePermissionSnapshot,
  manufacturer: string,
): AlarmHealth {
  const isAggressiveOEM = AGGRESSIVE_OEMS.includes((manufacturer ?? '').toLowerCase());
  const reasons: HealthReason[] = [];

  if (!snapshot.canPostNotifications) reasons.push('notifications-denied');
  if (!snapshot.canScheduleExactAlarms) reasons.push('exact-alarm-denied');
  if (!snapshot.canUseFullScreenIntent) reasons.push('full-screen-denied');
  if (!snapshot.canDrawOverlays) reasons.push('overlay-denied');
  if (isAggressiveOEM && !snapshot.isBatteryOptimizationIgnored) {
    reasons.push('battery-not-whitelisted');
  }

  // Critical = will silently drop the ring. overlay-denied only degrades the
  // lock-screen presentation (heads-up banner instead of auto full-screen).
  const CRITICAL: HealthReason[] = [
    'notifications-denied',
    'exact-alarm-denied',
    'full-screen-denied',
    'battery-not-whitelisted',
  ];
  const isArmReliable = !reasons.some((r) => CRITICAL.includes(r));

  return { reasons, isArmReliable, isAggressiveOEM };
}
