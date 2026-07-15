import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearArmedChain, loadArmedChain, saveArmedChain } from '../armedChain';
import { Chain } from '../../domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const ARMED_KEY = 'schedularm.armed.v2';

const sample: Chain = {
  arrival: 1_900_000_000_000,
  zone: 'Asia/Seoul',
  pills: [
    { id: 'p1', type: 'none', icon: '😴', name: '수면', dur: 420 },
    { id: 'p1m', type: 'alarm' },
  ],
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('loadArmedChain returns null when nothing is stored', async () => {
  expect(await loadArmedChain()).toBeNull();
});

test('save then load round-trips', async () => {
  await saveArmedChain(sample);
  expect(await loadArmedChain()).toEqual(sample);
});

test('clearArmedChain removes the snapshot', async () => {
  await saveArmedChain(sample);
  await clearArmedChain();
  expect(await loadArmedChain()).toBeNull();
});

test('a corrupt payload falls back to null', async () => {
  await AsyncStorage.setItem(ARMED_KEY, '{not json');
  expect(await loadArmedChain()).toBeNull();
});

test('a bare primitive falls back to null (not a phantom chain)', async () => {
  await AsyncStorage.setItem(ARMED_KEY, '7');
  expect(await loadArmedChain()).toBeNull();
});

test('a missing pills array is coerced to empty so the arm-restore path cannot crash', async () => {
  await AsyncStorage.setItem(ARMED_KEY, JSON.stringify({ arrival: sample.arrival, zone: 'UTC' }));
  expect((await loadArmedChain())?.pills).toEqual([]);
});

test('malformed pill elements are sanitised/dropped, not passed raw to the engine', async () => {
  await AsyncStorage.setItem(
    ARMED_KEY,
    JSON.stringify({
      arrival: sample.arrival,
      zone: 'UTC',
      pills: [null, { icon: '🚿', name: 'x', dur: 'nope', type: 'bogus' }],
    }),
  );
  const pills = (await loadArmedChain())?.pills;
  expect(pills).toHaveLength(1); // the null element is dropped
  expect(pills?.[0]).toEqual({ id: 'pill-1', type: 'none', icon: '🚿', name: 'x', dur: 0 }); // coerced to safe values
});
