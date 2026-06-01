import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
} from '@expo/config-plugins';

type ManifestApplication = AndroidConfig.Manifest.ManifestApplication;
// Loose alias — manifest sub-nodes are bags of { $: {...} } in the AST.
type ManifestNode = { $: Record<string, string>; [key: string]: unknown };

const PACKAGE = 'expo.modules.schedularmalarm';

/** All permissions the bespoke alarm pipeline needs. */
const PERMISSIONS: Array<{ name: string; maxSdkVersion?: string }> = [
  // Auto-granted "core alarm app" declaration — preferred over SCHEDULE_EXACT_ALARM.
  { name: 'android.permission.USE_EXACT_ALARM' },
  // User-grantable fallback on API ≤ 32 (deprecated by USE_EXACT_ALARM on 33+).
  { name: 'android.permission.SCHEDULE_EXACT_ALARM', maxSdkVersion: '32' },
  { name: 'android.permission.USE_FULL_SCREEN_INTENT' },
  { name: 'android.permission.FOREGROUND_SERVICE' },
  { name: 'android.permission.FOREGROUND_SERVICE_SYSTEM_EXEMPTED' },
  { name: 'android.permission.RECEIVE_BOOT_COMPLETED' },
  { name: 'android.permission.WAKE_LOCK' },
  { name: 'android.permission.POST_NOTIFICATIONS' },
  { name: 'android.permission.VIBRATE' },
];

function addPermissions(manifest: AndroidConfig.Manifest.AndroidManifest): void {
  const list = (manifest.manifest['uses-permission'] ??=
    []) as ManifestNode[];
  for (const perm of PERMISSIONS) {
    const existing = list.find((p) => p.$?.['android:name'] === perm.name);
    if (existing) {
      if (perm.maxSdkVersion) {
        existing.$['android:maxSdkVersion'] = perm.maxSdkVersion;
      }
      continue;
    }
    const entry: ManifestNode = { $: { 'android:name': perm.name } };
    if (perm.maxSdkVersion) {
      entry.$['android:maxSdkVersion'] = perm.maxSdkVersion;
    }
    list.push(entry);
  }
}

/** Insert-or-replace a component (by android:name) with the given attributes. */
function upsert(
  collection: ManifestNode[],
  name: string,
  attributes: Record<string, string>,
  extra?: Record<string, unknown>,
): void {
  const idx = collection.findIndex((c) => c.$?.['android:name'] === name);
  const node: ManifestNode = { $: attributes, ...(extra ?? {}) };
  if (idx >= 0) {
    collection[idx] = node;
  } else {
    collection.push(node);
  }
}

function addComponents(application: ManifestApplication): void {
  const services = (application.service ??= []) as unknown as ManifestNode[];
  const activities = (application.activity ??= []) as unknown as ManifestNode[];
  const receivers = (application.receiver ??= []) as unknown as ManifestNode[];

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

const withSchedularmAlarm: ConfigPlugin = (config) =>
  withAndroidManifest(config, (cfg) => {
    addPermissions(cfg.modResults);
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    addComponents(application);
    return cfg;
  });

export default withSchedularmAlarm;
