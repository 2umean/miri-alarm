import { labelSourceFor } from '../markerLabel';
import { EventPill, MarkerPill } from '../pill';

const event = (id: string): EventPill => ({ id, type: 'none', icon: '⬜', name: `name-${id}`, dur: 30 });
const marker = (id: string): MarkerPill => ({ id, type: 'alarm' });

test('returns the immediately preceding event', () => {
  const pills = [event('a'), marker('m')];
  expect(labelSourceFor(pills, 1)?.id).toBe('a');
});

test('scans back PAST other markers to the nearest event', () => {
  const pills = [event('a'), marker('m1'), marker('m2'), marker('m3')];
  expect(labelSourceFor(pills, 3)?.id).toBe('a');
});

test('orphan at index 0 → null (caller falls back to the start label)', () => {
  expect(labelSourceFor([marker('m'), event('a')], 0)).toBeNull();
});

test('only markers before it → null', () => {
  expect(labelSourceFor([marker('m1'), marker('m2')], 1)).toBeNull();
});

test('ignores events AFTER the index', () => {
  const pills = [marker('m'), event('later')];
  expect(labelSourceFor(pills, 0)).toBeNull();
});

test('an event index resolves to the event before it (harmless, unused by the UI)', () => {
  const pills = [event('a'), event('b')];
  expect(labelSourceFor(pills, 1)?.id).toBe('a');
});
