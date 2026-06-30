import { Pill, PillSpec } from './pill';

/** The v1 fixed durations — the only part of a legacy draft that v2 needs. */
export type LegacyDurations = {
  contingency: number;
  travel: number;
  prep: number;
  sleep: number;
};

/**
 * v1 fixed chain → v2 pill specs, chronological. Preserves v1's alert semantics:
 * sleep ends at the wake ALARM and prep ends at the leave-home PUSH; travel and
 * contingency were timing-only. Names come through as i18n keys (resolved later
 * by materializePills), keeping this language-free like the rest of domain/.
 */
export function migrateDurationsToPillSpecs(d: LegacyDurations): PillSpec[] {
  return [
    { icon: '😴', nameKey: 'pill.sleep', dur: d.sleep, type: 'alarm' },
    { icon: '🚿', nameKey: 'pill.prep', dur: d.prep, type: 'push' },
    { icon: '🚕', nameKey: 'pill.travel', dur: d.travel, type: 'none' },
    { icon: '🛟', nameKey: 'pill.contingency', dur: d.contingency, type: 'none' },
  ];
}

/**
 * Turn language-free specs into concrete Pills, resolving display names and
 * minting stable ids. Pure given its two injected functions: Phase 2 passes `t`
 * and a uuid factory; tests pass deterministic stubs.
 */
export function materializePills(
  specs: readonly PillSpec[],
  resolveName: (nameKey: string) => string,
  makeId: (index: number) => string,
): Pill[] {
  return specs.map((spec, index) => ({
    id: makeId(index),
    icon: spec.icon,
    name: resolveName(spec.nameKey),
    dur: spec.dur,
    type: spec.type,
  }));
}
