import { Pill } from '../../domain/pill';
import { Preset } from '../../domain/preset';
import {
  INITIAL_PRESETS,
  PresetsState,
  firstRemaining,
  presetsReducer,
} from '../presetsReducer';

const pill = (id: string, dur = 30): Pill => ({ id, icon: '⬜', name: id, dur, type: 'none' });

const preset = (id: string, ...pillIds: string[]): Preset => ({
  id,
  name: `name-${id}`,
  pills: pillIds.map((p) => pill(p)),
});

const state = (activeId: string | null, ...presets: Preset[]): PresetsState => ({
  presets,
  activeId,
});

test('INITIAL_PRESETS is empty with no active preset', () => {
  expect(INITIAL_PRESETS).toEqual({ presets: [], activeId: null });
});

test('hydrate replaces the whole state', () => {
  const next = state('a', preset('a'));
  expect(presetsReducer(INITIAL_PRESETS, { type: 'hydrate', state: next })).toBe(next);
});

describe('create', () => {
  test('appends and activates on an empty library', () => {
    const s = presetsReducer(INITIAL_PRESETS, {
      type: 'create',
      id: 'a',
      name: '평일 아침',
      pills: [pill('p1')],
    });
    expect(s.presets).toEqual([{ id: 'a', name: '평일 아침', pills: [pill('p1')] }]);
    expect(s.activeId).toBe('a');
  });

  test('appends at the end and re-points active', () => {
    const s = presetsReducer(state('a', preset('a')), {
      type: 'create',
      id: 'b',
      name: 'b',
      pills: [],
    });
    expect(s.presets.map((p) => p.id)).toEqual(['a', 'b']);
    expect(s.activeId).toBe('b');
  });
});

describe('rename', () => {
  test('renames only the matching preset', () => {
    const s = presetsReducer(state('a', preset('a'), preset('b')), {
      type: 'rename',
      id: 'b',
      name: '주말 늦잠',
    });
    expect(s.presets[0].name).toBe('name-a');
    expect(s.presets[1].name).toBe('주말 늦잠');
    expect(s.activeId).toBe('a');
  });

  test('unknown id leaves content unchanged', () => {
    const start = state('a', preset('a'));
    expect(presetsReducer(start, { type: 'rename', id: 'nope', name: 'x' })).toEqual(start);
  });
});

describe('remove', () => {
  test('removing a non-active preset keeps activeId', () => {
    const s = presetsReducer(state('a', preset('a'), preset('b')), { type: 'remove', id: 'b' });
    expect(s.presets.map((p) => p.id)).toEqual(['a']);
    expect(s.activeId).toBe('a');
  });

  test('removing the active preset activates the first remaining', () => {
    const s = presetsReducer(state('b', preset('a'), preset('b'), preset('c')), {
      type: 'remove',
      id: 'b',
    });
    expect(s.presets.map((p) => p.id)).toEqual(['a', 'c']);
    expect(s.activeId).toBe('a');
  });

  test('removing the active FIRST preset activates the next one', () => {
    const s = presetsReducer(state('a', preset('a'), preset('b')), { type: 'remove', id: 'a' });
    expect(s.activeId).toBe('b');
  });

  test('removing the last preset leaves an empty library with no active', () => {
    const s = presetsReducer(state('a', preset('a')), { type: 'remove', id: 'a' });
    expect(s).toEqual({ presets: [], activeId: null });
  });

  test('unknown id leaves content unchanged', () => {
    const start = state('a', preset('a'));
    expect(presetsReducer(start, { type: 'remove', id: 'nope' })).toEqual(start);
  });
});

describe('apply', () => {
  test('sets activeId', () => {
    const s = presetsReducer(state('a', preset('a'), preset('b')), { type: 'apply', id: 'b' });
    expect(s.activeId).toBe('b');
  });

  test('unknown id is a no-op (same reference)', () => {
    const start = state('a', preset('a'));
    expect(presetsReducer(start, { type: 'apply', id: 'nope' })).toBe(start);
  });
});

describe('sync-active', () => {
  test('overwrites only the active preset pills', () => {
    const s = presetsReducer(state('a', preset('a', 'p1'), preset('b', 'p2')), {
      type: 'sync-active',
      pills: [pill('p9', 99)],
    });
    expect(s.presets[0].pills).toEqual([pill('p9', 99)]);
    expect(s.presets[1].pills).toEqual([pill('p2')]);
  });

  test('is a no-op without an active preset (same reference)', () => {
    const start = state(null, preset('a'));
    expect(presetsReducer(start, { type: 'sync-active', pills: [pill('x')] })).toBe(start);
  });
});

test('reducer never mutates the input state', () => {
  const start = state('a', preset('a', 'p1'), preset('b'));
  const snapshot = JSON.parse(JSON.stringify(start));
  presetsReducer(start, { type: 'create', id: 'c', name: 'c', pills: [pill('x')] });
  presetsReducer(start, { type: 'rename', id: 'a', name: 'z' });
  presetsReducer(start, { type: 'remove', id: 'a' });
  presetsReducer(start, { type: 'sync-active', pills: [] });
  expect(start).toEqual(snapshot);
});

describe('firstRemaining', () => {
  test('returns the first preset that is not the removed one', () => {
    expect(firstRemaining([preset('a'), preset('b')], 'a')?.id).toBe('b');
    expect(firstRemaining([preset('a'), preset('b')], 'b')?.id).toBe('a');
  });

  test('returns null when nothing remains', () => {
    expect(firstRemaining([preset('a')], 'a')).toBeNull();
    expect(firstRemaining([], 'a')).toBeNull();
  });
});
