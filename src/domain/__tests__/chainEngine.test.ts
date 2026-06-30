import { DateTime } from 'luxon';

import { computeChain, primaryEventInstant, totalSpanMinutes } from '../chainEngine';
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

describe('primaryEventInstant', () => {
  test('is null before an arrival exists', () => {
    expect(primaryEventInstant({ arrival: null, zone: 'UTC', pills: [] })).toBeNull();
  });

  test('prefers the earliest alarm end (the hero wake at 07:30)', () => {
    const c = hero();
    expect(clock(primaryEventInstant(c)!, c.zone)).toBe('07:30');
  });

  test('with two alarms, picks the earlier (chronologically first) one', () => {
    const zone = 'UTC';
    const c: Chain = {
      arrival: at(zone, 2026, 6, 30, 9, 0),
      zone,
      pills: [pill('first', 60, 'alarm'), pill('mid', 60), pill('second', 30, 'alarm')],
    };
    // first ends at 09:00 − (60+30) = 07:30; second ends at 09:00 − 30 = 08:30.
    expect(clock(primaryEventInstant(c)!, zone)).toBe('07:30');
  });

  test('falls back to the earliest push when there is no alarm', () => {
    const zone = 'UTC';
    const c: Chain = {
      arrival: at(zone, 2026, 6, 30, 9, 0),
      zone,
      pills: [pill('b', 30, 'push'), pill('a', 60)],
    };
    // push 'b' ends where 'a' begins: 09:00 − 60 = 08:00 (strictly before the arrival).
    expect(clock(primaryEventInstant(c)!, zone)).toBe('08:00');
  });

  test('falls back to the arrival when no pill carries an event', () => {
    const c: Chain = { arrival: at('UTC', 2026, 6, 30, 9, 0), zone: 'UTC', pills: [pill('a', 60)] };
    expect(primaryEventInstant(c)).toBe(c.arrival);
  });

  test('anchors on the alarm even when a push ends earlier (deliberate: avoids deferring the alarm a day)', () => {
    const zone = 'UTC';
    const c: Chain = {
      arrival: at(zone, 2026, 6, 30, 9, 0),
      zone,
      pills: [pill('melatonin', 10, 'push'), pill('sleep', 420, 'alarm'), pill('commute', 35)],
    };
    // melatonin (push) ends at 01:25 — earlier than the sleep alarm end (08:25) — yet the
    // primary instant is the ALARM (08:25), so a passed early push never rolls the whole day.
    expect(clock(primaryEventInstant(c)!, zone)).toBe('08:25');
  });
});
