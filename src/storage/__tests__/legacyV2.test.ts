import { computeChain, latestAlarmInstant } from '../../domain';
import { convertV2Pills, migrateV2ChainPayload, migrateV1PresetsPayload } from '../legacyV2';

// The exact v0.3.0 seed chain as it sits in a real user's schedularm.draft.v2 / armed.v2.
const V2_SEED_PILLS = [
  { id: 'p1', icon: '😴', name: '수면', dur: 420, type: 'alarm' },
  { id: 'p2', icon: '🚿', name: '샤워', dur: 20, type: 'none' },
  { id: 'p3', icon: '🍳', name: '아침', dur: 20, type: 'none' },
  { id: 'p4', icon: '🚇', name: '지하철', dur: 35, type: 'none' },
];
const ARRIVAL = 1_900_000_000_000; // fixed, far future (all offsets are exact-ms subtraction)
const MIN = 60_000;

test('the converter: none passes through; push/alarm split into event + `${id}~m` marker', () => {
  expect(convertV2Pills(V2_SEED_PILLS)).toEqual([
    { id: 'p1', type: 'none', icon: '😴', name: '수면', dur: 420 },
    { id: 'p1~m', type: 'alarm' },
    { id: 'p2', type: 'none', icon: '🚿', name: '샤워', dur: 20 },
    { id: 'p3', type: 'none', icon: '🍳', name: '아침', dur: 20 },
    { id: 'p4', type: 'none', icon: '🚇', name: '지하철', dur: 35 },
  ]);
});

test('SAFETY-CRITICAL: every ring time is byte-identical after conversion', () => {
  // v2 semantics: an alert fired when ITS OWN pill ended. Compute those instants
  // by hand from the raw v2 durations (suffix-sum from the arrival), then assert
  // the migrated chain's markers land on exactly the same epoch ms.
  const v2SleepEnd = ARRIVAL - (20 + 20 + 35) * MIN; // pills after sleep

  const migrated = migrateV2ChainPayload(
    JSON.stringify({ arrival: ARRIVAL, zone: 'Asia/Seoul', pills: V2_SEED_PILLS }),
  )!;
  const computed = computeChain(migrated)!;
  const alarmItem = computed.items.find((it) => it.pill.type === 'alarm')!;
  expect(alarmItem.endAt).toBe(v2SleepEnd);
  expect(latestAlarmInstant(migrated)).toBe(v2SleepEnd);
});

test('a v2 pill with BOTH kinds present in the chain preserves each alert instant', () => {
  const pills = [
    { id: 'a', icon: '😴', name: 's', dur: 480, type: 'alarm' },
    { id: 'b', icon: '🚿', name: 'p', dur: 45, type: 'push' },
    { id: 'c', icon: '🚕', name: 't', dur: 60, type: 'none' },
  ];
  const v2AlarmEnd = ARRIVAL - (45 + 60) * MIN;
  const v2PushEnd = ARRIVAL - 60 * MIN;
  const migrated = migrateV2ChainPayload(JSON.stringify({ arrival: ARRIVAL, zone: 'UTC', pills }))!;
  const computed = computeChain(migrated)!;
  const byId = Object.fromEntries(computed.items.map((it) => [it.pill.id, it.endAt]));
  expect(byId['a~m']).toBe(v2AlarmEnd);
  expect(byId['b~m']).toBe(v2PushEnd);
});

test('junk v2 entries are dropped/coerced with the frozen v2 rules', () => {
  expect(convertV2Pills([null, 'oops', { icon: '🍳', name: 'a', dur: 20, type: 'none' }])).toEqual([
    { id: 'pill-2', type: 'none', icon: '🍳', name: 'a', dur: 20 },
  ]);
  expect(convertV2Pills([{ id: 'x', icon: '', name: '', dur: 'nope', type: 'bogus' }])).toEqual([
    { id: 'x', type: 'none', icon: '', name: '', dur: 0 },
  ]);
  expect(convertV2Pills('not-an-array')).toEqual([]);
});

test('migrateV2ChainPayload: corrupt/primitive payloads → null; arrival+zone sanitised', () => {
  expect(migrateV2ChainPayload(null)).toBeNull();
  expect(migrateV2ChainPayload('{nope')).toBeNull();
  expect(migrateV2ChainPayload('5')).toBeNull();
  const out = migrateV2ChainPayload(JSON.stringify({ arrival: 0, zone: 'Garbage/Zone', pills: [] }))!;
  expect(out).toEqual({ arrival: null, zone: 'UTC', pills: [] });
});

test('migrateV1PresetsPayload converts every preset pill list and keeps activeId', () => {
  const raw = JSON.stringify({
    presets: [
      { id: 'a', name: '평일 아침', pills: V2_SEED_PILLS },
      { id: 'b', name: '주말', pills: [] },
    ],
    activeId: 'a',
  });
  const out = migrateV1PresetsPayload(raw)!;
  expect(out.activeId).toBe('a');
  expect(out.presets[0].pills.map((p) => p.id)).toEqual(['p1', 'p1~m', 'p2', 'p3', 'p4']);
  expect(out.presets[1].pills).toEqual([]);
});

test('migrateV1PresetsPayload drops unnamed presets and nulls a ghost activeId (v1 rules)', () => {
  const raw = JSON.stringify({ presets: [{ id: 'x', pills: [] }], activeId: 'x' });
  expect(migrateV1PresetsPayload(raw)).toEqual({ presets: [], activeId: null });
});

test('a missing/empty id on an ALERT-typed v2 pill gets the fallback id AND the ~m suffix', () => {
  expect(convertV2Pills([{ icon: '⏰', name: 'x', dur: 30, type: 'alarm' }])).toEqual([
    { id: 'pill-0', type: 'none', icon: '⏰', name: 'x', dur: 30 },
    { id: 'pill-0~m', type: 'alarm' },
  ]);
});

test('migrateV1PresetsPayload: corrupt/primitive payloads → null (parity with the chain path)', () => {
  expect(migrateV1PresetsPayload(null)).toBeNull();
  expect(migrateV1PresetsPayload('{nope')).toBeNull();
  expect(migrateV1PresetsPayload('5')).toBeNull();
  expect(migrateV1PresetsPayload('[]')).toBeNull();
});

test('migrateV1PresetsPayload: duplicate preset ids keep the FIRST entry (v1 rule)', () => {
  const raw = JSON.stringify({
    presets: [
      { id: 'a', name: 'first', pills: [] },
      { id: 'a', name: 'second', pills: [] },
    ],
    activeId: 'a',
  });
  const out = migrateV1PresetsPayload(raw)!;
  expect(out.presets).toHaveLength(1);
  expect(out.presets[0].name).toBe('first');
  expect(out.activeId).toBe('a');
});
