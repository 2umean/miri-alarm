import { DateTime } from 'luxon';
import {
  composeDuration,
  formatAlarmDate,
  formatDuration,
  formatClockWithDay,
  formatMonthDay,
  splitDuration,
} from '../format';

const at = (day: number, h: number, m: number) =>
  DateTime.fromObject({ year: 2026, month: 1, day, hour: h, minute: m }, { zone: 'UTC' }).toMillis();

test('formatDuration renders H:MM', () => {
  expect(formatDuration(480)).toBe('8:00');
  expect(formatDuration(45)).toBe('0:45');
  expect(formatDuration(70)).toBe('1:10');
  expect(formatDuration(0)).toBe('0:00');
  expect(formatDuration(-70)).toBe('-1:10');
});

test('splitDuration splits whole minutes into hours and mins', () => {
  expect(splitDuration(480)).toEqual({ hours: 8, mins: 0 });
  expect(splitDuration(45)).toEqual({ hours: 0, mins: 45 });
  expect(splitDuration(70)).toEqual({ hours: 1, mins: 10 });
  expect(splitDuration(0)).toEqual({ hours: 0, mins: 0 });
});

test('splitDuration floors negative / non-finite input to zero', () => {
  expect(splitDuration(-70)).toEqual({ hours: 0, mins: 0 });
  expect(splitDuration(NaN)).toEqual({ hours: 0, mins: 0 });
});

test('composeDuration combines H:MM fields into total minutes', () => {
  expect(composeDuration('8', '00', 960)).toEqual({ total: 480, capped: false });
  expect(composeDuration('0', '45', 360)).toEqual({ total: 45, capped: false });
  expect(composeDuration('', '', 360)).toEqual({ total: 0, capped: false });
});

test('composeDuration flags and clamps an over-max entry (so visible can snap to committed)', () => {
  // 16:30 = 990 > sleep max 960 → clamp to 960, capped
  expect(composeDuration('16', '30', 960)).toEqual({ total: 960, capped: true });
  // 6:45 = 405 > prep max 360 → clamp to 360, capped
  expect(composeDuration('6', '45', 360)).toEqual({ total: 360, capped: true });
  // an over-max hours entry clamps too
  expect(composeDuration('20', '00', 960)).toEqual({ total: 960, capped: true });
});

test('composeDuration normalizes a minutes overflow that is still within max', () => {
  // 0:75 = 75 ≤ travel max 720 → not capped, carry handled by splitDuration on display
  expect(composeDuration('0', '75', 720)).toEqual({ total: 75, capped: false });
});

test('formatClockWithDay shows the clock and a relative-day label', () => {
  const ref = at(6, 6, 0); // arrival 06:00 day 6
  expect(formatClockWithDay(at(6, 3, 45), ref, 'UTC')).toEqual({ clock: '03:45', day: 'today' });
  expect(formatClockWithDay(at(5, 19, 45), ref, 'UTC')).toEqual({ clock: '19:45', day: 'last night' });
  expect(formatClockWithDay(at(7, 3, 0), ref, 'UTC')).toEqual({ clock: '03:00', day: 'tomorrow' });
});

test('formatAlarmDate is null when the alarm rings today (no chip)', () => {
  const now = at(6, 6, 0); // day 6, 06:00
  expect(formatAlarmDate(at(6, 23, 0), now, 'UTC')).toBeNull(); // wake later same day
});

test('formatAlarmDate shows "Tomorrow" + the date for a next-day alarm', () => {
  const now = at(6, 20, 0); // day 6, 20:00
  const chip = formatAlarmDate(at(7, 3, 45), now, 'UTC'); // wake day 7 03:45
  expect(chip).not.toBeNull();
  expect(chip).toContain('Tomorrow');
  expect(chip).toContain('7'); // the day-of-month
});

test('formatAlarmDate shows the date alone (no relative word) for 2+ days out', () => {
  const now = at(6, 20, 0);
  const chip = formatAlarmDate(at(9, 3, 45), now, 'UTC'); // wake day 9
  expect(chip).not.toBeNull();
  expect(chip).not.toContain('Tomorrow');
  expect(chip).toContain('9');
});

test('formatAlarmDate localizes the relative word to Korean', () => {
  const { i18n } = require('../../i18n');
  const prev = i18n.locale;
  i18n.locale = 'ko';
  try {
    const chip = formatAlarmDate(at(7, 3, 45), at(6, 20, 0), 'UTC');
    expect(chip).toContain('내일');
  } finally {
    i18n.locale = prev;
  }
});

test('day labels localize to Korean when the locale is ko', () => {
  const { i18n } = require('../../i18n');
  const prev = i18n.locale;
  i18n.locale = 'ko';
  try {
    const ref = at(6, 6, 0);
    expect(formatClockWithDay(at(6, 3, 45), ref, 'UTC').day).toBe('오늘');
    expect(formatClockWithDay(at(5, 19, 45), ref, 'UTC').day).toBe('어젯밤');
    expect(formatClockWithDay(at(7, 3, 0), ref, 'UTC').day).toBe('내일');
  } finally {
    i18n.locale = prev;
  }
});

test('formatMonthDay renders numeric M/d (no zero padding) in the given zone', () => {
  expect(formatMonthDay(at(6, 9, 0), 'UTC')).toBe('1/6');
  // 2026-01-06 23:30 UTC is already the next day in Seoul — the zone decides the day.
  expect(formatMonthDay(at(6, 23, 30), 'Asia/Seoul')).toBe('1/7');
  expect(
    formatMonthDay(
      DateTime.fromObject({ year: 2026, month: 12, day: 31, hour: 8 }, { zone: 'UTC' }).toMillis(),
      'UTC',
    ),
  ).toBe('12/31');
});
