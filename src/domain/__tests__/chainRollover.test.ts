import { DateTime } from 'luxon';

import { primaryEventInstant } from '../chainEngine';
import { rollChainToFuture } from '../chainRollover';
import { Chain, Pill, PillType } from '../pill';

const at = (zone: string, y: number, mo: number, d: number, h: number, mi: number) =>
  DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi }, { zone }).toMillis();

const pill = (id: string, dur: number, type: PillType = 'none'): Pill => ({
  id,
  icon: '⬜',
  name: id,
  dur,
  type,
});

const arrivalLocal = (c: Chain) => DateTime.fromMillis(c.arrival!, { zone: c.zone });

// arrival 09:00; alarm pill ends at 09:00 − 35 (commute) = 08:25 = primary.
const base = (zone: string, d: number): Chain => ({
  arrival: at(zone, 2026, 1, d, 9, 0),
  zone,
  pills: [pill('sleep', 420, 'alarm'), pill('commute', 35)],
});

test('no arrival → identity', () => {
  const c: Chain = { arrival: null, zone: 'UTC', pills: [pill('a', 30, 'alarm')] };
  expect(rollChainToFuture(c, Date.UTC(2026, 0, 6))).toBe(c);
});

test('a primary still in the future is returned unchanged (identity)', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 6, 7, 0); // before primary 08:25
  expect(rollChainToFuture(c, now)).toBe(c);
});

test('a primary that just passed rolls the whole chain to the next day', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 6, 8, 30); // after primary 08:25 on day 6
  const rolled = rollChainToFuture(c, now);
  expect(arrivalLocal(rolled).day).toBe(7);
  expect(arrivalLocal(rolled).toFormat('HH:mm')).toBe('09:00');
  expect(primaryEventInstant(rolled)!).toBeGreaterThan(now);
});

test('primary exactly == now still rolls forward (strictly future)', () => {
  const c = base('UTC', 6);
  const now = primaryEventInstant(c)!;
  const rolled = rollChainToFuture(c, now);
  expect(primaryEventInstant(rolled)!).toBeGreaterThan(now);
  expect(arrivalLocal(rolled).day).toBe(7);
});

test('a primary several days in the past advances by as many whole days as needed', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 9, 12, 0); // 3+ days past
  const rolled = rollChainToFuture(c, now);
  expect(primaryEventInstant(rolled)!).toBeGreaterThan(now);
  expect(arrivalLocal(rolled).toFormat('HH:mm')).toBe('09:00');
  expect(arrivalLocal(rolled).day).toBe(10);
});

test('pills are untouched by the roll (same reference)', () => {
  const c = base('UTC', 6);
  const rolled = rollChainToFuture(c, at('UTC', 2026, 1, 6, 8, 30));
  expect(rolled.pills).toBe(c.pills);
});

test('rolled arrival stays minute-aligned', () => {
  const c = base('UTC', 6);
  const rolled = rollChainToFuture(c, at('UTC', 2026, 1, 6, 8, 30));
  expect(rolled.arrival! % 60_000).toBe(0);
});

test('an event-less chain rolls on the arrival itself', () => {
  const zone = 'UTC';
  const c: Chain = { arrival: at(zone, 2026, 1, 6, 9, 0), zone, pills: [pill('a', 60)] };
  const now = at(zone, 2026, 1, 6, 10, 0); // after arrival 09:00
  const rolled = rollChainToFuture(c, now);
  expect(arrivalLocal(rolled).day).toBe(7);
  expect(primaryEventInstant(rolled)!).toBeGreaterThan(now);
});

test('rolling across a spring-forward day preserves the wall-clock arrival time', () => {
  // US Eastern spring-forward 2026-03-08 (02:00 → 03:00). arrival 12:00 on 03-07;
  // primary (alarm end) = 12:00 − 60 (commute) = 11:00. now just after → roll to 03-08 12:00.
  const zone = 'America/New_York';
  const c: Chain = {
    arrival: at(zone, 2026, 3, 7, 12, 0),
    zone,
    pills: [pill('sleep', 420, 'alarm'), pill('commute', 60)],
  };
  const now = at(zone, 2026, 3, 7, 11, 30);
  const rolled = rollChainToFuture(c, now);
  const local = arrivalLocal(rolled);
  expect(local.day).toBe(8);
  expect(local.toFormat('HH:mm')).toBe('12:00'); // same wall-clock despite the 23h day
  // primary on day 8 is 11:00 local, strictly in the future.
  expect(DateTime.fromMillis(primaryEventInstant(rolled)!, { zone }).toFormat('HH:mm')).toBe('11:00');
});
