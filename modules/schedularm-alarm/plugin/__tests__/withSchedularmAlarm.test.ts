/**
 * Regression net for the store-critical Android manifest shape. The 2026-07-14
 * store audit pinned these choices; a drive-by "fix" to any of them is a Play
 * policy regression, not a cleanup.
 */
jest.mock('@expo/config-plugins', () => ({
  // Run the plugin's action directly against a minimal manifest fixture
  // instead of Expo's mod pipeline.
  withAndroidManifest: (config: any, action: (cfg: any) => any) => action(config),
  AndroidConfig: {
    Manifest: {
      getMainApplicationOrThrow: (manifest: any) => manifest.manifest.application[0],
    },
  },
}));

// CJS on purpose — see the plugin's header comment.
const withSchedularmAlarm = require('../withSchedularmAlarm');

const runPlugin = () =>
  withSchedularmAlarm({
    modResults: { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } },
  }).modResults.manifest;

const permissionNames = (manifest: any): string[] =>
  manifest['uses-permission'].map((p: any) => p.$['android:name']);

describe('withSchedularmAlarm manifest output', () => {
  it('declares the alarm-app permission set', () => {
    expect(permissionNames(runPlugin())).toEqual(
      expect.arrayContaining([
        'android.permission.USE_EXACT_ALARM',
        'android.permission.SCHEDULE_EXACT_ALARM',
        'android.permission.USE_FULL_SCREEN_INTENT',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_SYSTEM_EXEMPTED',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.POST_NOTIFICATIONS',
      ]),
    );
  });

  it('does NOT request the Play-restricted battery-optimization exemption', () => {
    // Alarm apps are not in Play's acceptable-use table for this permission,
    // and exact alarms already bypass Doze (setAlarmClock).
    expect(permissionNames(runPlugin())).not.toContain(
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    );
  });

  it('caps SCHEDULE_EXACT_ALARM at API 32 (USE_EXACT_ALARM covers 33+)', () => {
    const entry = runPlugin()['uses-permission'].find(
      (p: any) => p.$['android:name'] === 'android.permission.SCHEDULE_EXACT_ALARM',
    );
    expect(entry.$['android:maxSdkVersion']).toBe('32');
  });

  it('keeps the ring service on the declaration-exempt systemExempted FGS type', () => {
    const service = runPlugin().application[0].service.find(
      (s: any) => s.$['android:name'] === 'expo.modules.schedularmalarm.AlarmForegroundService',
    );
    expect(service.$['android:foregroundServiceType']).toBe('systemExempted');
  });
});
