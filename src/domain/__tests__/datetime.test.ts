import { DateTime } from 'luxon';
import { resolveArrivalInstant, toLocalClock, relativeDayLabel, instantToYMD } from '../datetime';

const nowAt = (zone: string, y: number, mo: number, d: number, h: number, mi: number) =>
  DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi }, { zone }).toMillis();

test('a future clock time today resolves to today', () => {
  const now = nowAt('UTC', 2026, 1, 6, 5, 0);
  const ms = resolveArrivalInstant(6, 0, 'UTC', now);
  expect(DateTime.fromMillis(ms, { zone: 'UTC' }).toFormat('yyyy-MM-dd HH:mm')).toBe('2026-01-06 06:00');
});

test('a clock time already past today resolves to tomorrow', () => {
  const now = nowAt('UTC', 2026, 1, 6, 7, 0);
  const ms = resolveArrivalInstant(6, 0, 'UTC', now);
  expect(DateTime.fromMillis(ms, { zone: 'UTC' }).day).toBe(7);
});

test('exactly-now resolves to tomorrow (strictly future)', () => {
  const now = nowAt('UTC', 2026, 1, 6, 6, 0);
  const ms = resolveArrivalInstant(6, 0, 'UTC', now);
  expect(DateTime.fromMillis(ms, { zone: 'UTC' }).day).toBe(7);
});

test('arrival is minute-aligned (seconds/millis zeroed)', () => {
  const now = nowAt('UTC', 2026, 1, 6, 5, 0);
  const ms = resolveArrivalInstant(6, 0, 'UTC', now);
  expect(ms % 60_000).toBe(0);
});

test('a spring-forward nonexistent local time shifts forward', () => {
  // US Eastern 2026-03-08 02:30 does not exist (clocks jump 02:00 -> 03:00)
  const now = nowAt('America/New_York', 2026, 3, 7, 12, 0);
  const ms = resolveArrivalInstant(2, 30, 'America/New_York', now, { year: 2026, month: 3, day: 8 });
  const local = DateTime.fromMillis(ms, { zone: 'America/New_York' });
  expect(local.hour).toBe(3); // bumped past the gap
  expect(local.isValid).toBe(true);
});

test('toLocalClock formats HH:mm in zone', () => {
  const ms = nowAt('Asia/Seoul', 2026, 1, 6, 3, 45);
  expect(toLocalClock(ms, 'Asia/Seoul')).toBe('03:45');
});

test('a fall-back ambiguous local time resolves to the EARLIER occurrence', () => {
  // US Eastern 2026-11-01: clocks fall back 02:00 EDT -> 01:00 EST, so 01:30 occurs twice.
  // Spec policy: resolve to the earlier occurrence (EDT, offset -240).
  const now = nowAt('America/New_York', 2026, 10, 31, 12, 0);
  const ms = resolveArrivalInstant(1, 30, 'America/New_York', now, { year: 2026, month: 11, day: 1 });
  expect(DateTime.fromMillis(ms, { zone: 'America/New_York' }).offset).toBe(-240); // EDT, the earlier 01:30
});

test('relativeDayLabel detects previous day', () => {
  const ref = nowAt('UTC', 2026, 1, 6, 6, 0);
  const prev = nowAt('UTC', 2026, 1, 5, 19, 45);
  expect(relativeDayLabel(prev, ref, 'UTC')).toBe('prev-day');
});

test('relativeDayLabel detects same-day and next-day', () => {
  const ref = nowAt('UTC', 2026, 1, 6, 6, 0);
  expect(relativeDayLabel(nowAt('UTC', 2026, 1, 6, 22, 0), ref, 'UTC')).toBe('same-day');
  expect(relativeDayLabel(nowAt('UTC', 2026, 1, 7, 3, 0), ref, 'UTC')).toBe('next-day');
});

test('an explicit date with a passed time returns that past instant (rollover advances it downstream)', () => {
  const now = nowAt('UTC', 2026, 1, 6, 9, 0);
  const ms = resolveArrivalInstant(8, 0, 'UTC', now, { year: 2026, month: 1, day: 6 });
  expect(ms).toBeLessThan(now);
  expect(DateTime.fromMillis(ms, { zone: 'UTC' }).toFormat('yyyy-MM-dd HH:mm')).toBe('2026-01-06 08:00');
});

describe('instantToYMD (the inverse the picker needs to open on the current arrival)', () => {
  test('round-trips with resolveArrivalInstant in the same zone', () => {
    const zone = 'Asia/Seoul';
    const now = nowAt(zone, 2026, 7, 14, 12, 0);
    const ymd = { year: 2026, month: 7, day: 15 };
    const instant = resolveArrivalInstant(9, 0, zone, now, ymd);
    expect(instantToYMD(instant, zone)).toEqual(ymd);
  });

  test('the calendar date is the ZONE\'s date, not UTC\'s', () => {
    // 2026-01-06 23:30 UTC is already Jan 7 in Seoul (UTC+9).
    const instant = nowAt('UTC', 2026, 1, 6, 23, 30);
    expect(instantToYMD(instant, 'Asia/Seoul')).toEqual({ year: 2026, month: 1, day: 7 });
    expect(instantToYMD(instant, 'UTC')).toEqual({ year: 2026, month: 1, day: 6 });
  });

  test('stable across a DST fall-back day', () => {
    const zone = 'America/New_York';
    const instant = nowAt(zone, 2026, 11, 1, 12, 0); // the 25-hour day
    expect(instantToYMD(instant, zone)).toEqual({ year: 2026, month: 11, day: 1 });
  });
});
