import { withSentry } from '@sentry/react-native/expo';
import { ExpoConfig } from 'expo/config';

// Single source of truth for the marketing version — bump with `npm version`
// (patch/minor/major). Build numbers are auto-incremented by EAS (remote).
import { version } from './package.json';
import { SK_AD_NETWORK_ITEMS } from './skAdNetworkItems';

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
    [
      'react-native-google-mobile-ads',
      {
        // Both App IDs are mandatory — the native GMA SDK crashes at launch
        // on any platform whose ID is missing from the build.
        androidAppId: 'ca-app-pub-5599052038923907~8575489973',
        iosAppId: 'ca-app-pub-5599052038923907~5702060414',
        // Defer GMA app measurement until mobileAds().initialize(), which
        // src/ads/adsState.ts only calls once UMP reports canRequestAds.
        delayAppMeasurementInit: true,
        userTrackingUsageDescription:
          'This identifier will be used to deliver personalized ads to you.',
        skAdNetworkItems: SK_AD_NETWORK_ITEMS,
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

export default withSentry(config, {
  url: 'https://sentry.io/',
  organization: '2umean',
  // Slug renamed from the default 'react-native' in the Sentry console 2026-07-27.
  // The DSN in src/telemetry/sentryClient.ts is ID-keyed and unaffected.
  project: 'miri',
  // Auth comes from SENTRY_AUTH_TOKEN (EAS env var, sensitive) at build time.
});
