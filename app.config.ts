import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'schedularm',
  slug: 'schedularm',
  scheme: 'schedularm',
  version: '0.1.0',
  orientation: 'portrait',
  ios: {
    bundleIdentifier: 'com.umean.schedularm',
    deploymentTarget: '26.0',
    infoPlist: {
      NSAlarmKitUsageDescription:
        'schedularm sets alarms so airline crew reliably wake up and leave on time for their duties.',
    },
  },
  android: {
    package: 'com.umean.schedularm',
    permissions: [
      'USE_EXACT_ALARM',
      'USE_FULL_SCREEN_INTENT',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_SPECIAL_USE',
      'RECEIVE_BOOT_COMPLETED',
      'POST_NOTIFICATIONS',
      'WAKE_LOCK',
      'VIBRATE',
    ],
  },
};

export default config;
