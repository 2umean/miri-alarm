import { Chain, MAX_PILL_MINUTES } from './pill';
import { computeChain, totalSpanMinutes } from './chainEngine';

/** Max total chain span (sum of all pill durations), in minutes. ~26h — covers a long sleep + commute + buffers.
 *  Module-local (not exported) to avoid a barrel name-clash with v1 validation.ts during the migration. */
const MAX_CHAIN_SPAN = 26 * 60;

/**
 * Validation for the v2 chain, mirroring v1's split: some issues block arming
 * (the safety gate), others are non-blocking nudges. The UI gates the arm button
 * on isChainArmable().
 */
export type ChainValidationIssue =
  | { kind: 'no-arrival' } // no usable anchor (null or non-finite) — cannot compute or arm anything
  | { kind: 'pill-out-of-range'; id: string } // a pill duration outside [0, MAX_PILL_MINUTES]
  | { kind: 'infeasible' } // a negative pill duration (shouldn't occur via the reducer; defensive)
  | { kind: 'chain-too-long' } // total span exceeds MAX_CHAIN_SPAN
  | { kind: 'no-alarm' } // no alarm pill — a safety alarm needs ≥1 OS-guaranteed ring, not just pushes
  | { kind: 'past-event' } // every alarm instant has passed — nothing left that can ring
  | { kind: 'bedtime-passed' }; // the first pill already began (non-blocking nudge; v1's sleep-debt analog)

export function validateChain(chain: Chain, nowMs: number): ChainValidationIssue[] {
  const issues: ChainValidationIssue[] = [];

  // One pass over the pills: flag each out-of-range duration, and a single
  // infeasible marker if any duration is negative.
  let infeasible = false;
  for (const pill of chain.pills) {
    if (pill.dur < 0) infeasible = true;
    if (pill.dur < 0 || pill.dur > MAX_PILL_MINUTES) {
      issues.push({ kind: 'pill-out-of-range', id: pill.id });
    }
  }
  if (infeasible) issues.push({ kind: 'infeasible' });

  if (totalSpanMinutes(chain) > MAX_CHAIN_SPAN) {
    issues.push({ kind: 'chain-too-long' });
  }

  // A safety alarm must have at least one OS-guaranteed ring; push-only chains
  // would show "armed" while relying on suppressible best-effort notifications.
  if (!chain.pills.some((p) => p.type === 'alarm')) issues.push({ kind: 'no-alarm' });

  // Compute the chain once; reuse it for the anchor check and both time gates.
  const computed = computeChain(chain);
  if (!computed) {
    issues.push({ kind: 'no-arrival' });
  } else {
    // Arming needs at least one OS-guaranteed ring still ahead: past-event
    // fires only when the chain HAS alarm pills and the LAST one has passed
    // (v0.3 arrival-date spec D5 — earlier alarms may pass and are skipped at
    // arm time). Alarm-less chains are already blocked by no-alarm; stacking
    // past-event on top would add noise, not information.
    let lastAlarm: number | null = null;
    for (const it of computed.items) {
      if (it.pill.type === 'alarm' && (lastAlarm == null || it.endAt > lastAlarm)) {
        lastAlarm = it.endAt;
      }
    }
    if (lastAlarm != null && lastAlarm <= nowMs) {
      issues.push({ kind: 'past-event' });
    } else if (computed.start <= nowMs) {
      issues.push({ kind: 'bedtime-passed' });
    }
  }

  return issues;
}

/** The safety gate: which issue kinds block arming. bedtime-passed is a nudge, not a blocker. */
const BLOCKING: ReadonlyArray<ChainValidationIssue['kind']> = [
  'no-arrival',
  'pill-out-of-range',
  'infeasible',
  'chain-too-long',
  'no-alarm',
  'past-event',
];

/** True when the chain is safe to arm (no blocking issues). The UI must gate the arm button on this. */
export function isChainArmable(issues: ChainValidationIssue[]): boolean {
  return !issues.some((i) => BLOCKING.includes(i.kind));
}
