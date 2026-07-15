import {
  DEFAULT_PILL_DRAFT,
  EventPill,
  MarkerPill,
  Pill,
  SEED_PILLS,
  draftFromPill,
  isEventPill,
  isMarkerPill,
  pillDur,
  pillFromDraft,
} from '../pill';

const event: EventPill = { id: 'e1', type: 'none', icon: '😴', name: '수면', dur: 420 };
const alarmMarker: MarkerPill = { id: 'm1', type: 'alarm' };
const pushMarker: MarkerPill = { id: 'm2', type: 'push' };

test('type guards partition the union', () => {
  expect(isEventPill(event)).toBe(true);
  expect(isMarkerPill(event)).toBe(false);
  expect(isEventPill(alarmMarker)).toBe(false);
  expect(isMarkerPill(alarmMarker)).toBe(true);
  expect(isMarkerPill(pushMarker)).toBe(true);
});

test('pillDur: events carry their duration, markers occupy zero minutes', () => {
  expect(pillDur(event)).toBe(420);
  expect(pillDur(alarmMarker)).toBe(0);
  expect(pillDur(pushMarker)).toBe(0);
});

test('SEED_PILLS ships pre-split: 수면 is a plain event followed by a bare ⏰ marker', () => {
  expect(SEED_PILLS.map((s) => s.type)).toEqual(['none', 'alarm', 'none', 'none', 'none']);
  const sleep = SEED_PILLS[0];
  expect(sleep.type === 'none' && sleep.nameKey).toBe('pill.sleep');
  expect(sleep.type === 'none' && sleep.dur).toBe(420);
});

describe('pillFromDraft (the save-side of the editor conversion)', () => {
  test("type 'none' persists a full EventPill", () => {
    const p = pillFromDraft('id1', { icon: '🚿', name: '샤워', dur: 20, type: 'none' });
    expect(p).toEqual({ id: 'id1', type: 'none', icon: '🚿', name: '샤워', dur: 20 });
  });

  test('a marker type DROPS icon/name/dur — the lossy commit happens here, nowhere else', () => {
    const p = pillFromDraft('id2', { icon: '🚿', name: '샤워', dur: 20, type: 'alarm' });
    expect(p).toEqual({ id: 'id2', type: 'alarm' });
    expect('name' in p).toBe(false);
    expect('dur' in p).toBe(false);
  });
});

describe('draftFromPill (the open-side)', () => {
  test('an event mirrors its own fields', () => {
    expect(draftFromPill(event)).toEqual({ icon: '😴', name: '수면', dur: 420, type: 'none' });
  });

  test("an existing marker seeds a BLANK draft (🧥, '', 0:15) with its type — never a resurrection", () => {
    expect(draftFromPill(alarmMarker)).toEqual({ icon: '🧥', name: '', dur: 15, type: 'alarm' });
    expect(draftFromPill(pushMarker)).toEqual({ icon: '🧥', name: '', dur: 15, type: 'push' });
  });
});

test('toggle round-trip within one sheet session is free: draft survives, only the save discards', () => {
  const draft = { icon: '😴', name: '수면', dur: 420, type: 'none' as const };
  // The sheet holds ONE draft object and only flips `type` — simulate the flips:
  const flippedToAlarm = { ...draft, type: 'alarm' as const };
  const flippedBack = { ...flippedToAlarm, type: 'none' as const };
  expect(pillFromDraft('x', flippedBack)).toEqual({ id: 'x', type: 'none', icon: '😴', name: '수면', dur: 420 });
});

test('DEFAULT_PILL_DRAFT is the blank event draft', () => {
  expect(DEFAULT_PILL_DRAFT).toEqual({ icon: '🧥', name: '', dur: 15, type: 'none' });
});

// Compile-time checks (fail tsc within this test file if the union regresses):
const _narrow = (p: Pill): number => (isEventPill(p) ? p.dur : 0);
void _narrow;
