import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearDraftChain,
  clearLegacyDraft,
  loadDraftChain,
  loadLegacyDraft,
  saveDraftChain,
} from '../draftChain';
import { Chain } from '../../domain/pill';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const V3_KEY = 'schedularm.draft.v3';
const V2_KEY = 'schedularm.draft.v2';
const V1_KEY = 'schedularm.draft.v1';

const sample: Chain = {
  arrival: 1_900_000_000_000,
  zone: 'Asia/Seoul',
  pills: [
    { id: 'p1', type: 'none', icon: '😴', name: '수면', dur: 420 },
    { id: 'p1m', type: 'alarm' },
    { id: 'p2', type: 'none', icon: '🚿', name: '샤워', dur: 20 },
  ],
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('loadDraftChain returns null when nothing is stored', async () => {
  expect(await loadDraftChain()).toBeNull();
});

test('save then load round-trips', async () => {
  await saveDraftChain(sample);
  expect(await loadDraftChain()).toEqual(sample);
});

test('a null arrival round-trips (pills-only draft)', async () => {
  await saveDraftChain({ ...sample, arrival: null });
  expect((await loadDraftChain())?.arrival).toBeNull();
});

test('clearDraftChain removes the stored draft', async () => {
  await saveDraftChain(sample);
  await clearDraftChain();
  expect(await loadDraftChain()).toBeNull();
});

test('an out-of-range pill duration is preserved verbatim on load (validation gates, storage does not)', async () => {
  await AsyncStorage.setItem(
    V3_KEY,
    JSON.stringify({ ...sample, pills: [{ id: 'p1', icon: '😴', name: 'x', dur: 99999, type: 'none' }] }),
  );
  const p = (await loadDraftChain())?.pills[0];
  expect(p).toEqual({ id: 'p1', type: 'none', icon: '😴', name: 'x', dur: 99999 });
});

test('an invalid IANA zone falls back to UTC', async () => {
  await AsyncStorage.setItem(V3_KEY, JSON.stringify({ ...sample, zone: 'Garbage/Zone' }));
  expect((await loadDraftChain())?.zone).toBe('UTC');
});

test('a real IANA zone is preserved', async () => {
  await AsyncStorage.setItem(V3_KEY, JSON.stringify({ ...sample, zone: 'America/New_York' }));
  expect((await loadDraftChain())?.zone).toBe('America/New_York');
});

test('a bare JSON primitive is treated as no draft (null), not a phantom empty chain', async () => {
  await AsyncStorage.setItem(V3_KEY, '5');
  expect(await loadDraftChain()).toBeNull();
  await AsyncStorage.setItem(V3_KEY, 'true');
  expect(await loadDraftChain()).toBeNull();
});

test('a top-level array is treated as no draft (null)', async () => {
  await AsyncStorage.setItem(V3_KEY, '[]');
  expect(await loadDraftChain()).toBeNull();
});

test('an array pill entry is dropped, not coerced into a junk pill', async () => {
  await AsyncStorage.setItem(
    V3_KEY,
    JSON.stringify({ ...sample, pills: [[1, 2, 3], { id: 'ok', icon: '🍳', name: 'a', dur: 20, type: 'none' }] }),
  );
  const pills = (await loadDraftChain())?.pills;
  expect(pills).toHaveLength(1);
  expect(pills?.[0].id).toBe('ok');
});

test('an unknown pill type falls back to none', async () => {
  await AsyncStorage.setItem(
    V3_KEY,
    JSON.stringify({ ...sample, pills: [{ id: 'p1', icon: '😴', name: 'x', dur: 30, type: 'bogus' }] }),
  );
  expect((await loadDraftChain())?.pills[0].type).toBe('none');
});

test('non-object pill entries are dropped, and a missing id is synthesised by index', async () => {
  await AsyncStorage.setItem(
    V3_KEY,
    JSON.stringify({ ...sample, pills: [null, 'oops', { icon: '🍳', name: 'a', dur: 20, type: 'none' }] }),
  );
  const pills = (await loadDraftChain())?.pills;
  expect(pills).toHaveLength(1);
  expect(pills?.[0].id).toBe('pill-2'); // index in the original array is preserved
});

test('a non-finite duration becomes zero', async () => {
  await AsyncStorage.setItem(
    V3_KEY,
    JSON.stringify({ ...sample, pills: [{ id: 'p1', icon: '😴', name: 'x', dur: 'nope', type: 'none' }] }),
  );
  expect((await loadDraftChain())?.pills[0]).toEqual({ id: 'p1', type: 'none', icon: '😴', name: 'x', dur: 0 });
});

test('a stored marker keeps only id+type — stray icon/name/dur fields are dropped', async () => {
  await AsyncStorage.setItem(
    V3_KEY,
    JSON.stringify({ ...sample, pills: [{ id: 'm1', type: 'alarm', icon: '👻', name: 'ghost', dur: 999 }] }),
  );
  expect((await loadDraftChain())?.pills[0]).toEqual({ id: 'm1', type: 'alarm' });
});

test('a marker with a missing id gets one synthesised by index', async () => {
  await AsyncStorage.setItem(V3_KEY, JSON.stringify({ ...sample, pills: [{ type: 'push' }] }));
  expect((await loadDraftChain())?.pills[0]).toEqual({ id: 'pill-0', type: 'push' });
});

test('an event entry missing fields still coerces to a full EventPill (defaults, dur 0)', async () => {
  await AsyncStorage.setItem(V3_KEY, JSON.stringify({ ...sample, pills: [{ id: 'e', type: 'none' }] }));
  expect((await loadDraftChain())?.pills[0]).toEqual({ id: 'e', type: 'none', icon: '', name: '', dur: 0 });
});

test('a missing zone falls back to UTC', async () => {
  await AsyncStorage.setItem(V3_KEY, JSON.stringify({ arrival: sample.arrival, pills: [] }));
  expect((await loadDraftChain())?.zone).toBe('UTC');
});

test('a non-positive arrival is rejected to null', async () => {
  await AsyncStorage.setItem(V3_KEY, JSON.stringify({ ...sample, arrival: 0 }));
  expect((await loadDraftChain())?.arrival).toBeNull();
});

test('a corrupt payload falls back to null', async () => {
  await AsyncStorage.setItem(V3_KEY, '{not json');
  expect(await loadDraftChain()).toBeNull();
});

test('a marker with a non-string id gets one synthesised by index', async () => {
  await AsyncStorage.setItem(V3_KEY, JSON.stringify({ ...sample, pills: [{ id: 123, type: 'alarm' }] }));
  expect((await loadDraftChain())?.pills[0]).toEqual({ id: 'pill-0', type: 'alarm' });
});

describe('v2 → v3 draft migration', () => {
  const v2Payload = JSON.stringify({
    arrival: 1_900_000_000_000,
    zone: 'Asia/Seoul',
    pills: [
      { id: 'p1', icon: '😴', name: '수면', dur: 420, type: 'alarm' },
      { id: 'p2', icon: '🚇', name: '지하철', dur: 35, type: 'none' },
    ],
  });

  test('a v2 draft is converted, persisted under v3, and the v2 key is cleared', async () => {
    await AsyncStorage.setItem(V2_KEY, v2Payload);
    const chain = await loadDraftChain();
    expect(chain?.pills.map((p) => [p.id, p.type])).toEqual([
      ['p1', 'none'],
      ['p1~m', 'alarm'],
      ['p2', 'none'],
    ]);
    // Explicit data-preservation regression (T8 review): the event keeps its 7 hours.
    expect(chain?.pills[0]).toEqual({ id: 'p1', type: 'none', icon: '😴', name: '수면', dur: 420 });
    expect(await AsyncStorage.getItem(V3_KEY)).not.toBeNull();
    expect(await AsyncStorage.getItem(V2_KEY)).toBeNull();
    // A second load reads the persisted v3 copy and returns the same chain.
    expect(await loadDraftChain()).toEqual(chain);
  });

  test('an existing v3 draft wins — a stale v2 key is ignored, not re-migrated over it', async () => {
    await saveDraftChain({ arrival: 1_900_000_000_000, zone: 'UTC', pills: [{ id: 'new', type: 'alarm' }] });
    await AsyncStorage.setItem(V2_KEY, v2Payload);
    expect((await loadDraftChain())?.pills).toEqual([{ id: 'new', type: 'alarm' }]);
    expect(await AsyncStorage.getItem(V2_KEY)).not.toBeNull(); // orphaned v2 stays — by design, v3 short-circuits
  });

  test('a corrupt v2 payload migrates to nothing and is cleared (fresh start, not a crash loop)', async () => {
    await AsyncStorage.setItem(V2_KEY, '{nope');
    expect(await loadDraftChain()).toBeNull();
    expect(await AsyncStorage.getItem(V2_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(V3_KEY)).toBeNull(); // a failed migration must not mint a phantom v3
    expect(await loadDraftChain()).toBeNull(); // second load: still null, no retry loop
  });

  test('the v1 legacy path is untouched by the bump (still read separately for the hook)', async () => {
    await AsyncStorage.setItem(V1_KEY, JSON.stringify({ arrival: 1, zone: 'UTC', sleep: 480, prep: 45, travel: 60, contingency: 15 }));
    expect(await loadDraftChain()).toBeNull(); // v1 is NOT a draft-chain payload
    expect((await loadLegacyDraft())?.sleep).toBe(480);
  });

  test('two overlapping loads share one migration — no clobber window', async () => {
    await AsyncStorage.setItem(V2_KEY, v2Payload);
    const [a, b] = await Promise.all([loadDraftChain(), loadDraftChain()]);
    expect(a).not.toBeNull();
    expect(b).toEqual(a);
    expect(await AsyncStorage.getItem(V3_KEY)).not.toBeNull();
    expect(await AsyncStorage.getItem(V2_KEY)).toBeNull();
  });
});

describe('legacy v1 draft', () => {
  test('loadLegacyDraft returns null when no v1 draft exists', async () => {
    expect(await loadLegacyDraft()).toBeNull();
  });

  test('loadLegacyDraft reads the v1 durations + anchor + zone', async () => {
    await AsyncStorage.setItem(
      V1_KEY,
      JSON.stringify({ arrival: 1_800_000_000_000, zone: 'UTC', contingency: 15, travel: 60, prep: 45, sleep: 480 }),
    );
    expect(await loadLegacyDraft()).toEqual({
      arrival: 1_800_000_000_000,
      zone: 'UTC',
      contingency: 15,
      travel: 60,
      prep: 45,
      sleep: 480,
    });
  });

  test('a corrupt v1 payload falls back to null', async () => {
    await AsyncStorage.setItem(V1_KEY, '{nope');
    expect(await loadLegacyDraft()).toBeNull();
  });

  test('clearLegacyDraft removes the v1 draft', async () => {
    await AsyncStorage.setItem(V1_KEY, JSON.stringify({ arrival: 1, zone: 'UTC' }));
    await clearLegacyDraft();
    expect(await loadLegacyDraft()).toBeNull();
  });
});
