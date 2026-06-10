import AsyncStorage from '@react-native-async-storage/async-storage';
import { isOnboarded, markOnboarded } from '../onboarding';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('isOnboarded is false before completion', async () => {
  expect(await isOnboarded()).toBe(false);
});

test('markOnboarded persists completion', async () => {
  await markOnboarded();
  expect(await isOnboarded()).toBe(true);
});
