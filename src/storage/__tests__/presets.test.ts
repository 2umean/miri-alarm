import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadPresets, savePresets } from '../presets';
import { PresetLibrary } from '../../domain/preset';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KEY = 'schedularm.presets.v1';

const sample: PresetLibrary = {
  presets: [
    {
      id: 'a',
      name: '평일 아침',
      pills: [
        { id: 'p1', type: 'none', icon: '😴', name: '수면', dur: 420 },
        { id: 'p1m', type: 'alarm' },
        { id: 'p2', type: 'none', icon: '🚿', name: '샤워', dur: 20 },
      ],
    },
    { id: 'b', name: '주말 늦잠', pills: [] },
  ],
  activeId: 'a',
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('loadPresets returns null when nothing is stored', async () => {
  expect(await loadPresets()).toBeNull();
});

test('save then load round-trips', async () => {
  await savePresets(sample);
  expect(await loadPresets()).toEqual(sample);
});

test('a null activeId round-trips', async () => {
  await savePresets({ ...sample, activeId: null });
  expect((await loadPresets())?.activeId).toBeNull();
});

test('a corrupt payload falls back to null', async () => {
  await AsyncStorage.setItem(KEY, '{not json');
  expect(await loadPresets()).toBeNull();
});

test('a bare JSON primitive or top-level array is treated as no store (null)', async () => {
  await AsyncStorage.setItem(KEY, '5');
  expect(await loadPresets()).toBeNull();
  await AsyncStorage.setItem(KEY, '[]');
  expect(await loadPresets()).toBeNull();
});

test('a non-array presets value collapses to an empty library', async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify({ presets: 'junk', activeId: 'a' }));
  expect(await loadPresets()).toEqual({ presets: [], activeId: null });
});

test('non-object entries are dropped', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ presets: [null, 'oops', [1], sample.presets[0]], activeId: 'a' }),
  );
  const s = await loadPresets();
  expect(s?.presets).toHaveLength(1);
  expect(s?.presets[0].id).toBe('a');
});

test('an entry with a missing or blank name is dropped (a preset is meaningless unnamed)', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      presets: [{ id: 'x', pills: [] }, { id: 'y', name: '   ', pills: [] }, sample.presets[1]],
      activeId: null,
    }),
  );
  expect((await loadPresets())?.presets.map((p) => p.id)).toEqual(['b']);
});

test('a stored name is trimmed', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ presets: [{ id: 'a', name: '  헬스장 새벽  ', pills: [] }], activeId: null }),
  );
  expect((await loadPresets())?.presets[0].name).toBe('헬스장 새벽');
});

test('a missing id is synthesised by index', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ presets: [{ name: 'x', pills: [] }], activeId: null }),
  );
  expect((await loadPresets())?.presets[0].id).toBe('preset-0');
});

test('duplicate ids keep the first entry', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      presets: [
        { id: 'a', name: 'first', pills: [] },
        { id: 'a', name: 'second', pills: [] },
      ],
      activeId: 'a',
    }),
  );
  const s = await loadPresets();
  expect(s?.presets).toHaveLength(1);
  expect(s?.presets[0].name).toBe('first');
});

test('pills run through sanitizePills (unknown type falls back to none)', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      presets: [
        { id: 'a', name: 'x', pills: [{ id: 'p1', icon: '😴', name: 'x', dur: 30, type: 'bogus' }] },
      ],
      activeId: null,
    }),
  );
  expect((await loadPresets())?.presets[0].pills[0].type).toBe('none');
});

test('an activeId that matches no surviving preset is nulled', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ presets: [{ id: 'a', name: 'x', pills: [] }], activeId: 'ghost' }),
  );
  expect((await loadPresets())?.activeId).toBeNull();
});

test('a non-string activeId is nulled', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ presets: [{ id: 'a', name: 'x', pills: [] }], activeId: 7 }),
  );
  expect((await loadPresets())?.activeId).toBeNull();
});
