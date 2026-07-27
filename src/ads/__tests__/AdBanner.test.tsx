import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { View } from 'react-native';

const mockUseAdsState = jest.fn();
jest.mock('../adsState', () => ({ useAdsState: () => mockUseAdsState() }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  BannerAd: () => null,
  BannerAdSize: { LARGE_ANCHORED_ADAPTIVE_BANNER: 'LARGE_ANCHORED_ADAPTIVE_BANNER' },
  TestIds: { ADAPTIVE_BANNER: 'test-adaptive-banner' },
  useForeground: jest.fn(),
}));

import { BannerAd } from 'react-native-google-mobile-ads';
import { AdBanner } from '../AdBanner';

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AdBanner />);
  });
  return tree;
}

test('renders nothing until consent allows ads', () => {
  mockUseAdsState.mockReturnValue({ canShowAds: false, isPrivacyOptionsRequired: false });
  const tree = render();
  expect(tree.root.findAllByType(BannerAd)).toHaveLength(0);
  expect(tree.root.findAllByType(View)).toHaveLength(0);
});

test('mounts zero-height, then reserves safe-area space once an ad loads', () => {
  mockUseAdsState.mockReturnValue({ canShowAds: true, isPrivacyOptionsRequired: false });
  const tree = render();
  expect(tree.root.findByType(View).props.style).toMatchObject({ height: 0, overflow: 'hidden' });
  act(() => {
    tree.root.findByType(BannerAd).props.onAdLoaded({ width: 320, height: 50 });
  });
  expect(tree.root.findByType(View).props.style).toEqual({ paddingBottom: 34 });
});

test('forgets the loaded state across a consent withdrawal round-trip', () => {
  mockUseAdsState.mockReturnValue({ canShowAds: true, isPrivacyOptionsRequired: false });
  const tree = render();
  act(() => {
    tree.root.findByType(BannerAd).props.onAdLoaded({ width: 320, height: 50 });
  });
  expect(tree.root.findByType(View).props.style).toEqual({ paddingBottom: 34 });

  mockUseAdsState.mockReturnValue({ canShowAds: false, isPrivacyOptionsRequired: true });
  act(() => {
    tree.update(<AdBanner />);
  });
  expect(tree.root.findAllByType(View)).toHaveLength(0);

  mockUseAdsState.mockReturnValue({ canShowAds: true, isPrivacyOptionsRequired: true });
  act(() => {
    tree.update(<AdBanner />);
  });
  expect(tree.root.findByType(View).props.style).toMatchObject({ height: 0, overflow: 'hidden' });
});

test('collapses back to zero height when a later load fails', () => {
  mockUseAdsState.mockReturnValue({ canShowAds: true, isPrivacyOptionsRequired: false });
  const tree = render();
  act(() => {
    tree.root.findByType(BannerAd).props.onAdLoaded({ width: 320, height: 50 });
  });
  act(() => {
    tree.root.findByType(BannerAd).props.onAdFailedToLoad(new Error('no fill'));
  });
  expect(tree.root.findByType(View).props.style).toMatchObject({ height: 0, overflow: 'hidden' });
});
