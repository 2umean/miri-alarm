import { migrateDurationsToPillSpecs, materializePills, LegacyDurations } from '../chainMigration';
import { PillSpec } from '../pill';

const legacy: LegacyDurations = { contingency: 15, travel: 60, prep: 45, sleep: 480 };

test('v1 durations map to chronological specs preserving the alert semantics', () => {
  const specs = migrateDurationsToPillSpecs(legacy);
  expect(specs.map((s) => [s.nameKey, s.dur, s.type])).toEqual([
    ['pill.sleep', 480, 'alarm'], // sleep ended at the wake alarm
    ['pill.prep', 45, 'push'], // prep ended at the leave-home push
    ['pill.travel', 60, 'none'],
    ['pill.contingency', 15, 'none'],
  ]);
});

test('materializePills resolves names, mints ids, and preserves icon/dur/type', () => {
  const specs: PillSpec[] = [
    { icon: '😴', nameKey: 'pill.sleep', dur: 480, type: 'alarm' },
    { icon: '🚿', nameKey: 'pill.shower', dur: 20, type: 'none' },
  ];
  const pills = materializePills(
    specs,
    (key) => `name:${key}`,
    (i) => `id-${i}`,
  );
  expect(pills).toEqual([
    { id: 'id-0', icon: '😴', name: 'name:pill.sleep', dur: 480, type: 'alarm' },
    { id: 'id-1', icon: '🚿', name: 'name:pill.shower', dur: 20, type: 'none' },
  ]);
});

test('migrate → materialize round-trips into four concrete pills', () => {
  const pills = materializePills(
    migrateDurationsToPillSpecs(legacy),
    (key) => key,
    (i) => String(i),
  );
  expect(pills).toHaveLength(4);
  expect(pills.map((p) => p.type)).toEqual(['alarm', 'push', 'none', 'none']);
  expect(pills.map((p) => p.dur)).toEqual([480, 45, 60, 15]);
  expect(pills.map((p) => p.id)).toEqual(['0', '1', '2', '3']);
});
