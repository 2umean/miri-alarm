import { MINUTE_MS } from './schedule';
import { Chain, Pill } from './pill';

/**
 * Reverse-calc for the v2 pill chain. Same DST-safe philosophy as v1's engine:
 * every time is the arrival anchor minus an ELAPSED-ms offset, so gaps are
 * DST-correct by construction (no wall-clock arithmetic across offsets here).
 */

export type ComputedItem = {
  pill: Pill;
  startAt: number; // epoch ms when this pill begins
  endAt: number; // epoch ms when this pill ends (= next pill's start; last pill's end = arrival)
};

export type ChainComputed = {
  start: number; // epoch ms when the first pill begins (the bedtime/취침 cap); == arrival when there are no pills
  items: ComputedItem[];
  arrival: number;
};

/** Total span (sum of all pill durations), in minutes. */
export function totalSpanMinutes(chain: Chain): number {
  return chain.pills.reduce((sum, p) => sum + p.dur, 0);
}

/**
 * Compute each pill's start/end from the arrival anchor. Returns null when there
 * is no usable anchor — `null` (not entered) OR a non-finite instant (e.g. a NaN
 * produced upstream by an invalid zone): a NaN anchor must never flow into the
 * derived times, or the arm-safety gate would compare `NaN <= now` and fail open.
 * Walks right→left accumulating the suffix duration: pill i ends `sum(durations
 * after i)` before arrival.
 */
export function computeChain(chain: Chain): ChainComputed | null {
  if (chain.arrival == null || !Number.isFinite(chain.arrival)) return null;
  const arrival = chain.arrival;
  const n = chain.pills.length;
  const items: ComputedItem[] = new Array(n);

  let suffixAfter = 0; // minutes of all pills strictly after the current index
  for (let i = n - 1; i >= 0; i -= 1) {
    const pill = chain.pills[i];
    const endAt = arrival - suffixAfter * MINUTE_MS;
    const startAt = endAt - pill.dur * MINUTE_MS;
    items[i] = { pill, startAt, endAt };
    suffixAfter += pill.dur;
  }

  // suffixAfter is now the total span; the first pill begins that far before arrival.
  const start = arrival - suffixAfter * MINUTE_MS;
  return { start, items, arrival };
}

/**
 * The instant the chain "goes live" — the v2 generalization of v1's wake. It
 * anchors on the STRONG alarm and treats earlier pushes as best-effort:
 *   earliest 'alarm' end  →  else earliest 'push' end  →  else the arrival.
 *
 * Anchoring on the alarm (not the chronologically-earliest event) is deliberate
 * and mirrors v1, which rolled on the wake alarm while letting the earlier
 * bedtime nudge sit in the past. If rollover keyed off the earliest push, a
 * trivial already-passed push (e.g. a "melatonin" reminder) would roll the whole
 * day forward and defer the wake alarm by 24h — the opposite of what the user
 * wants. A push that has already elapsed at arm time is simply skipped (Phase 3
 * chainAlerts), exactly as v1 skipped a past fall-asleep nudge.
 */
export function primaryInstantFromComputed(computed: ChainComputed): number {
  // items are chronological, so the first match of a type is its earliest end.
  const firstAlarm = computed.items.find((it) => it.pill.type === 'alarm');
  if (firstAlarm) return firstAlarm.endAt;

  const firstPush = computed.items.find((it) => it.pill.type === 'push');
  if (firstPush) return firstPush.endAt;

  return computed.arrival;
}

/** Convenience wrapper: the primary instant for a chain, or null without a usable anchor. */
export function primaryEventInstant(chain: Chain): number | null {
  const computed = computeChain(chain);
  return computed ? primaryInstantFromComputed(computed) : null;
}

/**
 * The LATEST alarm-pill end instant (the last alarm to ring), or null if there's
 * no alarm pill / no arrival. Used to decide whether an armed chain is still
 * live: with several alarm pills it stays armed until the LAST one has passed,
 * not the first (primaryEventInstant).
 */
export function latestAlarmInstant(chain: Chain): number | null {
  const computed = computeChain(chain);
  if (!computed) return null;
  const alarmEnds = computed.items.filter((it) => it.pill.type === 'alarm').map((it) => it.endAt);
  return alarmEnds.length ? Math.max(...alarmEnds) : null;
}

/**
 * The alarm item the user should be watching: the FIRST alarm still in the
 * future — else the LAST alarm (a fully-elapsed chain, e.g. an armed snapshot
 * about to expire) — else null when the chain has no alarm pills. The armed
 * summary uses this instead of the earliest alarm, which may already have
 * passed and been skipped at arm time (v0.3 arrival-date spec).
 */
export function upcomingAlarmItem(computed: ChainComputed, nowMs: number): ComputedItem | null {
  const alarms = computed.items.filter((it) => it.pill.type === 'alarm');
  if (alarms.length === 0) return null;
  return alarms.find((it) => it.endAt > nowMs) ?? alarms[alarms.length - 1];
}
