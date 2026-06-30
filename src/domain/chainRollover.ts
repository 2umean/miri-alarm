import { DateTime } from 'luxon';

import { MINUTE_MS } from './schedule';
import { Chain } from './pill';
import { primaryEventInstant } from './chainEngine';

const DAY_MS = 24 * 60 * MINUTE_MS;
/** Cap on the DST fine-tune loop — the bulk jump lands within ~1 day of `now`. */
const MAX_FINE_TUNE_STEPS = 5;

/**
 * Advance the chain's arrival forward to its next future occurrence — in whole
 * calendar days within the captured zone, so the wall-clock arrival time is
 * preserved and each step is DST-safe — until the PRIMARY event instant (the
 * earliest alarm, else earliest push, else the arrival; see chainEngine) is
 * strictly after `nowMs`.
 *
 * This is the v2 twin of v1's rollScheduleToFuture: a chain whose alarm has
 * already rung rolls to the next day instead of becoming un-armable via a
 * past-event block. The bulk jump is computed directly (not a 1-day loop), so
 * even an ancient stored arrival lands in the future in a single call. Returns
 * the input unchanged (referential identity, so callers can memoize) when the
 * primary instant is already in the future or no arrival is set.
 */
export function rollChainToFuture(chain: Chain, nowMs: number): Chain {
  if (chain.arrival == null) return chain;
  const primary = primaryEventInstant(chain);
  if (primary == null || primary > nowMs) return chain;

  // Jump most of the gap at once (ceil → the minimal whole-day advance), then
  // fine-tune for any DST unevenness or an exact boundary tie.
  const approxDays = Math.ceil((nowMs - primary) / DAY_MS); // >= 1
  let arrival = DateTime.fromMillis(chain.arrival, { zone: chain.zone })
    .plus({ days: approxDays })
    .toMillis();
  // Defensive: an invalid zone would make luxon return NaN here. Zones are
  // validated at the storage boundary (draftChain), so this shouldn't trigger —
  // but never propagate a NaN anchor into the derived alarm times.
  if (!Number.isFinite(arrival)) return chain;

  for (
    let i = 0;
    (primaryEventInstant({ ...chain, arrival }) ?? Infinity) <= nowMs && i < MAX_FINE_TUNE_STEPS;
    i += 1
  ) {
    arrival = DateTime.fromMillis(arrival, { zone: chain.zone }).plus({ days: 1 }).toMillis();
  }
  return { ...chain, arrival };
}
