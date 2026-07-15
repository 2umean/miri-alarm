import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearArmedChain, loadArmedChain, saveArmedChain } from '../armedChain';
import { Chain, latestAlarmInstant } from '../../domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const ARMED_KEY = 'schedularm.armed.v3';
const V2_ARMED_KEY = 'schedularm.armed.v2';

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

describe('v2 → v3 armed migration (an app update must never be why someone oversleeps)', () => {
  const ARRIVAL = 1_900_000_000_000;
  const MIN = 60_000;
  const v2Armed = JSON.stringify({
    arrival: ARRIVAL,
    zone: 'Asia/Seoul',
    pills: [
      { id: 'p1', icon: '😴', name: '수면', dur: 420, type: 'alarm' },
      { id: 'p2', icon: '🚇', name: '지하철', dur: 35, type: 'none' },
    ],
  });

  test('the armed snapshot migrates in place with its alarm instant UNCHANGED', async () => {
    await AsyncStorage.setItem(V2_ARMED_KEY, v2Armed);
    const migrated = await loadArmedChain();
    expect(migrated).not.toBeNull();
    // v2: the alarm fired when 수면 ended = arrival − 35min. Byte-identical after migration:
    expect(latestAlarmInstant(migrated!)).toBe(ARRIVAL - 35 * MIN);
    // The event keeps its full shape (data preservation, mirrors the draft-path regression):
    expect(migrated!.pills[0]).toEqual({ id: 'p1', type: 'none', icon: '😴', name: '수면', dur: 420 });
    expect(await AsyncStorage.getItem(V2_ARMED_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(ARMED_KEY)).not.toBeNull();
  });

  test('the stays-armed invariant: the migrated snapshot still passes the liveness gate', async () => {
    // useArmingChain keeps a snapshot armed iff latestAlarmInstant(c) > now.
    await AsyncStorage.setItem(V2_ARMED_KEY, v2Armed);
    const migrated = await loadArmedChain();
    const last = latestAlarmInstant(migrated!);
    const nowBeforeAlarm = ARRIVAL - 60 * MIN;
    expect(last).not.toBeNull();
    expect(last! > nowBeforeAlarm).toBe(true);
  });

  test('clearArmedChain also clears a not-yet-migrated v2 snapshot (no resurrection after disarm)', async () => {
    await AsyncStorage.setItem(V2_ARMED_KEY, v2Armed);
    await clearArmedChain();
    expect(await loadArmedChain()).toBeNull();
  });

  test('two overlapping loads share one migration — no drop window', async () => {
    await AsyncStorage.setItem(V2_ARMED_KEY, v2Armed);
    const [a, b] = await Promise.all([loadArmedChain(), loadArmedChain()]);
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
    expect(await AsyncStorage.getItem(ARMED_KEY)).not.toBeNull();
    expect(await AsyncStorage.getItem(V2_ARMED_KEY)).toBeNull();
  });

  test('a corrupt v2 snapshot clears without minting a phantom v3', async () => {
    await AsyncStorage.setItem(V2_ARMED_KEY, '{nope');
    expect(await loadArmedChain()).toBeNull();
    expect(await AsyncStorage.getItem(V2_ARMED_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(ARMED_KEY)).toBeNull();
  });

  test('an existing v3 snapshot wins — a stale v2 key is ignored, not re-migrated over it', async () => {
    await saveArmedChain({ arrival: 1_900_000_000_000, zone: 'UTC', pills: [{ id: 'new', type: 'alarm' }] });
    await AsyncStorage.setItem(V2_ARMED_KEY, v2Armed);
    expect((await loadArmedChain())?.pills).toEqual([{ id: 'new', type: 'alarm' }]);
  });

  test('a fresh arm that lands mid-migration wins over the stale upgrade copy', async () => {
    await AsyncStorage.setItem(V2_ARMED_KEY, v2Armed);
    const loading = loadArmedChain(); // migration begins
    await saveArmedChain({ arrival: 1_900_000_000_000, zone: 'UTC', pills: [{ id: 'fresh', type: 'alarm' }] });
    await loading;
    const after = await loadArmedChain();
    expect(after?.pills).toEqual([{ id: 'fresh', type: 'alarm' }]);
  });
});
