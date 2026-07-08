import type { ChainComputed } from '../domain';
import type { NativeAlarm } from '../../modules/schedularm-alarm';

/**
 * Native alarms to schedule for a computed chain: every alarm pill still in the
 * future. Past instants must NEVER be (re)scheduled — setAlarmClock fires a past
 * timestamp immediately, so a launch re-arm would spuriously re-ring an alarm
 * the user already dismissed (mirrors the push path's past filter).
 */
export function planNativeAlarms(computed: ChainComputed, nowMs: number): NativeAlarm[] {
  // The ring countdown's "leave" target is the start of the FINAL pill (the
  // commute/last leg = when the user must head out), shared by every alarm.
  const last = computed.items[computed.items.length - 1];
  const leaveAt = last ? last.startAt : computed.arrival;
  return computed.items
    .filter((it) => it.pill.type === 'alarm' && it.endAt > nowMs)
    .map((it) => ({ id: it.pill.id, at: it.endAt, label: it.pill.name, leaveAt }));
}
