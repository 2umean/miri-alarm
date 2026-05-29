import { DateTime } from 'luxon';
import { reverseCalc } from '../engine';
import { MINUTE_MS, Schedule } from '../schedule';

const arrivalUtc = (h: number, m: number) =>
  DateTime.fromObject({ year: 2026, month: 1, day: 6, hour: h, minute: m }, { zone: 'UTC' }).toMillis();

test('reverseCalc derives leaveHome/wake/fallAsleep by subtracting durations', () => {
  const s: Schedule = { arrival: arrivalUtc(6, 0), zone: 'UTC', contingency: 15, travel: 70, prep: 50, sleep: 480 };
  const d = reverseCalc(s);
  const hhmm = (ms: number) => DateTime.fromMillis(ms, { zone: 'UTC' }).toFormat('HH:mm');
  expect(hhmm(d.leaveHome)).toBe('04:35');
  expect(hhmm(d.wake)).toBe('03:45');
  expect(hhmm(d.fallAsleep)).toBe('19:45'); // previous day
});

test('fallAsleep lands on the previous calendar day for an early report', () => {
  const s: Schedule = { arrival: arrivalUtc(6, 0), zone: 'UTC', contingency: 15, travel: 70, prep: 50, sleep: 480 };
  const d = reverseCalc(s);
  expect(DateTime.fromMillis(d.fallAsleep, { zone: 'UTC' }).day).toBe(5);
});

test('an N-minute gap is preserved as REAL elapsed time across a DST spring-forward', () => {
  // US Eastern springs forward 2026-03-08 02:00 -> 03:00. Arrival 04:00 local that day;
  // a 9h sleep chain (contingency+travel+prep+sleep) crosses the gap.
  const arrival = DateTime.fromObject(
    { year: 2026, month: 3, day: 8, hour: 4, minute: 0 },
    { zone: 'America/New_York' },
  ).toMillis();
  const s: Schedule = { arrival, zone: 'America/New_York', contingency: 0, travel: 0, prep: 0, sleep: 540 };
  const d = reverseCalc(s);
  // (a) elapsed REAL time is exactly 540 minutes (epoch math is DST-agnostic)
  expect((arrival - d.fallAsleep) / MINUTE_MS).toBe(540);
  // (b) the LOCAL clock face lands at 18:00 the previous day. A naive clock-face
  //     subtraction (04:00 − 9h) would wrongly give 19:00; 18:00 proves the skipped
  //     DST hour was absorbed as real elapsed time.
  const fa = DateTime.fromMillis(d.fallAsleep, { zone: 'America/New_York' });
  expect(fa.toFormat('HH:mm')).toBe('18:00');
  expect(fa.day).toBe(7);
});
