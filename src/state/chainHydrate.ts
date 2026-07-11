import { Chain, Pill, SEED_PILLS } from '../domain/pill';
import { LegacyDurations, materializePills, migrateDurationsToPillSpecs } from '../domain/chainMigration';
import { rollChainToFuture } from '../domain/chainRollover';
import { resolveArrivalInstant } from '../domain/datetime';

/**
 * Pure hydration helpers for useChain — the i18n/id-coupled orchestration the
 * domain layer deliberately left out (pill.ts comment). Kept pure (name resolver
 * + id factory injected) so they're unit-testable while the hook wires in `t`
 * and a real id generator.
 */

export type ResolveName = (nameKey: string) => string;
export type MakeId = (index: number) => string;

/** Default pills for a fresh chain — seeded when an arrival is first set on an empty chain. */
export function seedPills(resolveName: ResolveName, makeId: MakeId): Pill[] {
  return materializePills(SEED_PILLS, resolveName, makeId);
}

/** Wall-clock default anchor for a chain that has never had an arrival set. */
export const DEFAULT_ARRIVAL_HOUR = 9;
export const DEFAULT_ARRIVAL_MINUTE = 0;

/**
 * Guarantee the chain has an arrival anchor: a chain without one gets the next
 * 09:00 in the device zone plus the seed pills — exactly what picking 9:00 AM in
 * the arrival sheet would produce — so the app never shows a "set your arrival
 * first" empty state. An anchored chain passes through untouched (referential
 * identity, so callers can memoize).
 */
export function withDefaultArrival(
  chain: Chain,
  deviceZone: string,
  nowMs: number,
  resolveName: ResolveName,
  makeId: MakeId,
): Chain {
  if (chain.arrival != null) return chain;
  return {
    arrival: resolveArrivalInstant(DEFAULT_ARRIVAL_HOUR, DEFAULT_ARRIVAL_MINUTE, deviceZone, nowMs),
    zone: deviceZone,
    pills: chain.pills.length > 0 ? chain.pills : seedPills(resolveName, makeId),
  };
}

/** Build a v2 chain from a legacy v1 draft's durations (one-time migration). */
export function migratedChain(
  legacy: LegacyDurations & { arrival: number | null },
  deviceZone: string,
  resolveName: ResolveName,
  makeId: MakeId,
): Chain {
  return {
    arrival: legacy.arrival,
    zone: deviceZone,
    pills: materializePills(migrateDurationsToPillSpecs(legacy), resolveName, makeId),
  };
}

/**
 * Reconcile a restored chain to the current device zone (the app is single-zone)
 * and roll it forward if its ARRIVAL has passed, so a relaunch never lands on a
 * chain anchored in the past. Alerts that already fired are skipped at arm time
 * (D4), not rolled away.
 */
export function reconcileAndRoll(chain: Chain, deviceZone: string, nowMs: number): Chain {
  const reconciled = chain.zone === deviceZone ? chain : { ...chain, zone: deviceZone };
  return rollChainToFuture(reconciled, nowMs);
}
