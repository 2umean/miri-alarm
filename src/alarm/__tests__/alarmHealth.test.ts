import { deriveHealth, NativePermissionSnapshot } from '../alarmHealth';

const allGranted: NativePermissionSnapshot = {
  canPostNotifications: true,
  canScheduleExactAlarms: true,
  canUseFullScreenIntent: true,
  canDrawOverlays: true,
  isBatteryOptimizationIgnored: true,
};

test('all gates granted on a non-aggressive OEM → reliable, no reasons', () => {
  const h = deriveHealth(allGranted, 'Google');
  expect(h.isArmReliable).toBe(true);
  expect(h.reasons).toEqual([]);
  expect(h.isAggressiveOEM).toBe(false);
});

test('Samsung is flagged as an aggressive OEM (case-insensitive)', () => {
  expect(deriveHealth(allGranted, 'samsung').isAggressiveOEM).toBe(true);
  expect(deriveHealth(allGranted, 'SAMSUNG').isAggressiveOEM).toBe(true);
});

test('a missing exact-alarm gate is critical (blocks reliable arming)', () => {
  const h = deriveHealth({ ...allGranted, canScheduleExactAlarms: false }, 'Google');
  expect(h.reasons).toContain('exact-alarm-denied');
  expect(h.isArmReliable).toBe(false);
});

test('a missing notification gate is critical', () => {
  const h = deriveHealth({ ...allGranted, canPostNotifications: false }, 'Google');
  expect(h.reasons).toContain('notifications-denied');
  expect(h.isArmReliable).toBe(false);
});

test('a missing full-screen gate is critical', () => {
  const h = deriveHealth({ ...allGranted, canUseFullScreenIntent: false }, 'Google');
  expect(h.reasons).toContain('full-screen-denied');
  expect(h.isArmReliable).toBe(false);
});

test('overlay denied is a degrade, NOT critical (alarm still rings, banner-only over lock)', () => {
  const h = deriveHealth({ ...allGranted, canDrawOverlays: false }, 'Google');
  expect(h.reasons).toContain('overlay-denied');
  expect(h.isArmReliable).toBe(true);
});

test('battery not whitelisted is critical ONLY on an aggressive OEM', () => {
  const onSamsung = deriveHealth({ ...allGranted, isBatteryOptimizationIgnored: false }, 'samsung');
  expect(onSamsung.reasons).toContain('battery-not-whitelisted');
  expect(onSamsung.isArmReliable).toBe(false);

  const onPixel = deriveHealth({ ...allGranted, isBatteryOptimizationIgnored: false }, 'Google');
  expect(onPixel.reasons).not.toContain('battery-not-whitelisted');
  expect(onPixel.isArmReliable).toBe(true);
});
