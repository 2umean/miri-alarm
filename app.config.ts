import { ExpoConfig } from 'expo/config';

// Single source of truth for the marketing version — bump with `npm version`
// (patch/minor/major). Build numbers are auto-incremented by EAS (remote).
import { version } from './package.json';

const config: ExpoConfig = {
  name: 'MIRI Alarm',
  slug: 'miri',
  owner: 'kgulag98',
  scheme: 'miri',
  version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.umean.miri',
    deploymentTarget: '26.0',
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      // Required for the ko launcher label below to apply on iOS.
      CFBundleAllowMixedLocalizations: true,
      NSAlarmKitUsageDescription:
        'MIRI Alarm sets alarms so airline crew reliably wake up and leave on time for their duties.',
    },
  },
  // Korean devices show 미리 under the icon; everywhere else uses `name`.
  locales: {
    ko: './locales/ko.json',
  },
  android: {
    package: 'com.umean.miri',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Alarm permissions (incl. SCHEDULE_EXACT_ALARM maxSdkVersion + the
    // service/activity/receiver components) are injected by the config plugin
    // below — single source of truth in modules/schedularm-alarm/plugin.
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    './modules/schedularm-alarm/plugin/withSchedularmAlarm',
    'expo-font',
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
      // @kgulag98/miri — created 2026-07-06 for the MIRI rebrand; the old
      // 'schedularm' project (ff51bf5f-…) is dead (EAS slugs are immutable).
      projectId: 'eb01f77f-8c2f-4693-ba20-0560f3091517',
    },
  },
};

export default config;
