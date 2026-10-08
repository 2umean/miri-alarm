import { MINUTE_MS } from './schedule';
import { Chain, isMarkerPill, Pill, pillDur } from './pill';

/**
 * Reverse-calc for the v3 pill chain. Same DST-safe philosophy as v1's engine:
 * every time is the arrival anchor minus an ELAPSED-ms offset, so gaps are
 * DST-correct by construction (no wall-clock arithmetic across offsets here).
 */

export type ComputedItem = {
  pill: Pill;
  startAt: number; // epoch ms when this pill begins
  endAt: number; // epoch ms when this pill ends (= next pill's start; last pill's end = arrival)
};

export type ChainComputed = {
  start: number; // epoch ms when the first item begins (the chain-start row); == arrival when there are no pills
  items: ComputedItem[];
  arrival: number;
};

/** Total span (sum of all pill durations), in minutes. */
export function totalSpanMinutes(chain: Chain): number {
  return chain.pills.reduce((sum, p) => sum + pillDur(p), 0);
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
    const startAt = endAt - pillDur(pill) * MINUTE_MS;
    items[i] = { pill, startAt, endAt };
    suffixAfter += pillDur(pill);
  }

  // suffixAfter is now the total span; the first pill begins that far before arrival.
  const start = arrival - suffixAfter * MINUTE_MS;
  return { start, items, arrival };
}

// Alarm selectors. Input-shape convention: the `latest*Instant` pair takes a raw
// Chain (it computes internally); the rest take an already-built ChainComputed,
// so a caller that already has one never triggers a second computeChain pass.

/**
 * The LATEST alarm end instant in an already-computed chain, or null with no
 * alarm pills. The arm gate (chainValidation) uses it to tell "every alarm
 * passed" apart from "every alert passed" (latestAlertFromComputed).
 */
export function latestAlarmFromComputed(computed: ChainComputed): number | null {
  const alarmEnds = computed.items.filter((it) => it.pill.type === 'alarm').map((it) => it.endAt);
  return alarmEnds.length ? Math.max(...alarmEnds) : null;
}

/**
 * The LATEST alarm-pill end instant (the last alarm to ring), or null if there's
 * no alarm pill / no arrival.
 */
export function latestAlarmInstant(chain: Chain): number | null {
  const computed = computeChain(chain);
  return computed ? latestAlarmFromComputed(computed) : null;
}

/**
 * The LATEST marker instant — ⏰ alarm OR 🔔 push — in an already-computed
 * chain, or null with no markers. Once every alarm has passed, a push still
 * ahead keeps the chain armable (chainValidation) and live (below).
 */
export function latestAlertFromComputed(computed: ChainComputed): number | null {
  const alertEnds = computed.items.filter((it) => isMarkerPill(it.pill)).map((it) => it.endAt);
  return alertEnds.length ? Math.max(...alertEnds) : null;
}

/**
 * The LATEST marker instant of a raw chain, or null with no markers / no
 * arrival. Decides whether an armed chain is still live: it stays armed until
 * the LAST alert has gone off — a backup alarm, or a push after the last alarm.
 */
export function latestAlertInstant(chain: Chain): number | null {
  const computed = computeChain(chain);
  return computed ? latestAlertFromComputed(computed) : null;
}

/**
 * The item the armed summary should name: the FIRST alarm still in the future
 * — else the first PUSH still in the future (every alarm passed; the remaining
 * pushes are what's armed) — else the LAST alarm (a fully-elapsed chain, e.g.
 * an armed snapshot about to expire) — else null when the chain has no alarm
 * pills. Passed items were skipped at arm time (v0.3 arrival-date spec), so
 * advertising their dead time would mislead.
 */
export function upcomingAlarmItem(computed: ChainComputed, nowMs: number): ComputedItem | null {
  const alarms = computed.items.filter((it) => it.pill.type === 'alarm');
  if (alarms.length === 0) return null;
  const isAhead = (it: ComputedItem) => it.endAt > nowMs;
  return (
    alarms.find(isAhead) ??
    computed.items.find((it) => it.pill.type === 'push' && isAhead(it)) ??
    alarms[alarms.length - 1]
  );
}
