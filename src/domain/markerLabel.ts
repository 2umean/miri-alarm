import { EventPill, Pill, isEventPill } from './pill';

/**
 * The source event for a marker's derived label: the nearest EventPill BEFORE
 * `index`, skipping other markers. Null when none exists (an orphan marker) —
 * callers then use the chain's start label. i18n application stays with the
 * caller: `source ? t('chainScreen.eventEnds', { name: source.name }) : startLabel`.
 * One derivation feeds the chain row, NativeAlarm.label, the push title, and
 * the armed chip; each caller formats it for its surface (the ring label also
 * prefixes the event emoji), and native code only displays the final string.
 */
export function labelSourceFor(pills: readonly Pill[], index: number): EventPill | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    const p = pills[i];
    if (isEventPill(p)) return p;
  }
  return null;
}
