import { migrateDurationsToPillSpecs, materializePills, LegacyDurations } from '../chainMigration';
import { PillSpec } from '../pill';

const legacy: LegacyDurations = { contingency: 15, travel: 60, prep: 45, sleep: 480 };

test('v1 durations map to PRE-SPLIT specs preserving the alert instants', () => {
  const specs = migrateDurationsToPillSpecs(legacy);
  expect(specs).toEqual([
    { type: 'none', icon: '😴', nameKey: 'pill.sleep', dur: 480 },
    { type: 'alarm' }, // sleep ended at the wake alarm → now a marker at the same instant
    { type: 'none', icon: '🚿', nameKey: 'pill.prep', dur: 45 },
    { type: 'push' }, // prep ended at the leave-home push
    { type: 'none', icon: '🚕', nameKey: 'pill.travel', dur: 60 },
    { type: 'none', icon: '🛟', nameKey: 'pill.contingency', dur: 15 },
  ]);
});

test('materializePills branches on spec type: events get names+fields, markers only ids', () => {
  const specs: PillSpec[] = [
    { type: 'none', icon: '😴', nameKey: 'pill.sleep', dur: 480 },
    { type: 'alarm' },
    { type: 'push' },
  ];
  const pills = materializePills(specs, (key) => `name:${key}`, (i) => `id-${i}`);
  expect(pills).toEqual([
    { id: 'id-0', type: 'none', icon: '😴', name: 'name:pill.sleep', dur: 480 },
    { id: 'id-1', type: 'alarm' },
    { id: 'id-2', type: 'push' },
  ]);
});

test('migrate → materialize round-trips into six pills with the alert order intact', () => {
  const pills = materializePills(migrateDurationsToPillSpecs(legacy), (k) => k, (i) => String(i));
  expect(pills.map((p) => p.type)).toEqual(['none', 'alarm', 'none', 'push', 'none', 'none']);
});
