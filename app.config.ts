import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'schedularm',
  slug: 'schedularm',
  owner: 'kgulag98',
  scheme: 'schedularm',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.umean.schedularm',
    deploymentTarget: '26.0',
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSAlarmKitUsageDescription:
        'schedularm sets alarms so airline crew reliably wake up and leave on time for their duties.',
    },
  },
  android: {
    package: 'com.umean.schedularm',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Alarm permissions (incl. SCHEDULE_EXACT_ALARM maxSdkVersion + the
    // service/activity/receiver components) are injected by the config plugin
    // below — single source of truth in modules/schedularm-alarm/plugin.
  },
  plugins: [
    './modules/schedularm-alarm/plugin/withSchedularmAlarm',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#F2F8FF',
      },
    ],
  ],
  extra: {
    eas: {
      projectId: 'ff51bf5f-ee0b-48d7-9cf3-7b83f44a0fd8',
    },
  },
};

export default config;
