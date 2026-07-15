import { chainReducer, initialChainState, ChainState } from '../chainReducer';
import { Pill } from '../../domain/pill';

const event = (id: string, dur: number): Pill => ({ id, type: 'none', icon: '⬜', name: id, dur });
const marker = (id: string, type: 'push' | 'alarm' = 'alarm'): Pill => ({ id, type });

const withPills = (...ids: string[]): ChainState => ({
  arrival: 1_900_000_000_000,
  zone: 'Asia/Seoul',
  pills: ids.map((id) => event(id, 30)),
});

test('initialChainState is empty with no arrival', () => {
  expect(initialChainState('Asia/Seoul')).toEqual({ arrival: null, zone: 'Asia/Seoul', pills: [] });
});

test('hydrate replaces the whole state', () => {
  const next = withPills('a', 'b');
  expect(chainReducer(initialChainState('UTC'), { type: 'hydrate', chain: next })).toBe(next);
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

test('edit-arrival is a no-op before an arrival exists (defensive — hydration always seeds one)', () => {
  const empty = initialChainState('UTC');
  expect(chainReducer(empty, { type: 'edit-arrival', instant: 123 })).toBe(empty);
});

test('roll-arrival moves the anchor once one exists', () => {
  expect(chainReducer(withPills('a'), { type: 'roll-arrival', instant: 555 }).arrival).toBe(555);
});

describe('add-pill', () => {
  test('appends when no index is given', () => {
    const s = chainReducer(withPills('a', 'b'), { type: 'add-pill', pill: event('c', 30) });
    expect(s.pills.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  test('inserts at the given index', () => {
    const s = chainReducer(withPills('a', 'b'), { type: 'add-pill', pill: event('x', 30), index: 1 });
    expect(s.pills.map((p) => p.id)).toEqual(['a', 'x', 'b']);
  });

  test('clamps an out-of-range index to the end', () => {
    const s = chainReducer(withPills('a'), { type: 'add-pill', pill: event('z', 30), index: 99 });
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

describe('update-pill (whole-pill replacement — PillPatch cannot express a union)', () => {
  test('replaces only the matching pill', () => {
    const s = chainReducer(withPills('a', 'b'), {
      type: 'update-pill',
      id: 'b',
      next: { id: 'b', type: 'alarm' },
    });
    expect(s.pills[0]).toEqual(event('a', 30));
    expect(s.pills[1]).toEqual({ id: 'b', type: 'alarm' });
  });

  test('an event → marker replacement drops the event fields entirely', () => {
    const s = chainReducer(withPills('a'), { type: 'update-pill', id: 'a', next: { id: 'a', type: 'push' } });
    expect(s.pills[0]).toEqual({ id: 'a', type: 'push' });
    expect('dur' in s.pills[0]).toBe(false);
  });

  test('a marker → event replacement carries the full draft-built event', () => {
    const start: ChainState = { arrival: 1_900_000_000_000, zone: 'Asia/Seoul', pills: [{ id: 'm', type: 'alarm' }] };
    const s = chainReducer(start, {
      type: 'update-pill',
      id: 'm',
      next: { id: 'm', type: 'none', icon: '🧥', name: '외출 준비', dur: 15 },
    });
    expect(s.pills[0]).toEqual({ id: 'm', type: 'none', icon: '🧥', name: '외출 준비', dur: 15 });
  });

  test('the stored id wins over a mismatched next.id (ids are stable)', () => {
    const s = chainReducer(withPills('a'), {
      type: 'update-pill',
      id: 'a',
      next: { id: 'WRONG', type: 'alarm' },
    });
    expect(s.pills[0].id).toBe('a');
  });
});

describe('replace-pills', () => {
  test('swaps the pill list wholesale', () => {
    const s = chainReducer(withPills('a', 'b'), {
      type: 'replace-pills',
      pills: [event('x', 30), event('y', 30)],
    });
    expect(s.pills.map((p) => p.id)).toEqual(['x', 'y']);
  });

  test('keeps arrival and zone untouched (preset apply never moves the anchor)', () => {
    const start = withPills('a');
    const s = chainReducer(start, { type: 'replace-pills', pills: [] });
    expect(s.arrival).toBe(start.arrival);
    expect(s.zone).toBe(start.zone);
    expect(s.pills).toEqual([]);
  });
});

test('reducer never mutates the input state', () => {
  const start = withPills('a', 'b');
  const snapshot = JSON.parse(JSON.stringify(start));
  chainReducer(start, { type: 'add-pill', pill: event('c', 30) });
  chainReducer(start, { type: 'remove-pill', id: 'a' });
  chainReducer(start, { type: 'update-pill', id: 'a', next: event('a', 1) });
  expect(start).toEqual(snapshot);
});
