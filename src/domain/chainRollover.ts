import { DateTime } from 'luxon';

import { MINUTE_MS } from './schedule';
import { Chain } from './pill';

const DAY_MS = 24 * 60 * MINUTE_MS;
/** Cap on the DST fine-tune loop — the bulk jump lands within ~1 day of `now`. */
const MAX_FINE_TUNE_STEPS = 5;

/**
 * Advance the chain's arrival forward to its next future occurrence — in whole
 * calendar days within the captured zone, so the wall-clock arrival time is
 * preserved and each step is DST-safe — until the ARRIVAL instant is strictly
 * after `nowMs`.
 *
 * v0.3 (arrival-date spec D4): the roll keys on the arrival anchor itself, NOT
 * on any alarm instant. A chain whose alarms have already passed but whose
 * arrival is still ahead stays on today — past alerts are skippable at arm
 * time (alarmPlan/chainPushAlerts filter them), and the remaining future ones
 * must stay armable. Only once the arrival itself has passed does the day
 * flip. Returns the input unchanged (referential identity, so callers can
 * memoize) while the arrival is future or absent.
 */
export function rollChainToFuture(chain: Chain, nowMs: number): Chain {
  // Non-finite guard: a NaN anchor must never be "advanced" into more NaN.
  if (chain.arrival == null || !Number.isFinite(chain.arrival)) return chain;
  if (chain.arrival > nowMs) return chain;

  // Jump most of the gap at once (ceil → the minimal whole-day advance), then
  // fine-tune for DST unevenness (a 23h day can under-shoot) or an exact tie.
  const approxDays = Math.ceil((nowMs - chain.arrival) / DAY_MS);
  let arrival = DateTime.fromMillis(chain.arrival, { zone: chain.zone })
    .plus({ days: approxDays })
    .toMillis();
  // Defensive: an invalid zone would make luxon return NaN here. Zones are
  // validated at the storage boundary (draftChain), so this shouldn't trigger —
  // but never propagate a NaN anchor into the derived alarm times.
  if (!Number.isFinite(arrival)) return chain;

  for (let i = 0; arrival <= nowMs && i < MAX_FINE_TUNE_STEPS; i += 1) {
    arrival = DateTime.fromMillis(arrival, { zone: chain.zone }).plus({ days: 1 }).toMillis();
  }
  return { ...chain, arrival };
}
