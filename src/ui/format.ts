import { DateTime } from 'luxon';

import { relativeDayLabel, toLocalClock } from '../domain';
import { i18n, t } from '../i18n';

/** Minutes → "H:MM" (e.g. 480 → "8:00", 45 → "0:45"). */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

/** Whole minutes → { hours, mins } for the duration editor's H : MM fields.
 *  Negative / non-finite inputs collapse to zero (the fields never go below 0). */
export function splitDuration(total: number): { hours: number; mins: number } {
  const abs = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  return { hours: Math.floor(abs / 60), mins: abs % 60 };
}

/** Compose the duration editor's two field strings into a clamped [0, max] total.
 *  `capped` flags that the raw input was out of range, so the UI can snap the
 *  visible fields to the clamped value (keeping displayed === committed). */
export function composeDuration(
  hours: string,
  mins: string,
  max: number,
): { total: number; capped: boolean } {
  const raw = Number(hours || '0') * 60 + Number(mins || '0');
  const total = Math.min(max, Math.max(0, raw));
  return { total, capped: total !== raw };
}

export type ClockWithDay = { clock: string; day: string };

/** Local clock + a localized relative-day label, relative to a reference instant. */
export function formatClockWithDay(
  instantMs: number,
  referenceMs: number,
  zone: string,
): ClockWithDay {
  return {
    clock: toLocalClock(instantMs, zone),
    day: t(`day.${relativeDayLabel(instantMs, referenceMs, zone)}`),
  };
}

/**
 * A short, localized badge for the date the alarm will ring (its wake instant),
 * relative to `nowMs` — or `null` when it rings today (so the chip is hidden).
 * Next-day → "Tomorrow · Thu, Jun 18"; further out → the date alone. The alarm
 * never rolls into the past, so a prev-day case can't occur in practice.
 */
export function formatAlarmDate(wakeMs: number, nowMs: number, zone: string): string | null {
  const label = relativeDayLabel(wakeMs, nowMs, zone);
  if (label === 'same-day') return null;
  const date = DateTime.fromMillis(wakeMs, { zone })
    .setLocale(i18n.locale)
    .toLocaleString({ weekday: 'short', month: 'short', day: 'numeric' });
  if (label !== 'next-day') return date;
  const word = t('day.next-day');
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} · ${date}`;
}
