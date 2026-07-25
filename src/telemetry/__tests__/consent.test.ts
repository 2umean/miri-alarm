import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadConsent, saveConsent } from '../consent';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('unset when nothing stored', async () => {
  expect(await loadConsent()).toBe('unset');
});

test('round-trips granted and denied', async () => {
  await saveConsent('granted');
  expect(await loadConsent()).toBe('granted');
  await saveConsent('denied');
  expect(await loadConsent()).toBe('denied');
});

test('garbage value degrades to unset', async () => {
  await AsyncStorage.setItem('schedularm.telemetryConsent.v1', 'maybe');
  expect(await loadConsent()).toBe('unset');
});
