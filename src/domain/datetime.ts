import { DateTime } from 'luxon';

export type YMD = { year: number; month: number; day: number };

/**
 * Resolve a wall-clock time in `zone` to the soonest future instant strictly after `nowMs`.
 * With an explicit date, resolves that date. Luxon resolves DST-nonexistent local times
 * forward and ambiguous (fall-back) times to the earlier offset, matching the spec policy.
 */
export function resolveArrivalInstant(
  hour: number,
  minute: number,
  zone: string,
  nowMs: number,
  date?: YMD,
): number {
  const now = DateTime.fromMillis(nowMs, { zone });
  let target = date
    ? DateTime.fromObject({ ...date, hour, minute, second: 0, millisecond: 0 }, { zone })
    : now.set({ hour, minute, second: 0, millisecond: 0 });
  if (!date && target <= now) {
    target = target.plus({ days: 1 });
  }
  return target.toMillis();
}

export function toLocalClock(instantMs: number, zone: string): string {
  return DateTime.fromMillis(instantMs, { zone }).toFormat('HH:mm');
}

export type DayLabel = 'same-day' | 'prev-day' | 'next-day' | 'other';

export function relativeDayLabel(instantMs: number, referenceMs: number, zone: string): DayLabel {
  const a = DateTime.fromMillis(instantMs, { zone }).startOf('day');
  const b = DateTime.fromMillis(referenceMs, { zone }).startOf('day');
  const diff = Math.round(a.diff(b, 'days').days);
  if (diff === 0) return 'same-day';
  if (diff === -1) return 'prev-day';
  if (diff === 1) return 'next-day';
  return 'other';
}
