import { presetSummary } from '../preset';
import { Pill } from '../pill';

const event = (id: string, icon: string, dur: number): Pill => ({ id, type: 'none', icon, name: id, dur });
const marker = (id: string, type: 'push' | 'alarm' = 'alarm'): Pill => ({ id, type });

test('presetSummary counts, totals, and concatenates icons in order', () => {
  const pills = [event('a', '😴', 420), event('b', '🚿', 20), event('c', '🍳', 20)];
  expect(presetSummary(pills)).toEqual({ count: 3, totalMinutes: 460, icons: '😴🚿🍳' });
});

test('presetSummary handles an empty pill list', () => {
  expect(presetSummary([])).toEqual({ count: 0, totalMinutes: 0, icons: '' });
});

test('presetSummary is computed from EVENT pills only — markers add nothing', () => {
  const pills: Pill[] = [event('a', '😴', 420), marker('m1'), event('b', '🚿', 20), marker('m2', 'push')];
  expect(presetSummary(pills)).toEqual({ count: 2, totalMinutes: 440, icons: '😴🚿' });
});

test('a marker-only list summarises to zero', () => {
  expect(presetSummary([marker('m1'), marker('m2', 'push')])).toEqual({ count: 0, totalMinutes: 0, icons: '' });
});
