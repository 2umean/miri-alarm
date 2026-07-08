import { planNativeAlarms } from '../alarmPlan';
import type { ChainComputed, Pill, PillType } from '../../domain';

const HOUR = 3_600_000;
const NOW = 1_780_000_000_000;

const pill = (id: string, type: PillType, name = id): Pill => ({
  id,
  icon: '⏰',
  name,
  dur: 60,
  type,
});

/** Chain of hour-long items ending at `arrival`, one per pill (in order). */
const computed = (arrival: number, pills: Pill[]): ChainComputed => ({
  start: arrival - pills.length * HOUR,
  arrival,
  items: pills.map((p, i) => ({
    pill: p,
    startAt: arrival - (pills.length - i) * HOUR,
    endAt: arrival - (pills.length - i - 1) * HOUR,
  })),
});

test('maps only alarm pills, with the shared leaveAt = last item start', () => {
  const c = computed(NOW + 4 * HOUR, [
    pill('sleep', 'alarm', 'Sleep'),
    pill('shower', 'none'),
    pill('breakfast', 'push'),
    pill('commute', 'none'),
  ]);
  const alarms = planNativeAlarms(c, NOW);
  expect(alarms).toEqual([
    { id: 'sleep', at: NOW + 1 * HOUR, label: 'Sleep', leaveAt: NOW + 3 * HOUR },
  ]);
});

test('drops alarms whose end already passed (no immediate spurious re-ring)', () => {
  // First alarm fired half an hour ago; second is still ahead — a launch re-arm
  // must reschedule ONLY the future one.
  const c = computed(NOW + HOUR / 2, [pill('a', 'alarm'), pill('b', 'alarm')]);
  expect(c.items[0].endAt).toBeLessThan(NOW);
  expect(planNativeAlarms(c, NOW).map((a) => a.id)).toEqual(['b']);
});

test('an alarm ending exactly now is past, not future', () => {
  const c = computed(NOW + HOUR, [pill('a', 'alarm'), pill('b', 'alarm')]);
  expect(c.items[0].endAt).toBe(NOW);
  expect(planNativeAlarms(c, NOW).map((a) => a.id)).toEqual(['b']);
});

test('returns [] when no alarm pill is left in the future', () => {
  const c = computed(NOW - HOUR, [pill('a', 'alarm'), pill('b', 'push')]);
  expect(planNativeAlarms(c, NOW)).toEqual([]);
});

test('empty chain: leaveAt falls back to arrival and nothing is planned', () => {
  const c = computed(NOW + HOUR, []);
  expect(planNativeAlarms(c, NOW)).toEqual([]);
});
