import { TestIds } from 'react-native-google-mobile-ads';

export const BANNER_UNIT_IDS = {
  android: 'ca-app-pub-5599052038923907/7030353875',
  ios: 'ca-app-pub-5599052038923907/8244317487',
} as const;

// Dev builds must never request the live units — impressions/clicks from a
// developer device risk an AdMob account suspension.
export function resolveBannerUnitId(isDev: boolean, platform: string): string {
  if (isDev) return TestIds.ADAPTIVE_BANNER;
  return platform === 'ios' ? BANNER_UNIT_IDS.ios : BANNER_UNIT_IDS.android;
}
