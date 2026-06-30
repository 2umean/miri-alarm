import { Chain, Pill, SEED_PILLS } from '../domain/pill';
import { LegacyDurations, materializePills, migrateDurationsToPillSpecs } from '../domain/chainMigration';
import { rollChainToFuture } from '../domain/chainRollover';

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
 * and roll it to its next future occurrence, so a relaunch never lands on an
 * un-armable past schedule and the displayed zone always matches the format zone.
 */
export function reconcileAndRoll(chain: Chain, deviceZone: string, nowMs: number): Chain {
  const reconciled = chain.zone === deviceZone ? chain : { ...chain, zone: deviceZone };
  return rollChainToFuture(reconciled, nowMs);
}
