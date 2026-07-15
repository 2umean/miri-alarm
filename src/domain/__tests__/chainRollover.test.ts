import { DateTime } from 'luxon';

import { rollChainToFuture } from '../chainRollover';
import { Chain, Pill } from '../pill';

const at = (zone: string, y: number, mo: number, d: number, h: number, mi: number) =>
  DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi }, { zone }).toMillis();

const event = (id: string, dur: number): Pill => ({ id, type: 'none', icon: '⬜', name: id, dur });
const marker = (id: string, type: 'push' | 'alarm' = 'alarm'): Pill => ({ id, type });

const arrivalLocal = (c: Chain) => DateTime.fromMillis(c.arrival!, { zone: c.zone });

// arrival 09:00; the alarm pill ends at 09:00 − 35 (commute) = 08:25.
const base = (zone: string, d: number): Chain => ({
  arrival: at(zone, 2026, 1, d, 9, 0),
  zone,
  pills: [event('sleep', 420), marker('wake'), event('commute', 35)],
});

test('no arrival → identity', () => {
  const c: Chain = { arrival: null, zone: 'UTC', pills: [event('a', 30), marker('m')] };
  expect(rollChainToFuture(c, Date.UTC(2026, 0, 6))).toBe(c);
});

test('a non-finite arrival → identity (defensive, NaN must not roll)', () => {
  const c: Chain = { arrival: Number.NaN, zone: 'UTC', pills: [event('a', 30), marker('m')] };
  expect(rollChainToFuture(c, Date.UTC(2026, 0, 6))).toBe(c);
});

test('a future arrival is returned unchanged (identity)', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 6, 7, 0); // morning, everything ahead
  expect(rollChainToFuture(c, now)).toBe(c);
});

test('alarms passed but arrival still ahead → NO roll (the v0.3 invariant)', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 6, 8, 30); // alarm end 08:25 passed; arrival 09:00 ahead
  expect(rollChainToFuture(c, now)).toBe(c); // referential identity — today's chain stays
});

test('an arrival that just passed rolls the whole chain to the next day', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 6, 9, 30); // after arrival 09:00
  const rolled = rollChainToFuture(c, now);
  expect(arrivalLocal(rolled).day).toBe(7);
  expect(arrivalLocal(rolled).toFormat('HH:mm')).toBe('09:00');
  expect(rolled.arrival!).toBeGreaterThan(now);
});

test('arrival exactly == now still rolls forward (strictly future)', () => {
  const c = base('UTC', 6);
  const now = c.arrival!;
  const rolled = rollChainToFuture(c, now);
  expect(rolled.arrival!).toBeGreaterThan(now);
  expect(arrivalLocal(rolled).day).toBe(7);
});

test('an arrival several days in the past advances by as many whole days as needed', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 9, 12, 0); // 3 days + 3 h past the arrival
  const rolled = rollChainToFuture(c, now);
  expect(rolled.arrival!).toBeGreaterThan(now);
  expect(arrivalLocal(rolled).toFormat('HH:mm')).toBe('09:00');
  expect(arrivalLocal(rolled).day).toBe(10);
});

test('pills are untouched by the roll (same reference)', () => {
  const c = base('UTC', 6);
  const rolled = rollChainToFuture(c, at('UTC', 2026, 1, 6, 9, 30));
  expect(rolled.pills).toBe(c.pills);
});

test('rolled arrival stays minute-aligned', () => {
  const c = base('UTC', 6);
  const rolled = rollChainToFuture(c, at('UTC', 2026, 1, 6, 9, 30));
  expect(rolled.arrival! % 60_000).toBe(0);
});

test('rolling across a spring-forward day preserves the wall-clock arrival time', () => {
  // US Eastern spring-forward 2026-03-08 (02:00 → 03:00). arrival 12:00 on 03-07;
  // now just after that arrival → roll to 03-08 12:00 despite the 23-hour day.
  const zone = 'America/New_York';
  const c: Chain = {
    arrival: at(zone, 2026, 3, 7, 12, 0),
    zone,
    pills: [event('sleep', 420), marker('wake'), event('commute', 60)],
  };
  const now = at(zone, 2026, 3, 7, 12, 30);
  const rolled = rollChainToFuture(c, now);
  const local = arrivalLocal(rolled);
  expect(local.day).toBe(8);
  expect(local.toFormat('HH:mm')).toBe('12:00'); // same wall-clock
  expect(rolled.arrival!).toBeGreaterThan(now);
});

test('rolling across a fall-back day does not overshoot (25h day, next occurrence still ahead)', () => {
  // US Eastern fall-back 2026-11-01 (02:00 EDT → 01:00 EST): that calendar day
  // lasts 25 hours. arrival Sat 10-31 09:00 EDT; now Sun 11-01 08:30 EST is
  // 24.5 real hours later — but the NEXT 09:00 (Sun 11-01) is still 30 minutes
  // ahead. A fixed-24h ceil bulk jump would skip it and land on 11-02.
  const zone = 'America/New_York';
  const c: Chain = { arrival: at(zone, 2026, 10, 31, 9, 0), zone, pills: [event('sleep', 420), marker('wake')] };
  const now = at(zone, 2026, 11, 1, 8, 30);
  const rolled = rollChainToFuture(c, now);
  const local = arrivalLocal(rolled);
  expect(local.month).toBe(11);
  expect(local.day).toBe(1);
  expect(local.toFormat('HH:mm')).toBe('09:00');
  expect(rolled.arrival!).toBeGreaterThan(now);
});

test('a pill-less chain rolls on the arrival alone (pills are never consulted)', () => {
  const c: Chain = { arrival: at('UTC', 2026, 1, 6, 9, 0), zone: 'UTC', pills: [] };
  const rolled = rollChainToFuture(c, at('UTC', 2026, 1, 6, 10, 0));
  expect(DateTime.fromMillis(rolled.arrival!, { zone: 'UTC' }).day).toBe(7);
});
