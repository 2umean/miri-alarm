import type { ChainComputed } from '../domain';
import { isEventPill, labelSourceFor } from '../domain';
import { t } from '../i18n';
import type { NativeAlarm } from '../../modules/schedularm-alarm';

/**
 * Native alarms for a computed chain: every alarm MARKER still in the future.
 * Past instants must NEVER be (re)scheduled — setAlarmClock fires a past
 * timestamp immediately (mirrors the push path's past filter).
 *
 * The label is derived from position (a marker stores no name): the nearest
 * preceding event's "{name} ends", or `startLabel` for an orphan marker. This
 * derivation is what keeps NativeAlarm's contract — and the Kotlin/Swift ring
 * screens — untouched.
 */
export function planNativeAlarms(
  computed: ChainComputed,
  nowMs: number,
  startLabel: string,
): NativeAlarm[] {
  const pills = computed.items.map((it) => it.pill);
  // The ring countdown's "leave" target: the start of the LAST EVENT pill (the
  // final real leg). A trailing zero-width marker must not drag it onto the
  // arrival instant itself.
  const lastEvent = computed.items.findLast((it) => isEventPill(it.pill));
  const leaveAt = lastEvent ? lastEvent.startAt : computed.arrival;
  return computed.items
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => it.pill.type === 'alarm' && it.endAt > nowMs)
    .map(({ it, index }) => {
      const source = labelSourceFor(pills, index);
      const label = source ? t('chainScreen.eventEnds', { name: source.name }) : startLabel;
      return { id: it.pill.id, at: it.endAt, label, leaveAt };
    });
}
