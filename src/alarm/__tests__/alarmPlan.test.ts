import { planNativeAlarms } from '../alarmPlan';
import type { ChainComputed, Pill } from '../../domain';
import { pillDur } from '../../domain';

const HOUR = 3_600_000;
const NOW = 1_780_000_000_000;
const START = '평일 아침 시작';

const event = (id: string, dur: number, name = id): Pill => ({ id, type: 'none', icon: '⬜', name, dur });
const marker = (id: string, type: 'push' | 'alarm' = 'alarm'): Pill => ({ id, type });

/** Suffix-sum builder mirroring computeChain, with 1 dur unit = 1 HOUR for readable math. */
const computed = (arrival: number, pills: Pill[]): ChainComputed => {
  const items = new Array(pills.length);
  let suffix = 0;
  for (let i = pills.length - 1; i >= 0; i -= 1) {
    const endAt = arrival - suffix * HOUR;
    const startAt = endAt - pillDur(pills[i]) * HOUR;
    items[i] = { pill: pills[i], startAt, endAt };
    suffix += pillDur(pills[i]);
  }
  return { start: arrival - suffix * HOUR, arrival, items };
};

test('maps only alarm markers; label = "{preceding event} ends"; leaveAt = last EVENT start', () => {
  // arrival NOW+4h → commute [NOW+2h, NOW+4h]; leave(push) at NOW+2h; shower
  // [NOW+1h, NOW+2h]; wake at NOW+1h; sleep [NOW, NOW+1h].
  const c = computed(NOW + 4 * HOUR, [
    event('sleep', 1, 'Sleep'),
    marker('wake', 'alarm'),
    event('shower', 1),
    marker('leave', 'push'),
    event('commute', 2),
  ]);
  const alarms = planNativeAlarms(c, NOW, START);
  expect(alarms).toEqual([
    { id: 'wake', at: NOW + 1 * HOUR, label: '⬜ Sleep ends', leaveAt: NOW + 2 * HOUR },
  ]);
});

test('an ORPHAN alarm marker (index 0) takes the start label and fires at computed.start', () => {
  const c = computed(NOW + 3 * HOUR, [marker('first', 'alarm'), event('commute', 1)]);
  const alarms = planNativeAlarms(c, NOW, START);
  expect(alarms).toEqual([{ id: 'first', at: NOW + 2 * HOUR, label: START, leaveAt: NOW + 2 * HOUR }]);
});

test('DUPLICATE alarm markers produce two NativeAlarms at the same `at`', () => {
  const c = computed(NOW + 2 * HOUR, [event('sleep', 1, 'Sleep'), marker('a'), marker('b')]);
  const alarms = planNativeAlarms(c, NOW, START);
  expect(alarms).toHaveLength(2);
  expect(alarms[0].at).toBe(alarms[1].at);
  expect(alarms.map((a) => a.id)).toEqual(['a', 'b']);
  expect(alarms.map((a) => a.label)).toEqual(['⬜ Sleep ends', '⬜ Sleep ends']);
});

test('a marker between markers scans back past them for its label', () => {
  const c = computed(NOW + 2 * HOUR, [event('sleep', 1, 'Sleep'), marker('p', 'push'), marker('a', 'alarm')]);
  expect(planNativeAlarms(c, NOW, START)[0].label).toBe('⬜ Sleep ends');
});

test('label carries the source event emoji; a blank icon adds no prefix', () => {
  const withEmoji: Pill = { id: 'sleep', type: 'none', icon: '🛏️', name: 'Sleep', dur: 1 };
  const blankIcon: Pill = { id: 'work', type: 'none', icon: '  ', name: 'Work', dur: 1 };
  const c = computed(NOW + 4 * HOUR, [withEmoji, marker('wake'), blankIcon, marker('door')]);
  const labels = planNativeAlarms(c, NOW, START).map((a) => a.label);
  expect(labels).toEqual(['🛏️ Sleep ends', 'Work ends']);
});

test('leaveAt skips a TRAILING marker — it stays on the last event leg, not the arrival', () => {
  const arrival = NOW + 4 * HOUR;
  const c = computed(arrival, [event('sleep', 1), marker('wake'), event('commute', 2), marker('door', 'alarm')]);
  const alarms = planNativeAlarms(c, NOW, START);
  // commute spans [arrival-2h, arrival]; leaveAt must be its start, not arrival.
  for (const a of alarms) expect(a.leaveAt).toBe(arrival - 2 * HOUR);
  // and the trailing marker itself fires exactly at the arrival instant:
  expect(alarms.find((a) => a.id === 'door')!.at).toBe(arrival);
});

test('drops alarms whose instant already passed (no spurious re-ring on launch re-arm)', () => {
  // arrival NOW+0.5h → b spans [NOW-0.5h, NOW+0.5h]; a-m fires at NOW-0.5h (past).
  const c = computed(NOW + HOUR / 2, [event('a', 1), marker('a-m'), event('b', 1), marker('b-m')]);
  expect(planNativeAlarms(c, NOW, START).map((a) => a.id)).toEqual(['b-m']);
});

test('an alarm firing exactly now is past, not future', () => {
  const c = computed(NOW + HOUR, [event('a', 1), marker('a-m'), event('b', 1), marker('b-m')]);
  expect(c.items[1].endAt).toBe(NOW);
  expect(planNativeAlarms(c, NOW, START).map((a) => a.id)).toEqual(['b-m']);
});

test('returns [] with no future alarm markers; empty chain leaveAt falls back to arrival', () => {
  expect(planNativeAlarms(computed(NOW - HOUR, [event('a', 1), marker('m')]), NOW, START)).toEqual([]);
  expect(planNativeAlarms(computed(NOW + HOUR, []), NOW, START)).toEqual([]);
});
