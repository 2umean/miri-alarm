import { DateTime } from 'luxon';
import { relativeDayLabel, toLocalClock, DayLabel } from '../domain';

/** Minutes → "H:MM" (e.g. 480 → "8:00", 45 → "0:45"). */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

export type ClockWithDay = { clock: string; day: string };

const DAY_TEXT: Record<DayLabel, string> = {
  'same-day': 'today',
  'prev-day': 'last night',
  'next-day': 'tomorrow',
  other: '',
};

/** Local clock + a human relative-day label, relative to a reference instant. */
export function formatClockWithDay(
  instantMs: number,
  referenceMs: number,
  zone: string,
): ClockWithDay {
  return {
    clock: toLocalClock(instantMs, zone),
    day: DAY_TEXT[relativeDayLabel(instantMs, referenceMs, zone)],
  };
}

/** Map a picked wall-clock HH:mm onto the same calendar day as `baseInstantMs`. */
export function pickedTimeToInstant(
  baseInstantMs: number,
  hour: number,
  minute: number,
  zone: string,
): number {
  return DateTime.fromMillis(baseInstantMs, { zone })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toMillis();
}
