// CommonJS config plugin (NOT .ts): eas-cli does not transpile referenced
// TypeScript plugin files, so the plugin must be plain JS that any tool can require.
const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

const PACKAGE = 'expo.modules.schedularmalarm';

/** All permissions the bespoke alarm pipeline needs. */
const PERMISSIONS = [
  // Auto-granted "core alarm app" declaration — preferred over SCHEDULE_EXACT_ALARM.
  { name: 'android.permission.USE_EXACT_ALARM' },
  // User-grantable fallback on API <= 32 (deprecated by USE_EXACT_ALARM on 33+).
  { name: 'android.permission.SCHEDULE_EXACT_ALARM', maxSdkVersion: '32' },
  { name: 'android.permission.USE_FULL_SCREEN_INTENT' },
  { name: 'android.permission.FOREGROUND_SERVICE' },
  { name: 'android.permission.FOREGROUND_SERVICE_SYSTEM_EXEMPTED' },
  { name: 'android.permission.RECEIVE_BOOT_COMPLETED' },
  { name: 'android.permission.WAKE_LOCK' },
  { name: 'android.permission.POST_NOTIFICATIONS' },
  { name: 'android.permission.VIBRATE' },
];

function addPermissions(manifest) {
  const list = (manifest.manifest['uses-permission'] ??= []);
  for (const perm of PERMISSIONS) {
    const existing = list.find((p) => p.$ && p.$['android:name'] === perm.name);
    if (existing) {
      if (perm.maxSdkVersion) existing.$['android:maxSdkVersion'] = perm.maxSdkVersion;
      continue;
    }
    const entry = { $: { 'android:name': perm.name } };
    if (perm.maxSdkVersion) entry.$['android:maxSdkVersion'] = perm.maxSdkVersion;
    list.push(entry);
  }
}

/** Insert-or-replace a component (by android:name) with the given attributes. */
function upsert(collection, name, attributes, extra) {
  const idx = collection.findIndex((c) => c.$ && c.$['android:name'] === name);
  const node = Object.assign({ $: attributes }, extra || {});
  if (idx >= 0) collection[idx] = node;
  else collection.push(node);
}

function addComponents(application) {
  const services = (application.service ??= []);
  const activities = (application.activity ??= []);
  const receivers = (application.receiver ??= []);

  // Looping-audio foreground service (systemExempted: alarm-app FGS exemption).
  upsert(services, `${PACKAGE}.AlarmForegroundService`, {
    'android:name': `${PACKAGE}.AlarmForegroundService`,
    'android:enabled': 'true',
    'android:exported': 'false',
    'android:foregroundServiceType': 'systemExempted',
  });

  // Full-screen, must-dismiss activity over the lock screen.
  upsert(activities, `${PACKAGE}.AlarmActivity`, {
    'android:name': `${PACKAGE}.AlarmActivity`,
    'android:exported': 'false',
    'android:showWhenLocked': 'true',
    'android:turnScreenOn': 'true',
    'android:excludeFromRecents': 'true',
    'android:launchMode': 'singleInstance',
    'android:taskAffinity': '',
    'android:theme': '@android:style/Theme.DeviceDefault.NoActionBar.Fullscreen',
  });

  // Internal alarm-fire + dismiss-action receiver (explicit intents only).
  upsert(receivers, `${PACKAGE}.AlarmReceiver`, {
    'android:name': `${PACKAGE}.AlarmReceiver`,
    'android:enabled': 'true',
    'android:exported': 'false',
  });

  // Boot re-arm receiver — exported with intent-filter for system broadcasts.
  upsert(
    receivers,
    `${PACKAGE}.BootReceiver`,
    {
      'android:name': `${PACKAGE}.BootReceiver`,
      'android:enabled': 'true',
      'android:exported': 'true',
      'android:directBootAware': 'true',
    },
    {
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.LOCKED_BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
            { $: { 'android:name': 'com.htc.intent.action.QUICKBOOT_POWERON' } },
          ],
        },
      ],
    },
  );
}

const withSchedularmAlarm = (config) =>
  withAndroidManifest(config, (cfg) => {
    addPermissions(cfg.modResults);
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    addComponents(application);
    return cfg;
  });

module.exports = withSchedularmAlarm;
