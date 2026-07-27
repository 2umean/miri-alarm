jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: { ADAPTIVE_BANNER: 'test-adaptive-banner' },
}));

import { BANNER_UNIT_IDS, resolveBannerUnitId } from '../unitId';

test('dev builds always use the Google test unit — never the live unit', () => {
  expect(resolveBannerUnitId(true, 'android')).toBe('test-adaptive-banner');
  expect(resolveBannerUnitId(true, 'ios')).toBe('test-adaptive-banner');
});

test('release builds use the real per-platform unit', () => {
  expect(resolveBannerUnitId(false, 'android')).toBe(BANNER_UNIT_IDS.android);
  expect(resolveBannerUnitId(false, 'ios')).toBe(BANNER_UNIT_IDS.ios);
});
