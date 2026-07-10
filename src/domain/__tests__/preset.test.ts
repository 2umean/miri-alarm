import { presetSummary } from '../preset';
import { Pill } from '../pill';

const pill = (id: string, icon: string, dur: number): Pill => ({
  id,
  icon,
  name: id,
  dur,
  type: 'none',
});

test('presetSummary counts, totals, and concatenates icons in order', () => {
  const pills = [pill('a', '😴', 420), pill('b', '🚿', 20), pill('c', '🍳', 20)];
  expect(presetSummary(pills)).toEqual({ count: 3, totalMinutes: 460, icons: '😴🚿🍳' });
});

test('presetSummary handles an empty pill list', () => {
  expect(presetSummary([])).toEqual({ count: 0, totalMinutes: 0, icons: '' });
});
