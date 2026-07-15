import { Pill, PillSpec } from './pill';

/** The v1 fixed durations — the only part of a legacy draft that v2/v3 needs. */
export type LegacyDurations = {
  contingency: number;
  travel: number;
  prep: number;
  sleep: number;
};

/**
 * v1 fixed chain → v3 pill specs, chronological and PRE-SPLIT. v1's alert
 * semantics survive as markers at the same instants: sleep ended at the wake
 * ALARM and prep at the leave-home PUSH — each marker sits at zero duration
 * right after its event, so every ring time is preserved exactly.
 */
export function migrateDurationsToPillSpecs(d: LegacyDurations): PillSpec[] {
  return [
    { type: 'none', icon: '😴', nameKey: 'pill.sleep', dur: d.sleep },
    { type: 'alarm' },
    { type: 'none', icon: '🚿', nameKey: 'pill.prep', dur: d.prep },
    { type: 'push' },
    { type: 'none', icon: '🚕', nameKey: 'pill.travel', dur: d.travel },
    { type: 'none', icon: '🛟', nameKey: 'pill.contingency', dur: d.contingency },
  ];
}

/**
 * Turn language-free specs into concrete Pills, resolving event names and
 * minting stable ids. Pure given its two injected functions (tests pass stubs).
 */
export function materializePills(
  specs: readonly PillSpec[],
  resolveName: (nameKey: string) => string,
  makeId: (index: number) => string,
): Pill[] {
  return specs.map((spec, index) =>
    spec.type === 'none'
      ? { id: makeId(index), type: 'none', icon: spec.icon, name: resolveName(spec.nameKey), dur: spec.dur }
      : { id: makeId(index), type: spec.type },
  );
}
