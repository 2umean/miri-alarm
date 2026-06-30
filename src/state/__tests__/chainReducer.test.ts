import { chainReducer, initialChainState, ChainState } from '../chainReducer';
import { Pill, PillType } from '../../domain/pill';

const pill = (id: string, dur = 30, type: PillType = 'none'): Pill => ({
  id,
  icon: '⬜',
  name: id,
  dur,
  type,
});

const withPills = (...ids: string[]): ChainState => ({
  arrival: 1_900_000_000_000,
  zone: 'Asia/Seoul',
  pills: ids.map((id) => pill(id)),
});

test('initialChainState is empty with no arrival', () => {
  expect(initialChainState('Asia/Seoul')).toEqual({ arrival: null, zone: 'Asia/Seoul', pills: [] });
});

test('hydrate replaces the whole state', () => {
  const next = withPills('a', 'b');
  expect(chainReducer(initialChainState('UTC'), { type: 'hydrate', chain: next })).toBe(next);
});

test('set-arrival sets the anchor and captures the zone', () => {
  const s = chainReducer(initialChainState('UTC'), {
    type: 'set-arrival',
    instant: 123,
    zone: 'Asia/Seoul',
  });
  expect(s).toEqual({ arrival: 123, zone: 'Asia/Seoul', pills: [] });
});

test('edit-arrival moves the anchor but keeps zone and pills', () => {
  const start = withPills('a');
  const s = chainReducer(start, { type: 'edit-arrival', instant: 999 });
  expect(s.arrival).toBe(999);
  expect(s.zone).toBe('Asia/Seoul');
  expect(s.pills).toBe(start.pills);
});

test('roll-arrival is a no-op before an arrival exists', () => {
  const empty = initialChainState('UTC');
  expect(chainReducer(empty, { type: 'roll-arrival', instant: 555 })).toBe(empty);
});

test('edit-arrival is a no-op before an arrival exists (first entry must use set-arrival)', () => {
  const empty = initialChainState('UTC');
  expect(chainReducer(empty, { type: 'edit-arrival', instant: 123 })).toBe(empty);
});

test('roll-arrival moves the anchor once one exists', () => {
  expect(chainReducer(withPills('a'), { type: 'roll-arrival', instant: 555 }).arrival).toBe(555);
});

describe('add-pill', () => {
  test('appends when no index is given', () => {
    const s = chainReducer(withPills('a', 'b'), { type: 'add-pill', pill: pill('c') });
    expect(s.pills.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  test('inserts at the given index', () => {
    const s = chainReducer(withPills('a', 'b'), { type: 'add-pill', pill: pill('x'), index: 1 });
    expect(s.pills.map((p) => p.id)).toEqual(['a', 'x', 'b']);
  });

  test('clamps an out-of-range index to the end', () => {
    const s = chainReducer(withPills('a'), { type: 'add-pill', pill: pill('z'), index: 99 });
    expect(s.pills.map((p) => p.id)).toEqual(['a', 'z']);
  });
});

test('remove-pill drops the matching pill', () => {
  const s = chainReducer(withPills('a', 'b', 'c'), { type: 'remove-pill', id: 'b' });
  expect(s.pills.map((p) => p.id)).toEqual(['a', 'c']);
});

describe('reorder-pill', () => {
  test('moves a pill down', () => {
    const s = chainReducer(withPills('a', 'b', 'c'), { type: 'reorder-pill', from: 0, to: 2 });
    expect(s.pills.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  test('moves a pill up', () => {
    const s = chainReducer(withPills('a', 'b', 'c'), { type: 'reorder-pill', from: 2, to: 0 });
    expect(s.pills.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  test('from === to is a no-op (same reference)', () => {
    const start = withPills('a', 'b');
    expect(chainReducer(start, { type: 'reorder-pill', from: 1, to: 1 })).toBe(start);
  });

  test('an out-of-range index is a no-op (same reference)', () => {
    const start = withPills('a', 'b');
    expect(chainReducer(start, { type: 'reorder-pill', from: 0, to: 5 })).toBe(start);
  });
});

describe('update-pill', () => {
  test('patches only the matching pill', () => {
    const s = chainReducer(withPills('a', 'b'), {
      type: 'update-pill',
      id: 'b',
      patch: { type: 'alarm', name: 'wake' },
    });
    expect(s.pills[0]).toEqual(pill('a'));
    expect(s.pills[1]).toMatchObject({ id: 'b', type: 'alarm', name: 'wake' });
  });

  test('a partial patch leaves untouched fields intact', () => {
    const s = chainReducer(withPills('a'), { type: 'update-pill', id: 'a', patch: { dur: 99 } });
    expect(s.pills[0]).toEqual({ id: 'a', icon: '⬜', name: 'a', dur: 99, type: 'none' });
  });
});

test('reducer never mutates the input state', () => {
  const start = withPills('a', 'b');
  const snapshot = JSON.parse(JSON.stringify(start));
  chainReducer(start, { type: 'add-pill', pill: pill('c') });
  chainReducer(start, { type: 'remove-pill', id: 'a' });
  chainReducer(start, { type: 'update-pill', id: 'a', patch: { dur: 1 } });
  expect(start).toEqual(snapshot);
});
