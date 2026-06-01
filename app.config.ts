import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'schedularm',
  slug: 'schedularm',
  owner: 'kgulag98',
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
    // Alarm permissions (incl. SCHEDULE_EXACT_ALARM maxSdkVersion + the
    // service/activity/receiver components) are injected by the config plugin
    // below — single source of truth in modules/schedularm-alarm/plugin.
  },
  plugins: ['./modules/schedularm-alarm/plugin/withSchedularmAlarm'],
};

export default config;
