import { DateTime } from 'luxon';

import {
  computeChain,
  latestAlarmFromComputed,
  latestAlarmInstant,
  totalSpanMinutes,
  upcomingAlarmItem,
} from '../chainEngine';
import { Chain, Pill, PillType } from '../pill';

const at = (zone: string, y: number, mo: number, d: number, h: number, mi: number) =>
  DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi }, { zone }).toMillis();
const clock = (ms: number, zone: string) => DateTime.fromMillis(ms, { zone }).toFormat('HH:mm');

const pill = (id: string, dur: number, type: PillType = 'none'): Pill => ({
  id,
  icon: '⬜',
  name: id,
  dur,
  type,
});

// v2 hero (design): arrival 09:00; 수면(420,alarm) 샤워(20) 아침(20) 채비(15,push) 지하철(35).
const hero = (zone = 'UTC'): Chain => ({
  arrival: at(zone, 2026, 6, 30, 9, 0),
  zone,
  pills: [
    pill('sleep', 420, 'alarm'),
    pill('shower', 20),
    pill('breakfast', 20),
    pill('prep', 15, 'push'),
    pill('commute', 35),
  ],
});

test('computeChain returns null before an arrival is set', () => {
  expect(computeChain({ arrival: null, zone: 'UTC', pills: [pill('a', 30)] })).toBeNull();
});

test('computeChain returns null for a non-finite arrival (NaN must not flow into derived times)', () => {
  expect(computeChain({ arrival: Number.NaN, zone: 'UTC', pills: [pill('a', 30)] })).toBeNull();
});

test('the hero chain back-computes the exact clock times from the design', () => {
  const c = hero();
  const r = computeChain(c)!;
  const ends = Object.fromEntries(r.items.map((it) => [it.pill.id, clock(it.endAt, c.zone)]));
  const starts = Object.fromEntries(r.items.map((it) => [it.pill.id, clock(it.startAt, c.zone)]));

  expect(ends.sleep).toBe('07:30'); // wake alarm
  expect(ends.shower).toBe('07:50');
  expect(ends.breakfast).toBe('08:10');
  expect(ends.prep).toBe('08:25'); // 채비 종료 push
  expect(ends.commute).toBe('09:00'); // == arrival
  expect(starts.sleep).toBe('00:30'); // 취침
  expect(clock(r.start, c.zone)).toBe('00:30'); // chain start == first pill begin
});

test('the last pill ends exactly at the arrival anchor', () => {
  const c = hero();
  const r = computeChain(c)!;
  expect(r.items[r.items.length - 1].endAt).toBe(c.arrival);
  expect(r.arrival).toBe(c.arrival);
});

test('adjacency invariant: each pill ends exactly where the next begins', () => {
  const r = computeChain(hero())!;
  for (let i = 0; i < r.items.length - 1; i += 1) {
    expect(r.items[i].endAt).toBe(r.items[i + 1].startAt);
  }
});

test('each pill spans exactly its duration in elapsed ms (DST-agnostic by construction)', () => {
  const r = computeChain(hero('America/New_York'))!;
  for (const it of r.items) {
    expect(it.endAt - it.startAt).toBe(it.pill.dur * 60_000);
  }
});

test('an empty chain starts at the arrival with no items', () => {
  const c: Chain = { arrival: at('UTC', 2026, 6, 30, 9, 0), zone: 'UTC', pills: [] };
  const r = computeChain(c)!;
  expect(r.items).toEqual([]);
  expect(r.start).toBe(c.arrival);
});

test('totalSpanMinutes sums all durations', () => {
  expect(totalSpanMinutes(hero())).toBe(420 + 20 + 20 + 15 + 35);
});

describe('latestAlarm selectors', () => {
  const zone = 'UTC';
  const twoAlarmChain = (): Chain => ({
    arrival: at(zone, 2026, 6, 30, 9, 0),
    zone,
    pills: [pill('wake', 420, 'alarm'), pill('gap', 30), pill('backup', 15, 'alarm')],
  });

  test('latestAlarmInstant returns the last alarm end (a multi-alarm chain stays armed until the last fires)', () => {
    // wake ends 09:00 − (30+15) = 08:15; backup is the last pill so it ends AT arrival 09:00.
    expect(clock(latestAlarmInstant(twoAlarmChain())!, zone)).toBe('09:00');
  });

  test('latestAlarmFromComputed agrees with latestAlarmInstant on the same chain', () => {
    const c = twoAlarmChain();
    expect(latestAlarmFromComputed(computeChain(c)!)).toBe(latestAlarmInstant(c));
  });

  test('is null with no alarm pills', () => {
    const c: Chain = {
      arrival: at('UTC', 2026, 6, 30, 9, 0),
      zone: 'UTC',
      pills: [pill('p', 30, 'push')],
    };
    expect(latestAlarmInstant(c)).toBeNull();
    expect(latestAlarmFromComputed(computeChain(c)!)).toBeNull();
  });

  test('latestAlarmInstant is null before an arrival exists', () => {
    expect(latestAlarmInstant({ arrival: null, zone: 'UTC', pills: [] })).toBeNull();
  });
});

describe('upcomingAlarmItem', () => {
  const zone = 'UTC';
  // wake ends 09:00 − (30+15) = 08:15; backup is the last pill → ends at 09:00.
  const twoAlarms = (): Chain => ({
    arrival: at(zone, 2026, 6, 30, 9, 0),
    zone,
    pills: [pill('wake', 420, 'alarm'), pill('gap', 30), pill('backup', 15, 'alarm')],
  });

  test('before any alarm: the first alarm', () => {
    const r = computeChain(twoAlarms())!;
    expect(upcomingAlarmItem(r, at(zone, 2026, 6, 30, 8, 0))!.pill.id).toBe('wake');
  });

  test('after the first alarm: the next future one', () => {
    const r = computeChain(twoAlarms())!;
    expect(upcomingAlarmItem(r, at(zone, 2026, 6, 30, 8, 30))!.pill.id).toBe('backup');
  });

  test('after all alarms: falls back to the last one', () => {
    const r = computeChain(twoAlarms())!;
    expect(upcomingAlarmItem(r, at(zone, 2026, 6, 30, 9, 30))!.pill.id).toBe('backup');
  });

  test('no alarm pills → null', () => {
    const r = computeChain({
      arrival: at(zone, 2026, 6, 30, 9, 0),
      zone,
      pills: [pill('p', 30, 'push')],
    })!;
    expect(upcomingAlarmItem(r, at(zone, 2026, 6, 30, 8, 0))).toBeNull();
  });

  test('an alarm ringing exactly now counts as passed → the next one', () => {
    const r = computeChain(twoAlarms())!;
    expect(upcomingAlarmItem(r, at(zone, 2026, 6, 30, 8, 15))!.pill.id).toBe('backup');
  });
});
