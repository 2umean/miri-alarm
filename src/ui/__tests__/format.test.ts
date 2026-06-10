import { DateTime } from 'luxon';
import { formatDuration, formatClockWithDay, pickedTimeToInstant } from '../format';

const at = (day: number, h: number, m: number) =>
  DateTime.fromObject({ year: 2026, month: 1, day, hour: h, minute: m }, { zone: 'UTC' }).toMillis();

test('formatDuration renders H:MM', () => {
  expect(formatDuration(480)).toBe('8:00');
  expect(formatDuration(45)).toBe('0:45');
  expect(formatDuration(70)).toBe('1:10');
  expect(formatDuration(0)).toBe('0:00');
  expect(formatDuration(-70)).toBe('-1:10');
});

test('formatClockWithDay shows the clock and a relative-day label', () => {
  const ref = at(6, 6, 0); // arrival 06:00 day 6
  expect(formatClockWithDay(at(6, 3, 45), ref, 'UTC')).toEqual({ clock: '03:45', day: 'today' });
  expect(formatClockWithDay(at(5, 19, 45), ref, 'UTC')).toEqual({ clock: '19:45', day: 'last night' });
  expect(formatClockWithDay(at(7, 3, 0), ref, 'UTC')).toEqual({ clock: '03:00', day: 'tomorrow' });
});

test('pickedTimeToInstant maps an HH:mm onto the same calendar day as a base instant', () => {
  const base = at(6, 3, 45); // some derived time on day 6
  const out = pickedTimeToInstant(base, 4, 15, 'UTC');
  expect(DateTime.fromMillis(out, { zone: 'UTC' }).toFormat('yyyy-MM-dd HH:mm')).toBe('2026-01-06 04:15');
});
