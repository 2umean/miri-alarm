import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize, useForeground } from 'react-native-google-mobile-ads';

import { useAdsState } from './adsState';
import { resolveBannerUnitId } from './unitId';

// Anchored banner for the bottom of ChainScreen. Self-contained: renders
// nothing without consent, stays zero-height until an ad actually loads (no
// gray placeholder, no layout jump on no-fill), and owns the bottom safe-area
// inset while visible.
export function AdBanner() {
  const { canShowAds } = useAdsState();
  const insets = useSafeAreaInsets();
  const [isLoaded, setIsLoaded] = useState(false);
  const bannerRef = useRef<BannerAd>(null);

  // iOS suspends the banner's WKWebView while backgrounded; reload on return.
  useForeground(() => {
    if (Platform.OS === 'ios') bannerRef.current?.load();
  });

  // Forget the previous ad when consent hides the banner, so a later
  // re-consent starts zero-height again instead of showing a blank strip.
  useEffect(() => {
    if (!canShowAds) setIsLoaded(false);
  }, [canShowAds]);

  if (!canShowAds) return null;

  return (
    <View style={isLoaded ? { paddingBottom: insets.bottom } : styles.hidden}>
      <BannerAd
        ref={bannerRef}
        unitId={resolveBannerUnitId(__DEV__, Platform.OS)}
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setIsLoaded(true)}
        onAdFailedToLoad={() => setIsLoaded(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { height: 0, overflow: 'hidden' },
});
