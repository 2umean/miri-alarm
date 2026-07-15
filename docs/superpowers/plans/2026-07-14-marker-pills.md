# Marker Pills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split alert/alarm out of events into standalone zero-duration marker pills, rewrite the arrival picker as a unified date-row + time-wheel sheet, replace the 취침 cap with a start row, and drop the NEW badge — per the approved spec `docs/superpowers/specs/2026-07-14-marker-pills-design.md`.

**Architecture:** `Pill` becomes a union (`EventPill | MarkerPill`); the single engine seam is `pillDur()` (a marker occupies zero minutes, so `startAt === endAt` = its fire instant). Marker labels are derived from position (`labelSourceFor`), preserving the `NativeAlarm { id, at, label, leaveAt }` contract — **zero Kotlin/Swift changes**. Storage keys bump (draft/armed v2→v3, presets v1→v2) with a ring-time-preserving converter; the armed chain stays armed across the upgrade.

**Tech Stack:** TypeScript strict, React Native 0.85 / Expo SDK 56, luxon, i18n-js, jest (ts-jest, node env — domain/state/storage/alarm only; UI is verified by `tsc` + device QA), `@react-native-community/datetimepicker` 9.1.0, AsyncStorage 2.2.0.

**Per AGENTS.md:** read https://docs.expo.dev/versions/v56.0.0/ before writing code. Already verified against the versioned docs for this plan: expo-notifications SDK 56 `scheduleNotificationAsync` + `SchedulableTriggerInputTypes.DATE` is unchanged (current usage in `chainPushAlerts.ts:52-56` stays valid); datetimepicker 9.1.0 README recommends the imperative `DateTimePickerAndroid.open()` on Android over conditional component rendering; RN 0.85 `ScrollView` supports `snapToInterval`/`decelerationRate="fast"`/`onMomentumScrollEnd` on both platforms.

---

## Spec gaps resolved by this plan

These came out of grounding the spec against the code. Each follows the spec's own principles; none contradicts a spec decision. Flagged here so the reviewer sees them before any code:

1. **`leaveAt` must skip trailing markers.** `planNativeAlarms` (src/alarm/alarmPlan.ts:13-14) sets `leaveAt` = start of the FINAL item. A chain ending `[…, commute(event), ⏰marker]` would put `leaveAt` on the zero-width marker's start = the arrival instant, breaking the ring screen's 출발까지 chip. Rule: `leaveAt` = start of the last **event** pill (markers skipped), falling back to `computed.arrival`. This also keeps `leaveAt` byte-identical across migration (a split v2 pill's event keeps the old `startAt`).
2. **The v1 legacy draft path must also split.** `migrateDurationsToPillSpecs` (src/domain/chainMigration.ts:17-24) still emits old-style specs (`sleep/alarm`, `prep/push`). With `PillSpec` a union, it now emits 6 specs — `sleep` + ⏰ marker, `prep` + 🔔 marker, `travel`, `contingency`. Ring times are preserved by the same zero-duration argument as the v2→v3 converter.
3. **The launch re-arm needs a `startLabel` too.** `useArmingChain`'s boot effect re-arms the snapshot (src/hooks/useArmingChain.ts:40) but has no preset context. It reads `loadPresets()` once to build the label, so an orphan marker's native label survives relaunch instead of degrading to the fallback.
4. **Default create-draft kind = 이벤트.** `DEFAULT_NEW_PILL` is `type: 'push'` today (ChainScreen.tsx:27), which meant "event that pushes when it ends". Post-split, `push` would create a *bare marker* — not the faithful translation. The default draft becomes `type: 'none'` (matching the control's first segment, 이벤트).
5. **`tsc` is red from Phase 1 until Phase 4 completes.** Changing the `Pill` union immediately breaks the UI files. Jest stays green after every task (ts-jest compiles per test file; no test imports UI). `npx tsc --noEmit` is gated at the end of Phase 4 and again at the end.
6. **Android date dialog goes imperative.** The rewrite uses `DateTimePickerAndroid.open()` (one-shot, fired on row tap) instead of conditionally mounting `<DateTimePicker>`. This *removes* the 60s-re-render re-seed hazard the old component needed ref-stabilized handlers for (ArrivalPickerSheet.tsx:68-75) — the README explicitly recommends this. The iOS inline picker keeps the ref-stable-handler idiom.
7. **The event→marker connector line is dropped.** Markers are independent rows now; the old per-pill connector (ChainList.tsx:82) goes away. The design's Chain component shows markers as free-standing bordered rows.
8. **Armed-chip / re-arm labels use the *current* active preset name.** The armed snapshot stores no preset name (Chain shape is unchanged by spec). If the user renames/switches presets after arming, an orphan-marker label drifts cosmetically. Ring **times** are never affected. Accepted.

---

## File structure

**New files**
| File | Responsibility |
|---|---|
| `src/domain/markerLabel.ts` | `labelSourceFor` — nearest preceding EventPill (pure, i18n-free) |
| `src/domain/__tests__/pill.test.ts` | union guards, `pillDur`, draft↔pill conversions |
| `src/domain/__tests__/markerLabel.test.ts` | label-source scan behaviours |
| `src/storage/legacyV2.ts` | FROZEN v2 payload reader + v2→v3 pill splitter (draft/armed/presets) |
| `src/storage/__tests__/legacyV2.test.ts` | converter unit tests + time-preserving property |
| `src/ui/components/WheelPicker.tsx` | one scroll-snapping, tappable, typeable column |

**Modified files** (in phase order)
`src/domain/pill.ts` · `chainEngine.ts` · `chainValidation.ts` · `preset.ts` · `chainMigration.ts` · `datetime.ts` · `domain/index.ts` — `src/state/chainReducer.ts` — `src/storage/chainSanitize.ts` · `draftChain.ts` · `armedChain.ts` · `presets.ts` — `src/alarm/alarmPlan.ts` · `chainPushAlerts.ts` · `AlarmService.ts` — `src/hooks/useChain.ts` · `useArmingChain.ts` — `src/i18n/en.ts` · `ko.ts` — `src/ui/format.ts` · `theme.ts` · `components/PillEditorSheet.tsx` · `ChainList.tsx` · `ReorderView.tsx` · `ArrivalPickerSheet.tsx` · `screens/ChainScreen.tsx`

**Unchanged:** everything under `modules/schedularm-alarm/` (native contract preserved — if any task finds this impossible, **stop and flag it**; do not edit native code), `chainRollover.ts` (pill-agnostic), `alarmHealth.ts`, `onboarding.ts`, `OnboardingScreen.tsx`, `PresetListSheet.tsx`/`PresetNameSheet.tsx` (consume `presetSummary` output shape, which is unchanged).

**Phases**
1. Domain: Pill union + `pillDur` seam (engine changes by substitution)
2. Storage: sanitizer union-awareness, key bumps v3/v2, ring-time-preserving migration
3. Alarm pipeline + hooks: derived labels, `startLabel` threading, draft-based chain API
4. Editor + chain UI (tsc returns green here)
5. Arrival picker: `instantToYMD`, `WheelPicker`, unified sheet
6. Final verification + device QA checklist

Every task: failing test first → minimal code → green → commit. Two files from the spec's break list need **no** task: `smoke.test.ts` has no pill fixtures, and `presetsReducer.test.ts`'s literals (`{ id, icon, name, dur, type: 'none' }`) are already valid `EventPill`s under the union — both compile and pass unchanged. When a test snippet below adds imports from a module the file already imports, merge them into the existing `import` statement rather than adding a second one. Test-helper convention used throughout (each test file defines its own, as today):

```ts
const event = (id: string, dur: number): Pill => ({ id, type: 'none', icon: '⬜', name: id, dur });
const marker = (id: string, type: 'push' | 'alarm' = 'alarm'): Pill => ({ id, type });
```

---

# Phase 1 — Domain: Pill union + pillDur seam

### Task 1: `pill.ts` — the union, guards, `pillDur`, drafts, split seed

**Files:**
- Modify: `src/domain/pill.ts` (full rewrite below)
- Create: `src/domain/__tests__/pill.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/__tests__/pill.test.ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/domain/__tests__/pill.test.ts`
Expected: FAIL — `isEventPill`/`pillDur`/`pillFromDraft` etc. are not exported; SEED_PILLS shape mismatch.

- [ ] **Step 3: Rewrite `src/domain/pill.ts`**

```ts
import { Minutes } from './schedule';

/**
 * v3 model (marker pills). The day is an ORDERED list anchored to a single
 * arrival time. An EventPill is a block of time; a MarkerPill is a standalone,
 * zero-duration alert that fires where the previous item ends:
 *   - 'push'  → a best-effort push notification (expo-notifications)
 *   - 'alarm' → a strong, OS-guaranteed wake alarm (bespoke native module)
 * `type` stays the discriminator — it is literally what the editor's segmented
 * control sets. Replaces v2's event-carries-its-alert model.
 */

export type PillType = 'none' | 'push' | 'alarm';

export const PILL_TYPES: readonly PillType[] = ['none', 'push', 'alarm'];

export type EventPill = {
  id: string; // stable, caller-supplied (UI generates) — keeps the reducer pure & testable
  type: 'none';
  icon: string; // emoji
  name: string; // user-facing, free text
  dur: Minutes; // whole minutes, [0, MAX_PILL_MINUTES]
};

export type MarkerPill = {
  id: string;
  type: 'push' | 'alarm'; // no icon, no name, no dur — the label is derived (markerLabel.ts)
};

export type Pill = EventPill | MarkerPill;

export const isEventPill = (p: Pill): p is EventPill => p.type === 'none';
export const isMarkerPill = (p: Pill): p is MarkerPill => p.type !== 'none';

/** The one seam. A marker occupies zero minutes, so its startAt === endAt = its fire instant. */
export const pillDur = (p: Pill): Minutes => (isEventPill(p) ? p.dur : 0);

/** Canonical state — the ONLY source of truth. Every clock time is a pure function of this. */
export type Chain = {
  arrival: number | null; // the single anchor: epoch ms (secs/millis zeroed), or null before entry
  zone: string; // IANA zone captured at entry, e.g. "Asia/Seoul"
  pills: Pill[]; // chronological: pills[0] is the first item of the day; the last event ends at arrival
};

/** Per-pill duration bound, in minutes (24h). */
export const MAX_PILL_MINUTES = 24 * 60;

/**
 * Language-free pill blueprints mirroring the Pill union: structure + an i18n
 * key for event names, resolved at materialize time (materializePills) so the
 * domain layer carries no UI strings.
 */
export type EventPillSpec = { type: 'none'; icon: string; nameKey: string; dur: Minutes };
export type MarkerPillSpec = { type: 'push' | 'alarm' };
export type PillSpec = EventPillSpec | MarkerPillSpec;

/**
 * First-run seed pills (chronological). Ships PRE-SPLIT: 수면 is a plain event
 * followed by a bare ⏰ marker, so toggling 수면's kind can never silently
 * delete 7 hours from the day. Default 09:00 arrival → 시작 00:45 ·
 * ⏰ 수면 종료 07:45 · 📍 도착 09:00 (design 2A).
 */
export const SEED_PILLS: readonly PillSpec[] = [
  { type: 'none', icon: '😴', nameKey: 'pill.sleep', dur: 420 },
  { type: 'alarm' },
  { type: 'none', icon: '🚿', nameKey: 'pill.shower', dur: 20 },
  { type: 'none', icon: '🍳', nameKey: 'pill.breakfast', dur: 20 },
  { type: 'none', icon: '🚇', nameKey: 'pill.commute', dur: 35 },
];

/**
 * The editor sheet's full local draft. It always carries every field regardless
 * of the selected type, so toggling kinds within one sheet session is free —
 * the discard happens only at pillFromDraft (저장).
 */
export type PillDraft = { icon: string; name: string; dur: Minutes; type: PillType };

/** Blank event draft: the create sheet's default AND the seed when opening an existing marker. */
export const DEFAULT_PILL_DRAFT: PillDraft = { icon: '🧥', name: '', dur: 15, type: 'none' };

/** Commit a draft: 'none' persists an EventPill; a marker type drops the event fields. */
export function pillFromDraft(id: string, draft: PillDraft): Pill {
  return draft.type === 'none'
    ? { id, type: 'none', icon: draft.icon, name: draft.name, dur: draft.dur }
    : { id, type: draft.type };
}

/** Seed the sheet from an existing pill. A marker stores nothing to edit, so it seeds a blank draft. */
export function draftFromPill(pill: Pill): PillDraft {
  return isEventPill(pill)
    ? { icon: pill.icon, name: pill.name, dur: pill.dur, type: 'none' }
    : { ...DEFAULT_PILL_DRAFT, type: pill.type };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/domain/__tests__/pill.test.ts`
Expected: PASS. (Other suites and tsc are now broken — expected until their tasks; jest is run per-file in this phase.)

- [ ] **Step 5: Commit**

```bash
git add src/domain/pill.ts src/domain/__tests__/pill.test.ts
git commit -m "feat(domain): Pill union — EventPill | MarkerPill, pillDur seam, pre-split seed, editor drafts"
```

### Task 2: `chainEngine.ts` — change by substitution only

**Files:**
- Modify: `src/domain/chainEngine.ts:23-25` (totalSpanMinutes), `:42-48` (computeChain loop), comment on `:17`
- Test: `src/domain/__tests__/chainEngine.test.ts`

- [ ] **Step 1: Update the test file — new helpers, split hero, new marker assertions**

Replace the `pill` helper (chainEngine.test.ts:16-22) and `hero` (`:25-35`) with:

```ts
import { Chain, EventPill, MarkerPill, Pill } from '../pill';

const event = (id: string, dur: number): EventPill => ({ id, type: 'none', icon: '⬜', name: id, dur });
const marker = (id: string, type: 'push' | 'alarm' = 'alarm'): MarkerPill => ({ id, type });

// v3 hero: arrival 09:00; 수면(420)+⏰ 샤워(20) 아침(20) 채비(15)+🔔 지하철(35).
const hero = (zone = 'UTC'): Chain => ({
  arrival: at(zone, 2026, 6, 30, 9, 0),
  zone,
  pills: [
    event('sleep', 420),
    marker('wake', 'alarm'),
    event('shower', 20),
    event('breakfast', 20),
    event('prep', 15),
    marker('leave', 'push'),
    event('commute', 35),
  ],
});
```

Mechanical updates to existing tests (same clock expectations — markers are zero-width so every event keeps its old times):
- `computeChain returns null…` tests (`:37-43`): `pill('a', 30)` → `event('a', 30)`.
- hero clocks test (`:45-58`): add `expect(ends.wake).toBe('07:30')` and `expect(ends.leave).toBe('08:25')`; keep all existing expectations verbatim (sleep 07:30, shower 07:50, breakfast 08:10, prep 08:25, commute 09:00, start 00:30).
- dur-span test (`:74-79`): `it.pill.dur` does not exist on the union — replace the assertion with `expect(it.endAt - it.startAt).toBe(pillDur(it.pill) * 60_000);` (add `pillDur` to the imports from `'../pill'`). This now also asserts markers span 0 ms.
- `totalSpanMinutes` test (`:88-90`): expectation stays `420 + 20 + 20 + 15 + 35` — markers add zero.
- `twoAlarms` (`:93-97`) becomes:
```ts
const twoAlarms = (): Chain => ({
  arrival: at('UTC', 2026, 6, 30, 9, 0),
  zone: 'UTC',
  pills: [event('sleep', 420), marker('wake'), event('gap', 30), event('tail', 15), marker('backup')],
});
```
(wake fires at 09:00 − 45 = 08:15; backup fires at 09:00 — identical instants to the old fixture, so every `latestAlarm*`/`upcomingAlarmItem` expectation keeps its clock values; only the asserted ids change: `'wake'`/`'backup'` already match.)
- push-only fixtures (`:112-120`, `:126-134`, `:155-162`): `pill('p', 30, 'push')` → `event('p', 30), marker('p-m', 'push')` — expectations unchanged (still no alarm → null).

Append the new marker-behaviour tests:

```ts
describe('marker pills in the engine (v3)', () => {
  const zone = 'UTC';
  const arrival = at(zone, 2026, 6, 30, 9, 0);

  test('a marker is zero-width: startAt === endAt === the preceding event end', () => {
    const r = computeChain({ arrival, zone, pills: [event('sleep', 420), marker('wake'), event('commute', 35)] })!;
    const wake = r.items[1];
    expect(wake.startAt).toBe(wake.endAt);
    expect(wake.endAt).toBe(r.items[0].endAt);
    expect(clock(wake.endAt, zone)).toBe('08:25'); // 09:00 − 35
  });

  test('ORPHAN marker at index 0 fires at computed.start — no special case in the engine', () => {
    const r = computeChain({ arrival, zone, pills: [marker('first'), event('commute', 35)] })!;
    expect(r.items[0].startAt).toBe(r.start);
    expect(r.items[0].endAt).toBe(r.start);
    expect(clock(r.start, zone)).toBe('08:25');
  });

  test('DUPLICATE markers back-to-back both compute to the same instant', () => {
    const r = computeChain({ arrival, zone, pills: [event('sleep', 60), marker('a'), marker('b')] })!;
    expect(r.items[1].endAt).toBe(r.items[2].endAt);
    expect(r.items[1].endAt).toBe(r.items[0].endAt);
    expect(latestAlarmFromComputed(r)).toBe(r.items[0].endAt);
  });

  test('a marker immediately before the arrival anchor fires exactly at the arrival instant', () => {
    const r = computeChain({ arrival, zone, pills: [event('commute', 35), marker('at-door')] })!;
    expect(r.items[1].endAt).toBe(arrival);
  });

  test('a marker-only chain: every marker fires at start === arrival', () => {
    const r = computeChain({ arrival, zone, pills: [marker('only')] })!;
    expect(r.start).toBe(arrival);
    expect(r.items[0].endAt).toBe(arrival);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx jest src/domain/__tests__/chainEngine.test.ts`
Expected: FAIL — type errors (`pills` no longer accept old shape) and/or `pill.dur` undefined at runtime for markers.

- [ ] **Step 3: Substitute `pillDur` in the engine**

In `src/domain/chainEngine.ts`:

```ts
import { MINUTE_MS } from './schedule';
import { Chain, Pill, pillDur } from './pill';
```

`totalSpanMinutes` (`:23-25`):
```ts
export function totalSpanMinutes(chain: Chain): number {
  return chain.pills.reduce((sum, p) => sum + pillDur(p), 0);
}
```

`computeChain` loop body (`:42-48`):
```ts
  for (let i = n - 1; i >= 0; i -= 1) {
    const pill = chain.pills[i];
    const endAt = arrival - suffixAfter * MINUTE_MS;
    const startAt = endAt - pillDur(pill) * MINUTE_MS;
    items[i] = { pill, startAt, endAt };
    suffixAfter += pillDur(pill);
  }
```

Comment edit on `ChainComputed.start` (`:17`): `// epoch ms when the first item begins (the chain-start row); == arrival when there are no pills`. Everything else in the file (`latestAlarmFromComputed`, `latestAlarmInstant`, `upcomingAlarmItem`) is untouched — `it.pill.type === 'alarm'` now matches only MarkerPills, which is exactly the intent.

- [ ] **Step 4: Run to verify green**

Run: `npx jest src/domain/__tests__/chainEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/chainEngine.ts src/domain/__tests__/chainEngine.test.ts
git commit -m "feat(domain): computeChain via pillDur — markers are zero-width; orphan/duplicate markers covered"
```

### Task 3: `markerLabel.ts` — the derived-label source

**Files:**
- Create: `src/domain/markerLabel.ts`
- Create: `src/domain/__tests__/markerLabel.test.ts`
- Modify: `src/domain/index.ts` (add export)

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/__tests__/markerLabel.test.ts
import { labelSourceFor } from '../markerLabel';
import { EventPill, MarkerPill } from '../pill';

const event = (id: string): EventPill => ({ id, type: 'none', icon: '⬜', name: `name-${id}`, dur: 30 });
const marker = (id: string): MarkerPill => ({ id, type: 'alarm' });

test('returns the immediately preceding event', () => {
  const pills = [event('a'), marker('m')];
  expect(labelSourceFor(pills, 1)?.id).toBe('a');
});

test('scans back PAST other markers to the nearest event', () => {
  const pills = [event('a'), marker('m1'), marker('m2'), marker('m3')];
  expect(labelSourceFor(pills, 3)?.id).toBe('a');
});

test('orphan at index 0 → null (caller falls back to the start label)', () => {
  expect(labelSourceFor([marker('m'), event('a')], 0)).toBeNull();
});

test('only markers before it → null', () => {
  expect(labelSourceFor([marker('m1'), marker('m2')], 1)).toBeNull();
});

test('ignores events AFTER the index', () => {
  const pills = [marker('m'), event('later')];
  expect(labelSourceFor(pills, 0)).toBeNull();
});

test('an event index resolves to the event before it (harmless, unused by the UI)', () => {
  const pills = [event('a'), event('b')];
  expect(labelSourceFor(pills, 1)?.id).toBe('a');
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest src/domain/__tests__/markerLabel.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/domain/markerLabel.ts
import { EventPill, Pill, isEventPill } from './pill';

/**
 * The source event for a marker's derived label: the nearest EventPill BEFORE
 * `index`, skipping other markers. Null when none exists (an orphan marker) —
 * callers then use the chain's start label. i18n application stays with the
 * caller: `source ? t('chainScreen.eventEnds', { name: source.name }) : startLabel`.
 * One derivation feeds the chain row, NativeAlarm.label, the push title, and
 * the armed chip — which is why no Kotlin/Swift change is needed.
 */
export function labelSourceFor(pills: readonly Pill[], index: number): EventPill | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    const p = pills[i];
    if (isEventPill(p)) return p;
  }
  return null;
}
```

In `src/domain/index.ts` add after the `preset` export line (`:10`):
```ts
export * from './markerLabel';
```

- [ ] **Step 4: Run to verify green** — `npx jest src/domain/__tests__/markerLabel.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/markerLabel.ts src/domain/__tests__/markerLabel.test.ts src/domain/index.ts
git commit -m "feat(domain): labelSourceFor — position-derived marker labels"
```

### Task 4: `chainValidation.ts` — event-only range checks + `start-passed` rename

**Files:**
- Modify: `src/domain/chainValidation.ts:20` (kind), `:27-34` (range loop), comments
- Modify: `src/i18n/en.ts:132` and `src/i18n/ko.ts:133` (`chainIssue` key rename — both catalogs in the same commit)
- Test: `src/domain/__tests__/chainValidation.test.ts`

- [ ] **Step 1: Update the test file**

Replace the `pill` helper (`:9-15`) with the `event`/`marker` helpers (Task 2 convention) and the `hero` (`:19-23`) with:

```ts
const hero = (): Chain => ({
  arrival: at(ZONE, 2026, 6, 30, 9, 0),
  zone: ZONE,
  pills: [event('sleep', 420), marker('wake'), event('shower', 20), event('prep', 15), event('commute', 35)],
});
```

(wake fires at 09:00 − 70 = 07:50 — same instant as the old hero's sleep-end, so the `past-event` test at `:55-61` keeps its `08:00` now.) Mechanical edits:
- Every `'bedtime-passed'` string in this file → `'start-passed'` (tests at `:34-39`, `:52`, `:59`).
- Multi-alarm fixture (`:42-53`): `pills: [event('sleep', 420), marker('wake'), event('gap', 30), event('tail', 15), marker('backup')]` — wake 08:15, backup 09:00, same instants as before.
- `:76-86` fixture: `pills: [event('sleep', 420), marker('wake'), event('gap', 30), event('tail', 15), marker('backup'), event('commute', 30)]` — wake 07:45, backup 08:30, same expectations.
- Push-only fixtures (`:63-74`, `:96-105`): `[event('p', 30), marker('pm', 'push'), event('x', 60)]`.
- `no-alarm`/`no-arrival`/NaN fixtures: `pill('sleep', 420, 'alarm')` → `event('sleep', 420), marker('wake')`.
- Out-of-range fixtures (`:128-149`): `pill('huge', MAX_PILL_MINUTES + 1, 'alarm')` → `event('huge', MAX_PILL_MINUTES + 1), marker('m')` (and `neg` likewise) — the flagged id stays `'huge'`/`'neg'`.
- chain-too-long fixture (`:151-161`): `pills: [pill('a', 800, 'alarm'), pill('b', 800)]` → `pills: [event('a', 800), marker('m'), event('b', 800)]` — expectations unchanged (1600 > 1560).

Append new tests:

```ts
test('markers are never flagged pill-out-of-range — they have no duration to be out of range', () => {
  const c: Chain = { arrival: at(ZONE, 2026, 6, 30, 9, 0), zone: ZONE, pills: [marker('m'), event('a', 60)] };
  expect(kinds(validateChain(c, at(ZONE, 2026, 6, 29, 23, 0)))).not.toContain('pill-out-of-range');
});

test('an ORPHAN marker chain is valid and armable (spec: nothing is rejected)', () => {
  const c: Chain = { arrival: at(ZONE, 2026, 6, 30, 9, 0), zone: ZONE, pills: [marker('first'), event('commute', 35)] };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(issues).toEqual([]);
  expect(isChainArmable(issues)).toBe(true);
});

test('DUPLICATE alarm markers are legal — no validation rule, no de-dupe', () => {
  const c: Chain = { arrival: at(ZONE, 2026, 6, 30, 9, 0), zone: ZONE, pills: [event('sleep', 420), marker('a'), marker('b')] };
  expect(validateChain(c, at(ZONE, 2026, 6, 29, 23, 0))).toEqual([]);
});

test('chain-too-long sums event durations only (markers contribute zero)', () => {
  const pills: Pill[] = [event('a', 800), marker('m1'), event('b', 800), marker('m2')];
  const c: Chain = { arrival: at(ZONE, 2026, 7, 5, 9, 0), zone: ZONE, pills };
  expect(kinds(validateChain(c, at(ZONE, 2026, 7, 1, 0, 0)))).toContain('chain-too-long'); // 1600 > 1560
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/domain/__tests__/chainValidation.test.ts` → FAIL (type errors + `start-passed` unknown kind).

- [ ] **Step 3: Implement**

In `src/domain/chainValidation.ts`:

```ts
import { Chain, MAX_PILL_MINUTES, isEventPill } from './pill';
```

Kind rename (`:20`) — the comment stops referring to a bedtime that no longer exists:
```ts
  | { kind: 'start-passed' }; // the chain start already passed (non-blocking nudge)
```

Range loop (`:27-34`) checks event pills only:
```ts
  let infeasible = false;
  for (const pill of chain.pills) {
    if (!isEventPill(pill)) continue; // a marker has no duration to be out of range
    if (pill.dur < 0) infeasible = true;
    if (pill.dur < 0 || pill.dur > MAX_PILL_MINUTES) {
      issues.push({ kind: 'pill-out-of-range', id: pill.id });
    }
  }
```

`bedtime-passed` push site (`:55-57`) → `issues.push({ kind: 'start-passed' });` (comment: `// start-passed is the nudge; past-event supersedes it`). The `BLOCKING` list (`:64-71`) is untouched — `start-passed` stays non-blocking. `totalSpanMinutes` already uses `pillDur` (Task 2); `no-alarm` (`:42`) is untouched (`p.type === 'alarm'` matches alarm markers).

In **both** catalogs, rename the key and re-word away from 취침/bedtime:
- `src/i18n/ko.ts:133`: `'bedtime-passed': '주의: 시작 시간이 이미 지났어요.'` → `'start-passed': '주의: 시작 시간이 이미 지났어요.'`
- `src/i18n/en.ts:132`: `'bedtime-passed': 'Heads up: your start time has already passed.'` → `'start-passed': 'Heads up: your start time has already passed.'`

(en.ts's `satisfies Record<ChainValidationIssue['kind'], string>` enforces the rename at compile time; `catalogs.test.ts` enforces ko parity.)

- [ ] **Step 4: Run to verify green**

Run: `npx jest src/domain/__tests__/chainValidation.test.ts src/i18n/__tests__/catalogs.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src/domain/chainValidation.ts src/domain/__tests__/chainValidation.test.ts src/i18n/en.ts src/i18n/ko.ts
git commit -m "feat(domain): validation for the union — event-only range checks, bedtime-passed → start-passed"
```

### Task 5: `preset.ts` — `presetSummary` skips markers

**Files:**
- Modify: `src/domain/preset.ts:31-37`
- Test: `src/domain/__tests__/preset.test.ts`

- [ ] **Step 1: Update the test file** — replace the helper (`:4-10`) with the `event`/`marker` convention, keep the two existing tests (they use events only; add `type: 'none'` shape via the helper), and append:

```ts
test('presetSummary is computed from EVENT pills only — markers add nothing', () => {
  const pills: Pill[] = [event('a', '😴', 420), marker('m1'), event('b', '🚿', 20), marker('m2', 'push')];
  expect(presetSummary(pills)).toEqual({ count: 2, totalMinutes: 440, icons: '😴🚿' });
});

test('a marker-only list summarises to zero', () => {
  expect(presetSummary([marker('m1'), marker('m2', 'push')])).toEqual({ count: 0, totalMinutes: 0, icons: '' });
});
```

(helpers here: `const event = (id: string, icon: string, dur: number): Pill => ({ id, type: 'none', icon, name: id, dur });` and the usual `marker`.)

- [ ] **Step 2: Run to verify failure** — `npx jest src/domain/__tests__/preset.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `src/domain/preset.ts`:

```ts
import { Pill, isEventPill } from './pill';
```
```ts
/** List-row summary data: the emoji strip + "이벤트 {count}개 · 총 {H:MM}" — EVENT pills only. */
export function presetSummary(pills: Pill[]): PresetSummary {
  const events = pills.filter(isEventPill);
  return {
    count: events.length,
    totalMinutes: events.reduce((sum, p) => sum + p.dur, 0),
    icons: events.map((p) => p.icon).join(''),
  };
}
```

- [ ] **Step 4: Run to verify green** — `npx jest src/domain/__tests__/preset.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/preset.ts src/domain/__tests__/preset.test.ts
git commit -m "feat(domain): presetSummary counts event pills only"
```

### Task 6: `chainMigration.ts` — spec-union materialize + split v1 legacy path

**Files:**
- Modify: `src/domain/chainMigration.ts` (both functions)
- Test: `src/domain/__tests__/chainMigration.test.ts`, `src/state/__tests__/chainHydrate.test.ts:13-21` (seed shape)

- [ ] **Step 1: Update the tests**

`chainMigration.test.ts` — replace entirely:

```ts
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
```

`chainHydrate.test.ts:13-21` (`seedPills`) — expectation becomes:

```ts
test('seedPills materialises the PRE-SPLIT seed with resolved names + ids', () => {
  const pills = seedPills(name, id);
  expect(pills.map((p) => [p.id, p.type])).toEqual([
    ['id-0', 'none'],
    ['id-1', 'alarm'],
    ['id-2', 'none'],
    ['id-3', 'none'],
    ['id-4', 'none'],
  ]);
  expect(pills.filter((p) => p.type === 'none').map((p) => p.name)).toEqual([
    'name:pill.sleep',
    'name:pill.shower',
    'name:pill.breakfast',
    'name:pill.commute',
  ]);
});
```

Also in `chainHydrate.test.ts`: `migratedChain` test (`:23-38`) — expectation becomes six entries `[['name:pill.sleep', 480, 'none'], /* marker */, …]`; assert via:
```ts
  expect(chain.pills.map((p) => p.type)).toEqual(['none', 'alarm', 'none', 'push', 'none', 'none']);
  expect(chain.pills.filter((p) => p.type === 'none').map((p) => p.name)).toEqual([
    'name:pill.sleep', 'name:pill.prep', 'name:pill.travel', 'name:pill.contingency',
  ]);
```
And the inline pill literals at `:47-49`, `:88`, `:116` gain no change except shape: `{ id: 'a', icon: '😴', name: 's', dur: 420, type: 'alarm' }` → `{ id: 'a', type: 'none', icon: '😴', name: 's', dur: 420 }` (they were roll/zone fixtures; the alarm-ness is irrelevant there). The `withDefaultArrival` seed-names test (`:58-71`) filters events as above.

- [ ] **Step 2: Run to verify failure** — `npx jest src/domain/__tests__/chainMigration.test.ts src/state/__tests__/chainHydrate.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/domain/chainMigration.ts`:

```ts
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
```

(`src/state/chainHydrate.ts` itself needs no code change — `seedPills`/`migratedChain`/`withDefaultArrival` are shape-agnostic pass-throughs.)

- [ ] **Step 4: Run to verify green** — `npx jest src/domain/__tests__/chainMigration.test.ts src/state/__tests__/chainHydrate.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/chainMigration.ts src/domain/__tests__/chainMigration.test.ts src/state/__tests__/chainHydrate.test.ts
git commit -m "feat(domain): union PillSpec materialize; v1 legacy migration ships pre-split"
```

### Task 7: `chainReducer.ts` — whole-pill replacement; rollover test shapes

**Files:**
- Modify: `src/state/chainReducer.ts:15` (delete `PillPatch`), `:31` (action), `:71-75` (case)
- Test: `src/state/__tests__/chainReducer.test.ts`, `src/domain/__tests__/chainRollover.test.ts` (shapes only)

- [ ] **Step 1: Update the tests**

`chainReducer.test.ts`: replace the helper (`:4-10`) with `event`/`marker` convention (`pill(id)` call sites become `event(id, 30)`), and replace the `update-pill` describe (`:93-108`) with:

```ts
describe('update-pill (whole-pill replacement — PillPatch cannot express a union)', () => {
  test('replaces only the matching pill', () => {
    const s = chainReducer(withPills('a', 'b'), {
      type: 'update-pill',
      id: 'b',
      next: { id: 'b', type: 'alarm' },
    });
    expect(s.pills[0]).toEqual(event('a', 30));
    expect(s.pills[1]).toEqual({ id: 'b', type: 'alarm' });
  });

  test('an event → marker replacement drops the event fields entirely', () => {
    const s = chainReducer(withPills('a'), { type: 'update-pill', id: 'a', next: { id: 'a', type: 'push' } });
    expect(s.pills[0]).toEqual({ id: 'a', type: 'push' });
    expect('dur' in s.pills[0]).toBe(false);
  });

  test('a marker → event replacement carries the full draft-built event', () => {
    const start: ChainState = { arrival: 1_900_000_000_000, zone: 'Asia/Seoul', pills: [{ id: 'm', type: 'alarm' }] };
    const s = chainReducer(start, {
      type: 'update-pill',
      id: 'm',
      next: { id: 'm', type: 'none', icon: '🧥', name: '외출 준비', dur: 15 },
    });
    expect(s.pills[0]).toEqual({ id: 'm', type: 'none', icon: '🧥', name: '외출 준비', dur: 15 });
  });

  test('the stored id wins over a mismatched next.id (ids are stable)', () => {
    const s = chainReducer(withPills('a'), {
      type: 'update-pill',
      id: 'a',
      next: { id: 'WRONG', type: 'alarm' },
    });
    expect(s.pills[0].id).toBe('a');
  });
});
```

Also update the immutability test's `update-pill` call (`:133`): `{ type: 'update-pill', id: 'a', next: event('a', 1) }`.

`chainRollover.test.ts`: replace the helper (`:9-15`) with `event`/`marker`; fixtures `pill('sleep', 420, 'alarm')` → `event('sleep', 420), marker('wake')` and `pill('a', 30, 'alarm')` → `event('a', 30), marker('m')`. No expectation values change (rollover never consults pills).

- [ ] **Step 2: Run to verify failure** — `npx jest src/state/__tests__/chainReducer.test.ts src/domain/__tests__/chainRollover.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `src/state/chainReducer.ts`: delete the `PillPatch` type (`:15`); action union entry (`:30-31`) becomes:

```ts
  // Replace a pill wholesale (the editor sheet owns the union shape; a Partial
  // patch cannot express EventPill | MarkerPill).
  | { type: 'update-pill'; id: string; next: Pill }
```

Case (`:71-75`):
```ts
    case 'update-pill':
      return {
        ...state,
        pills: state.pills.map((p) => (p.id === action.id ? { ...action.next, id: p.id } : p)),
      };
```

- [ ] **Step 4: Run to verify green** — `npx jest src/state/__tests__/chainReducer.test.ts src/domain/__tests__/chainRollover.test.ts` → PASS.

- [ ] **Step 5: Phase 1 gate + commit** — run every suite touched so far:

Run: `npx jest src/domain src/state/__tests__/chainReducer.test.ts src/state/__tests__/chainHydrate.test.ts src/i18n`
Expected: all PASS.

```bash
git add src/state/chainReducer.ts src/state/__tests__/chainReducer.test.ts src/domain/__tests__/chainRollover.test.ts
git commit -m "feat(state): update-pill replaces the whole pill — PillPatch removed"
```

# Phase 2 — Storage: v3 sanitizer + key bumps + ring-time-preserving migration

Key map (spec): draft `schedularm.draft.v2 → .v3`, armed `schedularm.armed.v2 → .v3`, presets `schedularm.presets.v1 → .v2`. No version envelope in payloads — versioning lives in the key suffix. Pattern per key: try the new key; else read the legacy key, convert, write new, remove legacy. (If a crash lands between write-new and remove-legacy, the new key wins forever and the stale legacy key is dead weight — harmless.)

### Task 8: `chainSanitize.ts` — union-aware `sanitizePill` (the most fragile file)

**Files:**
- Modify: `src/storage/chainSanitize.ts:39-49`
- Test: `src/storage/__tests__/draftChain.test.ts`, `src/storage/__tests__/armedChain.test.ts` (shape updates + new marker cases; keys stay v2 in THIS task — the bump is Tasks 10/11)

- [ ] **Step 1: Update tests**

In `draftChain.test.ts`, update `sample` (`:19-26`) to the union shape:

```ts
const sample: Chain = {
  arrival: 1_900_000_000_000,
  zone: 'Asia/Seoul',
  pills: [
    { id: 'p1', type: 'none', icon: '😴', name: '수면', dur: 420 },
    { id: 'p1m', type: 'alarm' },
    { id: 'p2', type: 'none', icon: '🚿', name: '샤워', dur: 20 },
  ],
};
```

Most inline stored-pill literals in this file keep working (extra/missing JSON fields are the sanitizer's job), but two tests assert `.dur` on pills stored with `type: 'alarm'` — under the union those now sanitize to bare markers, so their subject must become an event:
- out-of-range dur test (`:52-58`): stored pill becomes `{ id: 'p1', icon: '😴', name: 'x', dur: 99999, type: 'none' }` and the assertion narrows: `const p = (await loadDraftChain())?.pills[0]; expect(p).toEqual({ id: 'p1', type: 'none', icon: '😴', name: 'x', dur: 99999 });` (store-verbatim is an event-pill property now).
- non-finite dur test (`:110-116`): same treatment — stored `type: 'none'`, expect `dur: 0` via `toEqual` on the full EventPill.
- `an unknown pill type falls back to none` (`:92-98`): unchanged behaviour — still `'none'`, now meaning an EventPill.
- Append the marker-sanitizing cases:

```ts
test('a stored marker keeps only id+type — stray icon/name/dur fields are dropped', async () => {
  await AsyncStorage.setItem(
    V2_KEY,
    JSON.stringify({ ...sample, pills: [{ id: 'm1', type: 'alarm', icon: '👻', name: 'ghost', dur: 999 }] }),
  );
  expect((await loadDraftChain())?.pills[0]).toEqual({ id: 'm1', type: 'alarm' });
});

test('a marker with a missing id gets one synthesised by index', async () => {
  await AsyncStorage.setItem(V2_KEY, JSON.stringify({ ...sample, pills: [{ type: 'push' }] }));
  expect((await loadDraftChain())?.pills[0]).toEqual({ id: 'pill-0', type: 'push' });
});

test('an event entry missing fields still coerces to a full EventPill (defaults, dur 0)', async () => {
  await AsyncStorage.setItem(V2_KEY, JSON.stringify({ ...sample, pills: [{ id: 'e', type: 'none' }] }));
  expect((await loadDraftChain())?.pills[0]).toEqual({ id: 'e', type: 'none', icon: '', name: '', dur: 0 });
});
```

In `armedChain.test.ts`: `sample` (`:12-16`) → `pills: [{ id: 'p1', type: 'none', icon: '😴', name: '수면', dur: 420 }, { id: 'p1m', type: 'alarm' }]`; the malformed-pill test (`:52-64`) expectation becomes `expect(pills?.[0]).toEqual({ id: 'pill-1', type: 'none', icon: '🚿', name: 'x', dur: 0 })` (bogus type → 'none' → event with coerced fields).

- [ ] **Step 2: Run to verify failure** — `npx jest src/storage/__tests__/draftChain.test.ts src/storage/__tests__/armedChain.test.ts` → FAIL.

- [ ] **Step 3: Implement** — replace `sanitizePill` (`chainSanitize.ts:38-49`):

```ts
/**
 * Coerce one stored entry into a valid Pill, or null if it isn't a plain
 * object. Branches on the SANITIZED type and emits the matching union member:
 * a marker keeps only {id, type} (stray event fields are dropped), an event
 * gets fallback values. This is the shared boundary for draft AND armed — a
 * malformed element must be normalised here, never reach the engine.
 */
export function sanitizePill(value: unknown, index: number): Pill | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const id = typeof v.id === 'string' && v.id ? v.id : `pill-${index}`;
  const type = sanitizeType(v.type);
  if (type !== 'none') return { id, type };
  return {
    id,
    type,
    icon: typeof v.icon === 'string' ? v.icon : '',
    name: typeof v.name === 'string' ? v.name : '',
    dur: sanitizeDur(v.dur),
  };
}
```

(Everything else in the file — `sanitizeType`, `sanitizeDur`, `sanitizePills`, `parseStoredChain`, `sanitizeArrival`, `sanitizeZone` — is unchanged.)

- [ ] **Step 4: Run to verify green** — same jest command → PASS. Also `npx jest src/storage/__tests__/presets.test.ts` (its `sample` needs the same shape touch-up: `pills: [{ id: 'p1', type: 'none', icon: '😴', name: '수면', dur: 420 }, { id: 'p1m', type: 'alarm' }, { id: 'p2', type: 'none', icon: '🚿', name: '샤워', dur: 20 }]`; the `type: 'bogus'` expectation at `:115-126` still reads `.type === 'none'`).

- [ ] **Step 5: Commit**

```bash
git add src/storage/chainSanitize.ts src/storage/__tests__/draftChain.test.ts src/storage/__tests__/armedChain.test.ts src/storage/__tests__/presets.test.ts
git commit -m "feat(storage): union-aware sanitizePill — markers keep only id+type"
```

### Task 9: `legacyV2.ts` — the frozen v2 reader + pill splitter

**Files:**
- Create: `src/storage/legacyV2.ts`
- Create: `src/storage/__tests__/legacyV2.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/storage/__tests__/legacyV2.test.ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/storage/__tests__/legacyV2.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/storage/legacyV2.ts
import { Chain, Pill, PILL_TYPES, PillType } from '../domain';
import { Preset, PresetLibrary } from '../domain/preset';
import { sanitizeArrival, sanitizeZone } from './chainSanitize';

/**
 * FROZEN readers for the v2 storage format (schedularm.draft.v2 / armed.v2 /
 * presets.v1) + the v2→v3 pill splitter. The coercion rules are a frozen COPY
 * of the pre-union sanitizePill — deliberately NOT shared with the live
 * sanitizer, so future changes to the v3 boundary can never silently change
 * what old payloads migrate to. Delete this file once the v2 keys are extinct.
 */

type V2Pill = { id: string; icon: string; name: string; dur: number; type: PillType };

function readV2Type(value: unknown): PillType {
  return PILL_TYPES.includes(value as PillType) ? (value as PillType) : 'none';
}

function readV2Dur(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function readV2Pill(value: unknown, index: number): V2Pill | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return {
    id: typeof v.id === 'string' && v.id ? v.id : `pill-${index}`,
    icon: typeof v.icon === 'string' ? v.icon : '',
    name: typeof v.name === 'string' ? v.name : '',
    dur: readV2Dur(v.dur),
    type: readV2Type(v.type),
  };
}

/**
 * The spec's converter. The old pill fired at its own END; the new marker sits
 * at zero duration immediately after the event, so it lands on that same
 * instant — every ring time is byte-identical (legacyV2.test.ts proves it).
 */
function splitV2Pill(p: V2Pill): Pill[] {
  const event: Pill = { id: p.id, type: 'none', icon: p.icon, name: p.name, dur: p.dur };
  return p.type === 'none' ? [event] : [event, { id: `${p.id}~m`, type: p.type }];
}

export function convertV2Pills(value: unknown): Pill[] {
  return (Array.isArray(value) ? value : [])
    .map(readV2Pill)
    .filter((p): p is V2Pill => p !== null)
    .flatMap(splitV2Pill);
}

/** A raw v2 chain payload (draft or armed) → a v3 Chain, or null for missing/corrupt. */
export function migrateV2ChainPayload(raw: string | null): Chain | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    return {
      arrival: sanitizeArrival(obj.arrival),
      zone: sanitizeZone(obj.zone),
      pills: convertV2Pills(obj.pills),
    };
  } catch {
    return null;
  }
}

/** A raw presets.v1 payload → a v2 library with every pill list converted. */
export function migrateV1PresetsPayload(raw: string | null): PresetLibrary | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;

    const seen = new Set<string>();
    const presets: Preset[] = [];
    (Array.isArray(obj.presets) ? obj.presets : []).forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const v = entry as Record<string, unknown>;
      const name = typeof v.name === 'string' ? v.name.trim() : '';
      if (!name) return; // v1 rule: an unnamed preset is corruption — drop it
      const id = typeof v.id === 'string' && v.id ? v.id : `preset-${index}`;
      if (seen.has(id)) return;
      seen.add(id);
      presets.push({ id, name, pills: convertV2Pills(v.pills) });
    });

    const activeId = typeof obj.activeId === 'string' && seen.has(obj.activeId) ? obj.activeId : null;
    return { presets, activeId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify green** — `npx jest src/storage/__tests__/legacyV2.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/legacyV2.ts src/storage/__tests__/legacyV2.test.ts
git commit -m "feat(storage): frozen v2 reader + ring-time-preserving pill splitter"
```

### Task 10: `draftChain.ts` — key bump v3 + on-load migration

**Files:**
- Modify: `src/storage/draftChain.ts:16-17`, `loadDraftChain`
- Test: `src/storage/__tests__/draftChain.test.ts`

- [ ] **Step 1: Update tests** — in `draftChain.test.ts` change the key constants (`:16-17`):

```ts
const V3_KEY = 'schedularm.draft.v3';
const V2_KEY = 'schedularm.draft.v2';
const V1_KEY = 'schedularm.draft.v1';
```

Every direct `AsyncStorage.setItem(V2_KEY, …)` from Task 8's version of this file now targets `V3_KEY` (those tests exercise the live v3 sanitize path). Append the migration tests:

```ts
describe('v2 → v3 draft migration', () => {
  const v2Payload = JSON.stringify({
    arrival: 1_900_000_000_000,
    zone: 'Asia/Seoul',
    pills: [
      { id: 'p1', icon: '😴', name: '수면', dur: 420, type: 'alarm' },
      { id: 'p2', icon: '🚇', name: '지하철', dur: 35, type: 'none' },
    ],
  });

  test('a v2 draft is converted, persisted under v3, and the v2 key is cleared', async () => {
    await AsyncStorage.setItem(V2_KEY, v2Payload);
    const chain = await loadDraftChain();
    expect(chain?.pills.map((p) => [p.id, p.type])).toEqual([
      ['p1', 'none'],
      ['p1~m', 'alarm'],
      ['p2', 'none'],
    ]);
    expect(await AsyncStorage.getItem(V3_KEY)).not.toBeNull();
    expect(await AsyncStorage.getItem(V2_KEY)).toBeNull();
    // A second load reads the persisted v3 copy and returns the same chain.
    expect(await loadDraftChain()).toEqual(chain);
  });

  test('an existing v3 draft wins — a stale v2 key is ignored, not re-migrated over it', async () => {
    await saveDraftChain({ arrival: 1_900_000_000_000, zone: 'UTC', pills: [{ id: 'new', type: 'alarm' }] });
    await AsyncStorage.setItem(V2_KEY, v2Payload);
    expect((await loadDraftChain())?.pills).toEqual([{ id: 'new', type: 'alarm' }]);
  });

  test('a corrupt v2 payload migrates to nothing and is cleared (fresh start, not a crash loop)', async () => {
    await AsyncStorage.setItem(V2_KEY, '{nope');
    expect(await loadDraftChain()).toBeNull();
    expect(await AsyncStorage.getItem(V2_KEY)).toBeNull();
  });

  test('the v1 legacy path is untouched by the bump (still read separately for the hook)', async () => {
    await AsyncStorage.setItem(V1_KEY, JSON.stringify({ arrival: 1, zone: 'UTC', sleep: 480, prep: 45, travel: 60, contingency: 15 }));
    expect(await loadDraftChain()).toBeNull(); // v1 is NOT a draft-chain payload
    expect((await loadLegacyDraft())?.sleep).toBe(480);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/storage/__tests__/draftChain.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `src/storage/draftChain.ts`, keys (`:16-17`) become:

```ts
const DRAFT_KEY = 'schedularm.draft.v3';
const V2_DRAFT_KEY = 'schedularm.draft.v2';
const LEGACY_DRAFT_KEY = 'schedularm.draft.v1';
```

and `loadDraftChain` (`:19-21`):

```ts
import { migrateV2ChainPayload } from './legacyV2';
```
```ts
export async function loadDraftChain(): Promise<Chain | null> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  if (raw != null) return parseStoredChain(raw);
  // One-time v2 → v3 migration: read, convert (ring-time-preserving split),
  // persist under v3, clear v2. A corrupt v2 payload converts to null and is
  // still cleared — a fresh seed beats a permanent parse-crash loop.
  const v2raw = await AsyncStorage.getItem(V2_DRAFT_KEY);
  if (v2raw == null) return null;
  const migrated = migrateV2ChainPayload(v2raw);
  if (migrated) await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(migrated));
  await AsyncStorage.removeItem(V2_DRAFT_KEY);
  return migrated;
}
```

- [ ] **Step 4: Run to verify green** — `npx jest src/storage/__tests__/draftChain.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/draftChain.ts src/storage/__tests__/draftChain.test.ts
git commit -m "feat(storage): draft key v3 with on-load v2 migration"
```

### Task 11: `armedChain.ts` — key bump v3; the armed chain STAYS ARMED

**Files:**
- Modify: `src/storage/armedChain.ts`
- Test: `src/storage/__tests__/armedChain.test.ts`

- [ ] **Step 1: Update tests** — key constants become `ARMED_KEY = 'schedularm.armed.v3'`, `V2_ARMED_KEY = 'schedularm.armed.v2'`; existing direct-setItem tests target v3. Append:

```ts
describe('v2 → v3 armed migration (an app update must never be why someone oversleeps)', () => {
  const ARRIVAL = 1_900_000_000_000;
  const MIN = 60_000;
  const v2Armed = JSON.stringify({
    arrival: ARRIVAL,
    zone: 'Asia/Seoul',
    pills: [
      { id: 'p1', icon: '😴', name: '수면', dur: 420, type: 'alarm' },
      { id: 'p2', icon: '🚇', name: '지하철', dur: 35, type: 'none' },
    ],
  });

  test('the armed snapshot migrates in place with its alarm instant UNCHANGED', async () => {
    await AsyncStorage.setItem(V2_ARMED_KEY, v2Armed);
    const migrated = await loadArmedChain();
    expect(migrated).not.toBeNull();
    // v2: the alarm fired when 수면 ended = arrival − 35min. Byte-identical after migration:
    expect(latestAlarmInstant(migrated!)).toBe(ARRIVAL - 35 * MIN);
    expect(await AsyncStorage.getItem(V2_ARMED_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(ARMED_KEY)).not.toBeNull();
  });

  test('the stays-armed invariant: the migrated snapshot still passes the liveness gate', async () => {
    // useArmingChain keeps a snapshot armed iff latestAlarmInstant(c) > now.
    await AsyncStorage.setItem(V2_ARMED_KEY, v2Armed);
    const migrated = await loadArmedChain();
    const last = latestAlarmInstant(migrated!);
    const nowBeforeAlarm = ARRIVAL - 60 * MIN;
    expect(last).not.toBeNull();
    expect(last! > nowBeforeAlarm).toBe(true);
  });
});
```

(add `import { latestAlarmInstant } from '../../domain';` at the top.)

- [ ] **Step 2: Run to verify failure** — `npx jest src/storage/__tests__/armedChain.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/storage/armedChain.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Chain } from '../domain';
import { parseStoredChain } from './chainSanitize';
import { migrateV2ChainPayload } from './legacyV2';

/**
 * The *armed* chain snapshot — only exists once an alarm is set. Distinct from
 * the editable draft (draftChain.ts). Shares the SAME parse+sanitize path
 * (parseStoredChain). On upgrade the snapshot migrates in place with identical
 * alarm instants (legacyV2 split), and the native alarm store is NOT touched —
 * OS alarms keep ringing on their old ids; the next arm/disarm replaces the
 * set atomically (scheduleAlarms is a full-set replace, dismissAll is not
 * id-keyed), so the transient p1 vs p1~m id mismatch is never observable.
 */
const ARMED_KEY = 'schedularm.armed.v3';
const V2_ARMED_KEY = 'schedularm.armed.v2';

export async function saveArmedChain(chain: Chain): Promise<void> {
  await AsyncStorage.setItem(ARMED_KEY, JSON.stringify(chain));
}

export async function loadArmedChain(): Promise<Chain | null> {
  const raw = await AsyncStorage.getItem(ARMED_KEY);
  if (raw != null) return parseStoredChain(raw);
  const v2raw = await AsyncStorage.getItem(V2_ARMED_KEY);
  if (v2raw == null) return null;
  const migrated = migrateV2ChainPayload(v2raw);
  if (migrated) await AsyncStorage.setItem(ARMED_KEY, JSON.stringify(migrated));
  await AsyncStorage.removeItem(V2_ARMED_KEY);
  return migrated;
}

export async function clearArmedChain(): Promise<void> {
  await AsyncStorage.removeItem(ARMED_KEY);
  await AsyncStorage.removeItem(V2_ARMED_KEY); // a disarm must not leave a resurrectable v2 ghost
}
```

Note the `clearArmedChain` addition: without removing the v2 key too, a user who disarms *before* the first `loadArmedChain` call would have the old snapshot "migrate back from the dead" on next launch.
Add a test for it:

```ts
test('clearArmedChain also clears a not-yet-migrated v2 snapshot (no resurrection after disarm)', async () => {
  await AsyncStorage.setItem(V2_ARMED_KEY, v2Armed);
  await clearArmedChain();
  expect(await loadArmedChain()).toBeNull();
});
```

(place it inside the migration describe so `v2Armed` is in scope).

- [ ] **Step 4: Run to verify green** — `npx jest src/storage/__tests__/armedChain.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/armedChain.ts src/storage/__tests__/armedChain.test.ts
git commit -m "feat(storage): armed key v3 — snapshot migrates in place, alarm instants byte-identical, stays armed"
```

### Task 12: `presets.ts` — key bump v2

**Files:**
- Modify: `src/storage/presets.ts:13`, `loadPresets`
- Test: `src/storage/__tests__/presets.test.ts`

- [ ] **Step 1: Update tests** — `KEY = 'schedularm.presets.v2'`, add `const V1_KEY = 'schedularm.presets.v1'`; existing direct-setItem tests target the new KEY. Append:

```ts
describe('presets v1 → v2 migration', () => {
  test('every preset pill list is split-converted; key moves v1 → v2', async () => {
    await AsyncStorage.setItem(
      V1_KEY,
      JSON.stringify({
        presets: [{ id: 'a', name: '평일 아침', pills: [{ id: 'p1', icon: '😴', name: '수면', dur: 420, type: 'alarm' }] }],
        activeId: 'a',
      }),
    );
    const lib = await loadPresets();
    expect(lib?.presets[0].pills).toEqual([
      { id: 'p1', type: 'none', icon: '😴', name: '수면', dur: 420 },
      { id: 'p1~m', type: 'alarm' },
    ]);
    expect(lib?.activeId).toBe('a');
    expect(await AsyncStorage.getItem(KEY)).not.toBeNull();
    expect(await AsyncStorage.getItem(V1_KEY)).toBeNull();
  });

  test('an existing v2 library wins over a stale v1 key', async () => {
    await savePresets({ presets: [{ id: 'n', name: 'new', pills: [] }], activeId: null });
    await AsyncStorage.setItem(V1_KEY, JSON.stringify({ presets: [{ id: 'old', name: 'old', pills: [] }], activeId: null }));
    expect((await loadPresets())?.presets.map((p) => p.id)).toEqual(['n']);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/storage/__tests__/presets.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `src/storage/presets.ts`:

```ts
import { migrateV1PresetsPayload } from './legacyV2';
```
```ts
const PRESETS_KEY = 'schedularm.presets.v2';
const V1_PRESETS_KEY = 'schedularm.presets.v1';
```
```ts
export async function loadPresets(): Promise<PresetLibrary | null> {
  const raw = await AsyncStorage.getItem(PRESETS_KEY);
  if (raw != null) return parseStoredPresets(raw);
  const v1raw = await AsyncStorage.getItem(V1_PRESETS_KEY);
  if (v1raw == null) return null;
  const migrated = migrateV1PresetsPayload(v1raw);
  if (migrated) await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(migrated));
  await AsyncStorage.removeItem(V1_PRESETS_KEY);
  return migrated;
}
```

- [ ] **Step 4: Run to verify green** — `npx jest src/storage` → all storage suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/presets.ts src/storage/__tests__/presets.test.ts
git commit -m "feat(storage): presets key v2 with on-load v1 migration"
```

# Phase 3 — Alarm pipeline + hooks: derived labels, startLabel threading

The threading chain (spec): `AlarmService.armChain(chain, startLabel)` → `planNativeAlarms(computed, nowMs, startLabel)` → `scheduleChainPush(chain, computed, alarmIds, startLabel)`. `NativeAlarm { id, at, label, leaveAt }` is preserved exactly — labels are computed on the JS side; **no native change**.

### Task 13: `alarmPlan.ts` — derived labels + marker-aware `leaveAt`

**Files:**
- Modify: `src/alarm/alarmPlan.ts`
- Test: `src/alarm/__tests__/alarmPlan.test.ts`

Note: `planNativeAlarms` now resolves labels via `t()`. Jest's i18n resolves to the **en** catalog (`test/stubs/expo-localization.js` returns `languageCode: 'en'`), so expectations use `'{{name}} ends'`.

- [ ] **Step 1: Rewrite the test file**

```ts
// src/alarm/__tests__/alarmPlan.test.ts
import { planNativeAlarms } from '../alarmPlan';
import type { ChainComputed, Pill } from '../../domain';
import { pillDur } from '../../domain';

const HOUR = 3_600_000;
const NOW = 1_780_000_000_000;
const START = '평일 아침 시작';

const event = (id: string, dur: number, name = id): Pill => ({ id, type: 'none', icon: '⬜', name, dur });
const marker = (id: string, type: 'push' | 'alarm' = 'alarm'): Pill => ({ id, type });

/** Suffix-sum builder mirroring computeChain, with 1 dur unit = 1 HOUR for readable math. */
const computed = (arrival: number, pills: Pill[]): ChainComputed => {
  const items = new Array(pills.length);
  let suffix = 0;
  for (let i = pills.length - 1; i >= 0; i -= 1) {
    const endAt = arrival - suffix * HOUR;
    const startAt = endAt - pillDur(pills[i]) * HOUR;
    items[i] = { pill: pills[i], startAt, endAt };
    suffix += pillDur(pills[i]);
  }
  return { start: arrival - suffix * HOUR, arrival, items };
};

test('maps only alarm markers; label = "{preceding event} ends"; leaveAt = last EVENT start', () => {
  // arrival NOW+4h → commute [NOW+2h, NOW+4h]; leave(push) at NOW+2h; shower
  // [NOW+1h, NOW+2h]; wake at NOW+1h; sleep [NOW, NOW+1h].
  const c = computed(NOW + 4 * HOUR, [
    event('sleep', 1, 'Sleep'),
    marker('wake', 'alarm'),
    event('shower', 1),
    marker('leave', 'push'),
    event('commute', 2),
  ]);
  const alarms = planNativeAlarms(c, NOW, START);
  expect(alarms).toEqual([
    { id: 'wake', at: NOW + 1 * HOUR, label: 'Sleep ends', leaveAt: NOW + 2 * HOUR },
  ]);
});

test('an ORPHAN alarm marker (index 0) takes the start label and fires at computed.start', () => {
  const c = computed(NOW + 3 * HOUR, [marker('first', 'alarm'), event('commute', 1)]);
  const alarms = planNativeAlarms(c, NOW, START);
  expect(alarms).toEqual([{ id: 'first', at: NOW + 2 * HOUR, label: START, leaveAt: NOW + 2 * HOUR }]);
});

test('DUPLICATE alarm markers produce two NativeAlarms at the same `at`', () => {
  const c = computed(NOW + 2 * HOUR, [event('sleep', 1, 'Sleep'), marker('a'), marker('b')]);
  const alarms = planNativeAlarms(c, NOW, START);
  expect(alarms).toHaveLength(2);
  expect(alarms[0].at).toBe(alarms[1].at);
  expect(alarms.map((a) => a.id)).toEqual(['a', 'b']);
  expect(alarms.map((a) => a.label)).toEqual(['Sleep ends', 'Sleep ends']);
});

test('a marker between markers scans back past them for its label', () => {
  const c = computed(NOW + 2 * HOUR, [event('sleep', 1, 'Sleep'), marker('p', 'push'), marker('a', 'alarm')]);
  expect(planNativeAlarms(c, NOW, START)[0].label).toBe('Sleep ends');
});

test('leaveAt skips a TRAILING marker — it stays on the last event leg, not the arrival', () => {
  const arrival = NOW + 4 * HOUR;
  const c = computed(arrival, [event('sleep', 1), marker('wake'), event('commute', 2), marker('door', 'alarm')]);
  const alarms = planNativeAlarms(c, NOW, START);
  // commute spans [arrival-2h, arrival]; leaveAt must be its start, not arrival.
  for (const a of alarms) expect(a.leaveAt).toBe(arrival - 2 * HOUR);
  // and the trailing marker itself fires exactly at the arrival instant:
  expect(alarms.find((a) => a.id === 'door')!.at).toBe(arrival);
});

test('drops alarms whose instant already passed (no spurious re-ring on launch re-arm)', () => {
  // arrival NOW+0.5h → b spans [NOW-0.5h, NOW+0.5h]; a-m fires at NOW-0.5h (past).
  const c = computed(NOW + HOUR / 2, [event('a', 1), marker('a-m'), event('b', 1), marker('b-m')]);
  expect(planNativeAlarms(c, NOW, START).map((a) => a.id)).toEqual(['b-m']);
});

test('an alarm firing exactly now is past, not future', () => {
  const c = computed(NOW + HOUR, [event('a', 1), marker('a-m'), event('b', 1), marker('b-m')]);
  expect(c.items[1].endAt).toBe(NOW);
  expect(planNativeAlarms(c, NOW, START).map((a) => a.id)).toEqual(['b-m']);
});

test('returns [] with no future alarm markers; empty chain leaveAt falls back to arrival', () => {
  expect(planNativeAlarms(computed(NOW - HOUR, [event('a', 1), marker('m')]), NOW, START)).toEqual([]);
  expect(planNativeAlarms(computed(NOW + HOUR, []), NOW, START)).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/alarm/__tests__/alarmPlan.test.ts` → FAIL (signature + labels).

- [ ] **Step 3: Implement** — `src/alarm/alarmPlan.ts`:

```ts
import type { ChainComputed } from '../domain';
import { isEventPill, labelSourceFor } from '../domain';
import { t } from '../i18n';
import type { NativeAlarm } from '../../modules/schedularm-alarm';

/**
 * Native alarms for a computed chain: every alarm MARKER still in the future.
 * Past instants must NEVER be (re)scheduled — setAlarmClock fires a past
 * timestamp immediately (mirrors the push path's past filter).
 *
 * The label is derived from position (a marker stores no name): the nearest
 * preceding event's "{name} ends", or `startLabel` for an orphan marker. This
 * derivation is what keeps NativeAlarm's contract — and the Kotlin/Swift ring
 * screens — untouched.
 */
export function planNativeAlarms(
  computed: ChainComputed,
  nowMs: number,
  startLabel: string,
): NativeAlarm[] {
  const pills = computed.items.map((it) => it.pill);
  // The ring countdown's "leave" target: the start of the LAST EVENT pill (the
  // final real leg). A trailing zero-width marker must not drag it onto the
  // arrival instant itself.
  const lastEvent = [...computed.items].reverse().find((it) => isEventPill(it.pill));
  const leaveAt = lastEvent ? lastEvent.startAt : computed.arrival;
  return computed.items
    .map((it, index) => ({ it, index }))
    .filter(({ it }) => it.pill.type === 'alarm' && it.endAt > nowMs)
    .map(({ it, index }) => {
      const source = labelSourceFor(pills, index);
      const label = source ? t('chainScreen.eventEnds', { name: source.name }) : startLabel;
      return { id: it.pill.id, at: it.endAt, label, leaveAt };
    });
}
```

- [ ] **Step 4: Run to verify green** — `npx jest src/alarm/__tests__/alarmPlan.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/alarm/alarmPlan.ts src/alarm/__tests__/alarmPlan.test.ts
git commit -m "feat(alarm): derived marker labels + event-aware leaveAt — NativeAlarm contract preserved"
```

### Task 14: `chainPushAlerts.ts` + `AlarmService.ts` — push titles + startLabel pass-through

**Files:**
- Modify: `src/alarm/chainPushAlerts.ts`, `src/alarm/AlarmService.ts:40-50`
- Modify: `src/i18n/en.ts:55`, `src/i18n/ko.ts:53` (`alerts.pill.title` placeholder)
- Test: `src/i18n/__tests__/catalogs.test.ts` (guards the placeholder change; no unit test exists for chainPushAlerts — it is a dynamic-import side-effect module; behaviour is covered by device QA in Phase 6)

- [ ] **Step 1: i18n first (both catalogs, same edit)** — the marker has no name; the derived label already contains 종료/ends (or 시작/starts):
- `ko.ts:53`: `pill: { title: '🔔 {{name}} 종료', body: … }` → `pill: { title: '🔔 {{label}}', body: '{{time}}에 나가면 {{arrival}} 도착에 맞아요.' }`
- `en.ts:54-55`: comment + `pill: { title: '🔔 {{name}} ends', … }` → `// v2: a push marker fires this — {{label}} is derived from position, {{arrival}} is the anchor.` / `pill: { title: '🔔 {{label}}', body: 'Head out at {{time}} to arrive by {{arrival}}.' }`

Run `npx jest src/i18n` → PASS (placeholder parity holds because both moved together).

- [ ] **Step 2: `chainPushAlerts.ts`** — signature + loop:

```ts
import { Chain, ChainComputed, isMarkerPill, labelSourceFor, toLocalClock } from '../domain';
```

```ts
export async function scheduleChainPush(
  chain: Chain,
  computed: ChainComputed,
  excludePillIds?: Set<string>,
  startLabel?: string,
): Promise<void> {
```

and the scheduling loop (`:40-57`) becomes:

```ts
    const pills = computed.items.map((it) => it.pill);
    for (let index = 0; index < computed.items.length; index += 1) {
      const it = computed.items[index];
      if (!isMarkerPill(it.pill)) continue; // events are timing only, no alert
      if (excludePillIds?.has(it.pill.id)) continue; // fired by a native strong alarm instead
      if (it.endAt <= Date.now()) continue; // already past (best-effort, skip)
      const source = labelSourceFor(pills, index);
      const label = source ? t('chainScreen.eventEnds', { name: source.name }) : (startLabel ?? '');
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('alerts.pill.title', { label }),
          body: t('alerts.pill.body', { time: toLocalClock(it.endAt, chain.zone), arrival }),
          sound: 'default',
        },
        // Keyed by stable pill id — endAt is not unique (duplicate markers share one).
        identifier: `chain-${it.pill.id}`,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: it.endAt,
          channelId: CHANNEL_ID,
        },
      });
    }
```

- [ ] **Step 3: `AlarmService.ts`** — `armChain` (`:40-50`) gains the parameter and passes it down:

```ts
  async armChain(chain: Chain, startLabel: string): Promise<void> {
    if (!isAndroid && !isIos) return;
    const computed = computeChain(chain);
    if (!computed) return;
    const alarms = planNativeAlarms(computed, Date.now(), startLabel);
    // Await native FIRST — if it throws, the caller leaves the chain un-armed.
    if (alarms.length) await native.scheduleAlarms(alarms);
    if (isIos) ensureIosNotificationPermission();
    // Push markers only; alarm marker ids are excluded (they ring natively).
    void scheduleChainPush(chain, computed, new Set(alarms.map((a) => a.id)), startLabel);
  },
```

- [ ] **Step 4: Verify** — `npx jest src/alarm src/i18n` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/alarm/chainPushAlerts.ts src/alarm/AlarmService.ts src/i18n/en.ts src/i18n/ko.ts
git commit -m "feat(alarm): push titles from derived labels; armChain threads startLabel"
```

### Task 15: `chainStartLabel` + `chainScreen.chainStarts` + `useArmingChain`

**Files:**
- Modify: `src/ui/format.ts` (add helper), `src/i18n/en.ts` / `ko.ts` (add key), `src/hooks/useArmingChain.ts`
- Test: `src/ui/__tests__/format.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/ui/__tests__/format.test.ts`:

```ts
import { chainStartLabel } from '../format';
import { i18n } from '../../i18n';

describe('chainStartLabel', () => {
  test('an active preset name → "{name} starts"', () => {
    i18n.locale = 'en';
    expect(chainStartLabel('평일 아침')).toBe('평일 아침 starts');
  });

  test('no active preset → falls back to the current-schedule label', () => {
    i18n.locale = 'ko';
    expect(chainStartLabel(null)).toBe('현재 일정 시작');
    i18n.locale = 'en'; // restore for other tests
  });
});
```

(Check the top of `format.test.ts` first: if it already pins `i18n.locale`, follow its existing idiom instead of re-pinning.)

- [ ] **Step 2: i18n keys (both catalogs)** — inside `chainScreen`:
- `ko.ts` (after `eventEnds` at `:72`): `chainStarts: '{{name}} 시작',`
- `en.ts` (after `eventEnds` at `:75`): `chainStarts: '{{name}} starts',`

- [ ] **Step 3: Implement the helper** — append to `src/ui/format.ts`:

```ts
/**
 * The chain-start label: "{preset} 시작", falling back to 현재 일정 when no
 * preset is active. Feeds the start row, orphan-marker labels (native alarm,
 * push title, armed chip) — one derivation everywhere.
 */
export function chainStartLabel(presetName: string | null): string {
  return t('chainScreen.chainStarts', { name: presetName ?? t('preset.current') });
}
```

Run: `npx jest src/ui/__tests__/format.test.ts src/i18n` → PASS.

- [ ] **Step 4: `useArmingChain.ts`** — arm signature + boot re-arm label:

```ts
import { loadPresets } from '../storage/presets';
import { chainStartLabel } from '../ui/format';
```

The boot effect's re-arm (`:32-46`) becomes:

```ts
    loadArmedChain().then(async (c) => {
      if (cancelled) return;
      const last = c ? latestAlarmInstant(c) : null;
      if (c && last != null && last > Date.now()) {
        setArmed(c);
        // Re-ensure native scheduling matches the snapshot — self-heals after an
        // app update cancels AlarmManager alarms, or any native↔JS divergence.
        // The start label re-derives from the CURRENT active preset (the armed
        // snapshot stores no preset name); label-only drift, never a time drift.
        const lib = await loadPresets().catch(() => null);
        const activeName = lib?.presets.find((p) => p.id === lib.activeId)?.name ?? null;
        AlarmService.armChain(c, chainStartLabel(activeName)).catch((e) =>
          console.warn('[useArmingChain] re-arm on launch failed:', e),
        );
      } else if (c) {
        clearArmedChain();
      }
    });
```

and `arm` (`:52-66`):

```ts
  const arm = useCallback(
    async (chain: Chain, startLabel: string) => {
      try {
        await AlarmService.armChain(chain, startLabel);
        await saveArmedChain(chain);
        setArmed(chain);
      } catch (e) {
        console.warn('[useArmingChain] arm failed; leaving un-armed:', e);
      }
      refreshHealth();
    },
    [refreshHealth],
  );
```

- [ ] **Step 5: Verify + commit** — `npx jest src/ui src/i18n src/alarm` → PASS.

```bash
git add src/ui/format.ts src/ui/__tests__/format.test.ts src/i18n/en.ts src/i18n/ko.ts src/hooks/useArmingChain.ts
git commit -m "feat(alarm): chainStartLabel — arm + boot re-arm carry the start label"
```

### Task 16: `useChain.ts` — draft-based pill API

**Files:**
- Modify: `src/hooks/useChain.ts:31`, `:121-127`

No jest coverage exists for hooks (node env, no renderer) — this task is exercised by the domain tests for `pillFromDraft` (Task 1) plus tsc in Phase 4. Changes:

- [ ] **Step 1: Implement**

Replace the `PillInput` type (`:31`) and the two helpers (`:121-127`):

```ts
import {
  Chain,
  Pill,
  PillDraft,
  computeChain,
  isChainArmable,
  pillFromDraft,
  rollChainToFuture,
  validateChain,
} from '../domain';
```

```ts
  /** Add a pill from an editor draft (mints the id, builds the union member). */
  const addPill = (draft: PillDraft, index?: number): string => {
    const id = makeId();
    dispatch({ type: 'add-pill', pill: pillFromDraft(id, draft), index });
    return id;
  };
  /** Replace a pill from an editor draft — the sheet owns the type-flip semantics. */
  const updatePill = (id: string, draft: PillDraft) =>
    dispatch({ type: 'update-pill', id, next: pillFromDraft(id, draft) });
```

(delete the `PillType` import if now unused; `PillInput` has no other references — `grep -rn "PillInput" src` must come back empty.)

- [ ] **Step 2: Verify + commit** — `npx jest src` → ALL suites PASS (UI files are not imported by any test).

```bash
git add src/hooks/useChain.ts
git commit -m "feat(hooks): useChain takes editor drafts — pillFromDraft at the boundary"
```

# Phase 4 — Editor + chain UI (tsc returns green at the end of this phase)

UI components have no jest harness (ts-jest node env). The testable logic already lives in domain tests (Tasks 1–7); these tasks are gated by `npx tsc --noEmit` (Task 20 step) and the device QA checklist (Phase 6). Keep styles in `theme.ts` tokens — no inline hex.

### Task 17: `PillEditorSheet.tsx` — kind control on top, collapsing fields, lossy-save guard

**Files:**
- Modify: `src/ui/components/PillEditorSheet.tsx`
- Modify: `src/i18n/en.ts` / `ko.ts` (editor keys — same commit)

- [ ] **Step 1: i18n (both catalogs, lockstep)**

`ko.ts` `pillType` (`:66`) and `pillEditor` (`:84-96`):
```ts
  pillType: { none: '이벤트', push: '🔔 알림', alarm: '⏰ 알람' },
```
```ts
  pillEditor: {
    createTitle: '새 이벤트 만들기',
    editTitle: '이벤트 편집',
    namePlaceholder: '이름',
    kindSection: '종류',
    hintEvent: '이벤트 — 시간 계산에 쓰이는 하루의 구간이에요.',
    hintPush: '🔔 앞 이벤트가 끝나는 지점에 알림이 따로 떠요 — 필요한 곳에 옮겨 보세요.',
    hintAlarm: '⏰ 앞 이벤트가 끝나는 지점에 강한 알람이 따로 울려요 — 필요한 곳에 옮겨 보세요.',
    warnFieldsDropped: '이모지·이름·시간은 지워져요.',
    add: '추가하기',
    save: '저장',
    delete: '삭제',
  },
```

`en.ts` `pillType` (`:69`) and `pillEditor` (`:87-99`):
```ts
  pillType: { none: 'Event', push: '🔔 Notify', alarm: '⏰ Alarm' },
```
```ts
  pillEditor: {
    createTitle: 'New event',
    editTitle: 'Edit',
    namePlaceholder: 'Name',
    kindSection: 'Kind',
    hintEvent: 'An event — a block of time your day is planned around.',
    hintPush: '🔔 A notification fires where the previous event ends — move it wherever you need.',
    hintAlarm: '⏰ A strong wake alarm rings where the previous event ends — move it wherever you need.',
    warnFieldsDropped: 'The emoji, name and duration will be cleared.',
    add: 'Add',
    save: 'Save',
    delete: 'Delete',
  },
```

Removed in the same edit: `typeSection`, `hintNone`, `warnRowGone` (both catalogs). Run `npx jest src/i18n` → PASS.

(Korean copy for `hintPush`/`hintAlarm`/`warnFieldsDropped` is verbatim from the spec; `hintEvent` and the en strings are proposed copy — review at plan approval.)

- [ ] **Step 2: Restructure the sheet**

In `src/ui/components/PillEditorSheet.tsx`:

1. Import the draft from domain and delete the local type (`:23`):
```ts
import { MAX_PILL_MINUTES, PILL_TYPES, PillDraft, PillType } from '../../domain';

export type { PillDraft } from '../../domain'; // re-export: ChainScreen's import site stays stable
```
2. Delete the `label` const (`:84`) — hints are name-free now.
3. Move the segmented control block (`:190-203`) to directly under the title (before `quickRow`), with the new key:
```tsx
          <Text style={styles.sectionLabel}>{t('pillEditor.kindSection')}</Text>
          <View style={styles.segmented}>
            {PILL_TYPES.map((pt) => (
              <Pressable
                key={pt}
                onPress={() => setType(pt)}
                style={[styles.segment, pt === type && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, pt === type && styles.segmentTextActive]}>
                  {t(`pillType.${pt}`)}
                </Text>
              </Pressable>
            ))}
          </View>
```
4. Wrap the event-only inputs — `quickRow` (`:111-124`) and `fieldRow` (`:126-188`) — in a single conditional so the fields are **hidden, not destroyed** (the draft state persists across toggles; the control sits above, so collapsing never moves it under the finger):
```tsx
          {type === 'none' ? (
            <>
              {/* quickRow block — unchanged */}
              {/* fieldRow block — unchanged */}
            </>
          ) : null}
```
5. Hint block (`:205-213`) becomes:
```tsx
          <View style={[styles.hint, type === 'alarm' && styles.hintAlarm]}>
            <Text style={styles.hintText}>
              {type === 'none'
                ? t('pillEditor.hintEvent')
                : type === 'push'
                  ? t('pillEditor.hintPush')
                  : t('pillEditor.hintAlarm')}
            </Text>
          </View>
```
6. Warning block (`:214-220`) — fires when an EVENT is about to be saved as a marker (the lossy direction), replacing `warnRowGone`:
```tsx
          {mode === 'edit' && initial.type === 'none' && type !== 'none' ? (
            <View style={styles.warn}>
              <Text style={styles.warnText}>⚠️ {t('pillEditor.warnFieldsDropped')}</Text>
            </View>
          ) : null}
```
7. `submit` (`:85-86`) is unchanged in shape — it emits the full draft; the discard happens downstream in `pillFromDraft`:
```ts
  const submit = () =>
    onSubmit({ icon: icon || lastIconRef.current, name: name.trim() || initial.name, dur, type });
```

- [ ] **Step 3: Commit** (tsc still red until Task 20 — expected)

```bash
git add src/ui/components/PillEditorSheet.tsx src/i18n/en.ts src/i18n/ko.ts
git commit -m "feat(ui): editor sheet — kind control on top, collapsing event fields, lossy-save warning"
```

### Task 18: `ChainList.tsx` — start row + marker rows

**Files:**
- Modify: `src/ui/components/ChainList.tsx` (substantial rewrite of the row rendering), `src/ui/theme.ts:32` (comment), `src/i18n/en.ts` / `ko.ts` (delete `chainScreen.bedtime`)

- [ ] **Step 1: i18n** — delete `bedtime: '취침',` (ko.ts:69) and `bedtime: 'Bedtime',` (en.ts:72). Run `npx jest src/i18n` → PASS.

- [ ] **Step 2: Rewrite the component**

```tsx
// src/ui/components/ChainList.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ChainComputed,
  ComputedItem,
  EventPill,
  MarkerPill,
  isMarkerPill,
  labelSourceFor,
  toLocalClock,
} from '../../domain';
import { t } from '../../i18n';
import { formatDuration, formatMonthDay } from '../format';
import { colors, fonts, pillStyle, radii, shadows, spacing } from '../theme';

type Props = {
  computed: ChainComputed;
  zone: string;
  /** "{preset} 시작" — the start row text AND the orphan-marker fallback label. */
  startLabel: string;
  onPressPill: (id: string) => void;
  onPressAnchor: () => void;
};

/**
 * Renders the v3 chain: a start row (when the whole preset begins), one card
 * per event, a bordered 🔔/⏰ row per marker (labels derived from position),
 * and the arrival anchor. Purely presentational — all times pre-computed.
 */
export function ChainList({ computed, zone, startLabel, onPressPill, onPressAnchor }: Props) {
  const clock = (ms: number) => toLocalClock(ms, zone);
  const monthDay = (ms: number) => formatMonthDay(ms, zone);
  const pills = computed.items.map((it) => it.pill);

  return (
    <View style={styles.list}>
      {computed.items.length > 0 ? (
        <View style={styles.startRow}>
          <View style={styles.startDot} />
          <Text style={styles.startLabel} numberOfLines={1}>{startLabel}</Text>
          <Text style={styles.startDate}>{monthDay(computed.start)}</Text>
          <Text style={styles.startTime}>{clock(computed.start)}</Text>
        </View>
      ) : null}

      {computed.items.map((item, index) =>
        isMarkerPill(item.pill) ? (
          <MarkerRow
            key={item.pill.id}
            item={item}
            marker={item.pill}
            label={labelSourceFor(pills, index)?.name ?? null}
            startLabel={startLabel}
            clock={clock}
            monthDay={monthDay}
            onPress={() => onPressPill(item.pill.id)}
          />
        ) : (
          <EventRow
            key={item.pill.id}
            pill={item.pill}
            onPress={() => onPressPill(item.pill.id)}
          />
        ),
      )}

      <Pressable style={styles.anchor} onPress={onPressAnchor}>
        <Text style={styles.anchorIcon}>📍</Text>
        <Text style={styles.anchorLabel}>{t('chainScreen.anchorLabel')}</Text>
        <Text style={styles.anchorDate}>{monthDay(computed.arrival)}</Text>
        <Text style={styles.anchorTime}>{clock(computed.arrival)}</Text>
      </Pressable>
    </View>
  );
}

function EventRow({ pill, onPress }: { pill: EventPill; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <View style={[styles.card, styles.cardNone]}>
        <Text style={styles.cardIcon}>{pill.icon}</Text>
        <Text style={styles.cardName}>{pill.name}</Text>
        <Text style={[styles.cardDur, { color: colors.ink2 }]}>{formatDuration(pill.dur)}</Text>
      </View>
    </Pressable>
  );
}

function MarkerRow({
  item,
  marker,
  label,
  startLabel,
  clock,
  monthDay,
  onPress,
}: {
  item: ComputedItem;
  marker: MarkerPill;
  /** Preceding event name, or null for an orphan (falls back to startLabel). */
  label: string | null;
  startLabel: string;
  clock: (ms: number) => string;
  monthDay: (ms: number) => string;
  onPress: () => void;
}) {
  const sx = pillStyle[marker.type];
  const text = label != null ? t('chainScreen.eventEnds', { name: label }) : startLabel;
  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          styles.eventRow,
          marker.type === 'alarm'
            ? { borderWidth: 2, borderColor: sx.eventBorder, ...shadows.focus }
            : { borderWidth: 1.5, borderColor: sx.eventBorder, ...shadows.bubble },
        ]}
      >
        <Text style={styles.eventIcon}>{sx.eventIcon}</Text>
        <Text style={styles.eventLabel} numberOfLines={1}>{text}</Text>
        <View style={[styles.badge, { backgroundColor: sx.badgeBg }]}>
          <Text style={styles.badgeText}>{t(`chainScreen.badge.${marker.type}`)}</Text>
        </View>
        <View style={styles.eventSpacer} />
        <Text style={styles.eventDate}>{monthDay(item.endAt)}</Text>
        <Text style={[styles.eventTime, { color: sx.eventTime }]}>{clock(item.endAt)}</Text>
      </View>
    </Pressable>
  );
}
```

Styles: keep `list`, `card`, `cardNone`, `cardIcon`, `cardName`, `cardDur`, `eventRow`, `eventIcon`, `eventLabel`, `badge`, `badgeText`, `eventSpacer`, `eventDate`, `eventTime`, `anchor*` exactly as they are (ChainList.tsx:110-167). Delete `cap`, `capIcon`, `capLabel`, `capTime`, and `connector`. Add:

```ts
  startRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginLeft: spacing.xs, marginBottom: 2 },
  startDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.faint }, // hollow dot (design Chain component)
  startLabel: { flexShrink: 1, color: colors.faint, fontSize: 11, fontFamily: fonts.bold },
  startDate: { color: colors.faint, fontSize: 11, fontFamily: fonts.clock, marginLeft: 'auto' as const },
  startTime: { color: colors.faint, fontSize: 12, fontFamily: fonts.clock },
```

`theme.ts:31` comment: `faint: '#94A8C2', // start row + drag handles`. Also delete the now-unused `none` entry from `pillStyle` (`theme.ts:44-49`) so `pillStyle` is keyed by marker types only — `pillStyle[marker.type]` narrows cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/ChainList.tsx src/ui/theme.ts src/i18n/en.ts src/i18n/ko.ts
git commit -m "feat(ui): chain list — start row replaces bedtime cap; markers are standalone rows"
```

### Task 19: `ReorderView.tsx` — markers as draggable rows

**Files:**
- Modify: `src/ui/components/ReorderView.tsx`

- [ ] **Step 1: Implement**

Props gain `startLabel: string`. Header changes in the component body:

```ts
import { Pill, isMarkerPill, labelSourceFor, pillDur } from '../../domain';
import { colors, fonts, pillStyle, radii, shadows, spacing } from '../theme';
```
```ts
  const total = pills.reduce((sum, p) => sum + pillDur(p), 0); // 총 준비 시간 = events only
```

Row invocation passes the derived label (labels re-derive from the committed order after each drop; `ROW_H = 58` stays uniform for ALL kinds — the drag math is absolute-positioned and a shorter marker row is not free):

```tsx
            {pills.map((pill, index) => (
              <Row
                key={pill.id}
                pill={pill}
                markerLabel={
                  isMarkerPill(pill)
                    ? (() => {
                        const source = labelSourceFor(pills, index);
                        return source ? t('chainScreen.eventEnds', { name: source.name }) : startLabel;
                      })()
                    : null
                }
                index={index}
                count={pills.length}
                draggingIndex={draggingIndex}
                dragY={dragY}
                onReorder={onReorder}
              />
            ))}
```

`Row` gains `markerLabel: string | null` and its content block (`:128-149`) becomes:

```tsx
  const badge =
    pill.type === 'alarm'
      ? { bg: colors.warnBg, fg: colors.alarmAccentText, text: `⏰ ${t('chainScreen.badge.alarm')}` }
      : pill.type === 'push'
        ? { bg: colors.skyBg, fg: colors.sky700, text: `🔔 ${t('chainScreen.badge.push')}` }
        : null;

  return (
    <Animated.View style={[styles.rowAbsolute, { top: index * ROW_H }, animated]}>
      <GestureDetector gesture={pan}>
        {isMarkerPill(pill) ? (
          <View style={[styles.row, styles.markerRow, { borderColor: pillStyle[pill.type].eventBorder }]}>
            <Text style={styles.handle}>⋮⋮</Text>
            <Text style={styles.rowIcon}>{pillStyle[pill.type].eventIcon}</Text>
            <Text style={styles.rowName} numberOfLines={1}>{markerLabel}</Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.text}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.row}>
            <Text style={styles.handle}>⋮⋮</Text>
            <Text style={styles.rowIcon}>{pill.icon}</Text>
            <Text style={styles.rowName}>{pill.name}</Text>
            <Text style={styles.rowDur}>{formatDuration(pill.dur)}</Text>
          </View>
        )}
      </GestureDetector>
    </Animated.View>
  );
```

New style: `markerRow: { borderWidth: 1.5, backgroundColor: colors.bubble },` (the row keeps `styles.row`'s padding/gap; the border marks it as a marker like the chain list does).

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/ReorderView.tsx
git commit -m "feat(ui): reorder — markers are their own draggable rows; footer sums pillDur"
```

### Task 20: `ChainScreen.tsx` — NEW badge out, drafts in, startLabel threaded; tsc gate

**Files:**
- Modify: `src/ui/screens/ChainScreen.tsx`, `src/i18n/en.ts` / `ko.ts` (`preset.newBadge` delete, `chainScreen.addPill` copy)

- [ ] **Step 1: i18n** — delete `newBadge: 'NEW',` from both catalogs (ko.ts:99, en.ts:102); `chainScreen.addPill`: ko `'＋ 추가'`, en `'＋ Add'`. Run `npx jest src/i18n` → PASS.

- [ ] **Step 2: Implement the screen changes**

1. Imports: add `labelSourceFor` to the domain import (`:7-13`); add `chainStartLabel` to the format import (`:24`); replace the `DEFAULT_NEW_PILL` const (`:27`) with a domain import:
```ts
import { DEFAULT_PILL_DRAFT, PillDraft } from '../../domain';
```
(the `PillDraft` import from PillEditorSheet at `:21` can stay via the re-export or move to domain — one source, pick the domain import and drop it from the sheet import.)
2. Start label, above `armedInfo` (`:60`):
```ts
  const startLabel = chainStartLabel(activePreset?.name ?? null);
```
3. `armedInfo` (`:66-77`) — the derived label replaces `item.pill.name`:
```ts
  const armedInfo = useMemo(() => {
    if (!armed) return null;
    const c = computeChain(armed);
    if (!c) return null;
    const item = upcomingAlarmItem(c, nowMs);
    if (!item) return null; // unreachable for a real armed chain (arm gate requires an alarm)
    const source = labelSourceFor(c.items.map((it) => it.pill), c.items.indexOf(item));
    return {
      label: source ? t('chainScreen.eventEnds', { name: source.name }) : startLabel,
      time: toLocalClock(item.endAt, armed.zone),
      date: formatAlarmDate(item.endAt, nowMs, armed.zone),
    };
  }, [armed, nowMs, startLabel]);
```
4. Delete the NEW badge block (`:200-204`) and its styles `newBadge`/`newBadgeText` (`:389-390`).
5. `onSubmitPill` — signature unchanged, body now passes drafts straight through (`updatePill(editor.id, draft)` / `addPill(draft)` — Task 16 already retyped the hook).
6. Editor seeding (`:165-166`, `:325`):
```ts
  const editingPill =
    editor?.mode === 'edit' ? chain.pills.find((p) => p.id === editor.id) : undefined;
  const editorInitial = editingPill ? draftFromPill(editingPill) : DEFAULT_PILL_DRAFT;
```
(add `draftFromPill` to the domain import; `initial={editorInitial}` at `:325`.)
7. Arm press (`:280`): `onPress={armed ? disarm : () => armable && arm(chain, startLabel)}`.
8. `ChainList` (`:258-263`) gains `startLabel={startLabel}`; `ReorderView` (`:341-349`) gains `startLabel={startLabel}`.

- [ ] **Step 3: The tsc gate — the whole repo compiles again**

Run: `npx tsc --noEmit`
Expected: **clean** (except `ArrivalPickerSheet.tsx` if its props were already touched — they were not; the old picker still compiles against the unchanged `chain.arrival` call site). If ANY error names a file under `modules/schedularm-alarm/`, **stop — the native-contract assumption broke; flag it instead of editing native code**.

Run: `npx jest src` → ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/ChainScreen.tsx src/i18n/en.ts src/i18n/ko.ts
git commit -m "feat(ui): chain screen — NEW badge removed, ＋추가 copy, draft-based editor, startLabel threaded"
```

# Phase 5 — Arrival picker: `instantToYMD`, `WheelPicker`, unified sheet

### Task 21: `datetime.instantToYMD` — the missing inverse

**Files:**
- Modify: `src/domain/datetime.ts`
- Test: `src/domain/__tests__/datetime.test.ts`

- [ ] **Step 1: Write the failing test** — append to `datetime.test.ts`:

```ts
import { instantToYMD } from '../datetime';

describe('instantToYMD (the inverse the picker needs to open on the current arrival)', () => {
  test('round-trips with resolveArrivalInstant in the same zone', () => {
    const zone = 'Asia/Seoul';
    const now = nowAt(zone, 2026, 7, 14, 12, 0);
    const ymd = { year: 2026, month: 7, day: 15 };
    const instant = resolveArrivalInstant(9, 0, zone, now, ymd);
    expect(instantToYMD(instant, zone)).toEqual(ymd);
  });

  test('the calendar date is the ZONE\'s date, not UTC\'s', () => {
    // 2026-01-06 23:30 UTC is already Jan 7 in Seoul (UTC+9).
    const instant = nowAt('UTC', 2026, 1, 6, 23, 30);
    expect(instantToYMD(instant, 'Asia/Seoul')).toEqual({ year: 2026, month: 1, day: 7 });
    expect(instantToYMD(instant, 'UTC')).toEqual({ year: 2026, month: 1, day: 6 });
  });

  test('stable across a DST fall-back day', () => {
    const zone = 'America/New_York';
    const instant = nowAt(zone, 2026, 11, 1, 12, 0); // the 25-hour day
    expect(instantToYMD(instant, zone)).toEqual({ year: 2026, month: 11, day: 1 });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest src/domain/__tests__/datetime.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement** — append to `src/domain/datetime.ts`:

```ts
/** The zone-correct calendar date of an instant — the inverse of resolveArrivalInstant's date path. */
export function instantToYMD(instantMs: number, zone: string): YMD {
  const d = DateTime.fromMillis(instantMs, { zone });
  return { year: d.year, month: d.month, day: d.day };
}
```

- [ ] **Step 4: Run to verify green** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/datetime.ts src/domain/__tests__/datetime.test.ts
git commit -m "feat(domain): instantToYMD — zone-correct inverse for the arrival picker"
```

### Task 22: `WheelPicker.tsx` — one scroll-snapping, tappable, typeable column

**Files:**
- Create: `src/ui/components/WheelPicker.tsx`

No jest harness for components — gated by tsc + device QA. Full implementation:

- [ ] **Step 1: Implement**

```tsx
// src/ui/components/WheelPicker.tsx
import { useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, fonts, spacing } from '../theme';

const ITEM_H = 44;
const VISIBLE_ROWS = 5; // odd, so one row sits exactly centred
const PAD_H = ((VISIBLE_ROWS - 1) / 2) * ITEM_H;

type Props = {
  /** Display label per grid slot (e.g. '0'…'23' or '00','05',…'55'). */
  items: string[];
  /** Selected grid index. An off-grid value keeps the wheel at this index and overrides the text. */
  index: number;
  /** Shown in the centre slot instead of items[index] (e.g. a typed ':47'). */
  overrideLabel?: string | null;
  onChange: (index: number) => void;
  /** Commit of the centre TextInput (raw digits). Parent parses/clamps. */
  onSubmitText: (text: string) => void;
};

/**
 * One wheel column, "scroll + tap" (spec): scroll snaps to the grid; tapping a
 * NON-centred row selects it; tapping the CENTRED value swaps it for a numeric
 * TextInput. Taps live on the items INSIDE the ScrollView (the ScrollView is
 * their ancestor, so a drag that starts on any row — centre included — is
 * stolen by the scroll as usual; a sibling overlay would dead-zone it). An
 * off-grid override is display-only until the next scroll snaps back.
 */
export function WheelPicker({ items, index, overrideLabel, onChange, onSubmitText }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState('');
  // Distinguish user scrolls from our own scrollTo (which must not re-fire onChange).
  const isProgrammatic = useRef(false);

  // Keep the wheel positioned on the selected index whenever it changes from
  // outside (open/seed, typed commit). animated:false → no momentum events.
  useEffect(() => {
    isProgrammatic.current = true;
    scrollRef.current?.scrollTo({ y: index * ITEM_H, animated: false });
    // scrollTo with animated:false emits no momentum-end; release the flag next tick.
    const id = setTimeout(() => {
      isProgrammatic.current = false;
    }, 50);
    return () => clearTimeout(id);
  }, [index, items.length]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isProgrammatic.current) return;
    const raw = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const next = Math.min(items.length - 1, Math.max(0, raw));
    if (next !== index || overrideLabel != null) onChange(next); // a scroll also clears an off-grid override
  };

  const commitText = () => {
    setIsEditing(false);
    if (text) onSubmitText(text);
  };

  return (
    <View style={styles.column}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentOffset={{ x: 0, y: index * ITEM_H }}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onMomentumScrollEnd={settle}
        // A drag that ends dead-on a snap point emits no momentum phase (Android);
        // settle() is idempotent so handling both events is safe.
        onScrollEndDrag={settle}
      >
        <View style={{ height: PAD_H }} />
        {items.map((label, i) => (
          <Pressable
            key={label}
            style={styles.item}
            onPress={() => {
              if (i === index) {
                setText('');
                setIsEditing(true); // tap the centred number → type an exact value
              } else {
                onChange(i); // tap any other row → select it (the effect scrolls to it)
              }
            }}
          >
            <Text style={[styles.itemText, i === index && !overrideLabel && styles.itemTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
        <View style={{ height: PAD_H }} />
      </ScrollView>

      {/* Centre slot overlay: hairlines, the off-grid value, and the edit input.
          Touch-transparent except while editing — taps reach the items below. */}
      <View pointerEvents={isEditing ? 'auto' : 'none'} style={styles.centerBand}>
        <View style={styles.hairline} />
        {isEditing ? (
          <TextInput
            style={styles.centerInput}
            value={text}
            onChangeText={(v) => setText(v.replace(/[^0-9]/g, '').slice(0, 2))}
            keyboardType="number-pad"
            maxLength={2}
            autoFocus
            selectTextOnFocus
            onBlur={commitText}
            onSubmitEditing={commitText}
          />
        ) : (
          <View style={styles.centerSlot}>
            {overrideLabel != null ? <Text style={styles.centerOverride}>{overrideLabel}</Text> : null}
          </View>
        )}
        <View style={styles.hairline} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { height: ITEM_H * VISIBLE_ROWS, flex: 1 },
  scroll: { flex: 1 },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { color: colors.disabledText, fontSize: 20, fontFamily: fonts.clock },
  itemTextActive: { color: colors.ink, fontSize: 24 },
  centerBand: {
    position: 'absolute',
    top: PAD_H,
    left: 0,
    right: 0,
    height: ITEM_H,
    justifyContent: 'space-between',
  },
  hairline: { height: 1.5, backgroundColor: colors.line, marginHorizontal: spacing.s },
  centerSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // An off-grid value paints OVER the (nearest-grid) item behind it.
  centerOverride: {
    color: colors.ink,
    fontSize: 24,
    fontFamily: fonts.clock,
    backgroundColor: colors.skyBgBottom,
    paddingHorizontal: spacing.m,
  },
  centerInput: {
    flex: 1,
    textAlign: 'center',
    color: colors.ink,
    fontSize: 24,
    fontFamily: fonts.clock,
    backgroundColor: colors.skyBg,
    padding: 0,
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/WheelPicker.tsx
git commit -m "feat(ui): WheelPicker — snap-scrolling, tappable, typeable column"
```

### Task 23: `ArrivalPickerSheet.tsx` — the unified sheet

**Files:**
- Modify: `src/ui/components/ArrivalPickerSheet.tsx` (full rewrite), `src/ui/screens/ChainScreen.tsx:314-319` (props), `src/i18n/en.ts` / `ko.ts` (arrivalPicker keys)

- [ ] **Step 1: i18n (both catalogs)** — `arrivalPicker` becomes:

```ts
// ko.ts
  arrivalPicker: {
    title: '언제까지 도착해야 하나요?',
    subtitle: '도착 날짜와 시간만 정하면 나머지는 거꾸로 계산해 드려요.',
    dateSection: '도착 날짜',
    timeSection: '도착 시간',
    wheelHint: '✎ 굴리거나 직접 입력',
  },
```
```ts
// en.ts
  arrivalPicker: {
    title: 'When do you need to arrive?',
    subtitle: 'Set the arrival date and time — we’ll plan the rest backwards.',
    dateSection: 'Arrival date',
    timeSection: 'Arrival time',
    wheelHint: '✎ Scroll or type',
  },
```

The 오늘 badge reuses the existing `day.same-day` key ('오늘'/'today'). Run `npx jest src/i18n` → PASS.

- [ ] **Step 2: Rewrite the sheet**

Invariants preserved from the current component (documented at ArrivalPickerSheet.tsx:29-36, 49-75): `minimumDate` floored to **start of today**, not now (a passed today-time stays pickable and rolls visibly); state re-seeds during RENDER on the `visible` flip, keyed on `visible` only; the iOS date-picker handlers are identity-stable via a `latest` ref (ChainScreen re-renders every 60s). Android uses the one-shot imperative dialog (no mounted component → no re-seed hazard at all).

```tsx
// src/ui/components/ArrivalPickerSheet.tsx
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateTime } from 'luxon';

import { YMD, instantToYMD } from '../../domain';
import { i18n, t } from '../../i18n';
import { colors, fonts, radii, shadows, spacing } from '../theme';
import { WheelPicker } from './WheelPicker';

export type ArrivalDate = YMD;

type Props = {
  visible: boolean;
  /** The current arrival instant (or `nowMs` before one exists) — the sheet opens on it. */
  initialInstant: number;
  /** The chain zone (single-zone app: equals the device zone by reconcileAndRoll). */
  zone: string;
  onCancel: () => void;
  onConfirm: (date: ArrivalDate, hour: number, minute: number) => void;
};

const MINUTE_STEP = 5;
const HOURS = Array.from({ length: 24 }, (_, h) => String(h));
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, '0'));
const pad2 = (n: number) => String(n).padStart(2, '0');

const toArrivalDate = (d: Date): ArrivalDate => ({
  // Device-zone getters are correct here: the app is single-zone by design.
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
});

// Floored to start of day, NOT to now: today + an already-passed time must
// stay pickable — it resolves to a past instant and rolls to tomorrow visibly.
const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const sameYMD = (a: YMD, b: YMD) => a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * Arrival picker (marker-pills spec): ONE sheet on both platforms — a date row
 * (📅 + 오늘 state badge) opening the native date picker, and a custom
 * hour/minute wheel that can also be typed into. 취소/설정 commit model.
 */
export function ArrivalPickerSheet({ visible, initialInstant, zone, onCancel, onConfirm }: Props) {
  const seed = DateTime.fromMillis(initialInstant, { zone });
  const [ymd, setYmd] = useState<YMD>(() => instantToYMD(initialInstant, zone));
  const [hour, setHour] = useState(seed.hour);
  const [minute, setMinute] = useState(seed.minute);
  const [iosDateOpen, setIosDateOpen] = useState(false);
  const insets = useSafeAreaInsets();

  // Re-seed during RENDER on the visible flip (not in an effect — see the old
  // component's rationale); keyed on `visible` only so a mid-scroll re-render
  // can't reset the wheel under the user.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const d = DateTime.fromMillis(initialInstant, { zone });
      setYmd(instantToYMD(initialInstant, zone));
      setHour(d.hour);
      setMinute(d.minute);
      setIosDateOpen(false);
    }
  }

  // Identity-stable handler for the native pickers (ChainScreen re-renders
  // every 60s; a fresh closure each render must not reach the native module).
  // []-deps is sufficient: the handler touches only setState, no props.
  const onNativeDate = useCallback((e: DateTimePickerEvent, d?: Date) => {
    setIosDateOpen(false);
    if (e.type === 'set' && d) setYmd(toArrivalDate(d));
    // 'dismissed' just closes the date step; the sheet itself stays open.
  }, []);

  const openDatePicker = () => {
    const value = new Date(ymd.year, ymd.month - 1, ymd.day);
    if (Platform.OS === 'android') {
      // One-shot dialog — nothing stays mounted, so the old re-seed hazard is gone.
      DateTimePickerAndroid.open({ value, mode: 'date', minimumDate: startOfToday(), onChange: onNativeDate });
    } else {
      setIosDateOpen((open) => !open);
    }
  };

  const todayBadge = sameYMD(ymd, toArrivalDate(new Date()));
  const dateText = DateTime.fromObject(ymd)
    .setLocale(i18n.locale)
    .toLocaleString({ year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });

  const isOffGrid = minute % MINUTE_STEP !== 0;
  const minuteIndex = Math.min(MINUTES.length - 1, Math.floor(minute / MINUTE_STEP));

  const submitHourText = (text: string) => setHour(Math.min(23, Math.max(0, Number(text))));
  const submitMinuteText = (text: string) => setMinute(Math.min(59, Math.max(0, Number(text))));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.sheet, { paddingBottom: spacing.xxl + 2 + insets.bottom }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('arrivalPicker.title')}</Text>
        <Text style={styles.subtitle}>{t('arrivalPicker.subtitle')}</Text>

        <Text style={styles.sectionLabel}>{t('arrivalPicker.dateSection')}</Text>
        <Pressable style={styles.dateRow} onPress={openDatePicker}>
          <Text style={styles.dateIcon}>📅</Text>
          <Text style={styles.dateText}>{dateText}</Text>
          {todayBadge ? (
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>{t('day.same-day')}</Text>
            </View>
          ) : null}
        </Pressable>
        {Platform.OS === 'ios' && iosDateOpen ? (
          <DateTimePicker
            value={new Date(ymd.year, ymd.month - 1, ymd.day)}
            mode="date"
            display="inline"
            minimumDate={startOfToday()}
            onChange={onNativeDate}
          />
        ) : null}

        <Text style={styles.sectionLabel}>{t('arrivalPicker.timeSection')}</Text>
        <View style={styles.wheels}>
          <WheelPicker items={HOURS} index={hour} onChange={setHour} onSubmitText={submitHourText} />
          <Text style={styles.wheelColon}>:</Text>
          <WheelPicker
            items={MINUTES}
            index={minuteIndex}
            overrideLabel={isOffGrid ? pad2(minute) : null}
            onChange={(i) => setMinute(i * MINUTE_STEP)}
            onSubmitText={submitMinuteText}
          />
        </View>
        <Text style={styles.wheelHint}>{t('arrivalPicker.wheelHint')}</Text>

        <View style={styles.actions}>
          <Pressable style={styles.cancel} onPress={onCancel}>
            <Text style={styles.cancelText}>{t('editor.cancel')}</Text>
          </Pressable>
          <Pressable style={styles.confirmWrap} onPress={() => onConfirm(ymd, hour, minute)}>
            <LinearGradient
              colors={[colors.sky500, colors.sky700]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.confirm}
            >
              <Text style={styles.confirmText}>{t('editor.set')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.skyBgBottom,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.m,
    paddingBottom: spacing.xxl + 2,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: spacing.l },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.extra, marginHorizontal: 2 },
  subtitle: { color: colors.ink2, fontSize: 12, fontFamily: fonts.semi, marginHorizontal: 2, marginTop: spacing.xs, marginBottom: spacing.l },

  sectionLabel: { color: colors.ink2, fontSize: 11, fontFamily: fonts.extra, letterSpacing: 1, marginBottom: spacing.s },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s + 2,
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 13,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m + 1,
    marginBottom: spacing.l,
  },
  dateIcon: { fontSize: 16 },
  dateText: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  todayBadge: { backgroundColor: colors.skyBg, borderRadius: radii.pill, paddingVertical: 3, paddingHorizontal: 8 },
  todayBadgeText: { color: colors.sky700, fontSize: 10, fontFamily: fonts.extra },

  wheels: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  wheelColon: { color: colors.ink, fontSize: 24, fontFamily: fonts.clock },
  wheelHint: { color: colors.faint, fontSize: 11, fontFamily: fonts.bold, textAlign: 'center', marginTop: spacing.s, marginBottom: spacing.l },

  actions: { flexDirection: 'row', gap: spacing.s + 2 },
  cancel: { flex: 1, borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center', backgroundColor: colors.disabledBg },
  cancelText: { color: colors.disabledText, fontSize: 15, fontFamily: fonts.extra },
  confirmWrap: { flex: 2, borderRadius: radii.pill, ...shadows.button },
  confirm: { borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center' },
  confirmText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
});
```

- [ ] **Step 3: ChainScreen call site (`:314-319`)**

```tsx
      <ArrivalPickerSheet
        visible={pickerOpen}
        initialInstant={chain.arrival ?? nowMs}
        zone={zone}
        onCancel={() => setPickerOpen(false)}
        onConfirm={onConfirmArrival}
      />
```

(`onConfirmArrival` at `:149-153` is unchanged — it already takes `(date, hour, minute)` and resolves via `resolveArrivalInstant`.)

- [ ] **Step 4: Verify + commit** — `npx tsc --noEmit` → clean. `npx jest src` → ALL PASS.

```bash
git add src/ui/components/ArrivalPickerSheet.tsx src/ui/components/WheelPicker.tsx src/ui/screens/ChainScreen.tsx src/i18n/en.ts src/i18n/ko.ts
git commit -m "feat(ui): unified arrival picker — date row + typeable time wheel on both platforms"
```

# Phase 6 — Final verification + device QA

### Task 24: full gates, i18n audit, self-review

- [ ] **Step 1: The two required gates**

```bash
npm test          # every suite green
npx tsc --noEmit  # clean
```

- [ ] **Step 2: i18n key audit** — the full delta must match the spec table exactly:

```bash
grep -n "newBadge\|bedtime\|warnRowGone\|typeSection\|hintNone" src/i18n/*.ts   # → no matches
grep -rn "chainStarts\|warnFieldsDropped\|kindSection\|hintEvent\|wheelHint\|dateSection\|timeSection\|start-passed" src/i18n/*.ts | wc -l   # → 16 (8 keys × 2 catalogs)
grep -rn "t('chainScreen.bedtime'\|t('preset.newBadge'\|warnRowGone" src   # → no matches
```

- [ ] **Step 3: dead-symbol sweep** — `grep -rn "PillPatch\|PillInput\|DEFAULT_NEW_PILL" src` → no matches; `grep -rn "pillStyle.none\|pillStyle\['none'\]" src` → no matches.

- [ ] **Step 4: Commit anything the audit shook out, then the branch is code-complete.**

### Task 25: device QA checklist (manual — gestures/dialogs/native can't run in jest)

Record results in the PR description. Android first (the native alarm path), then iOS.

**Migration (safety-critical — test with a real v0.3.0 install, then upgrade-in-place):**
- [ ] Arm the seed chain on the v0.3.0 build, note the exact alarm time, install this build over it: chain shows split rows (수면 event + ⏰ 수면 종료), armed chip still shows, alarm time UNCHANGED, alarm actually rings.
- [ ] Presets saved on v0.3.0 open with split rows; summary counts events only.
- [ ] Disarm right after upgrade (before opening anything else) → relaunch → no ghost armed chip.

**Editor:**
- [ ] Create sheet: 종류 on top; picking 알림/알람 collapses the fields below it (control never jumps); toggling back within the session restores the typed name/duration.
- [ ] Editing an event → pick 알람 → warning line 이모지·이름·시간은 지워져요 shows → 저장 → row becomes a bare ⏰ marker.
- [ ] Opening that marker again seeds a blank 🧥/''/0:15 draft; switching to 이벤트 gives a fresh event (no resurrection).
- [ ] ＋ 추가 appends before 📍 도착 for all three kinds.

**Chain + reorder:**
- [ ] Start row reads "{프리셋명} 시작 · M/D HH:MM"; falls back to 현재 일정 시작 with no preset; NEW badge gone.
- [ ] Marker first in chain: labelled "{프리셋명} 시작", arm allowed, native alarm label matches on the ring screen.
- [ ] Two ⏰ back-to-back: both rows render, both fire at the same instant.
- [ ] Drag a marker across events in 순서 변경 — label re-derives after the drop; 총 준비 시간 ignores markers.

**Arrival picker:**
- [ ] Opens on the current arrival (date + time); 오늘 badge only when the date is today.
- [ ] Android date row → system dialog (min today); iOS → inline calendar.
- [ ] Wheel scroll snaps to 5-min grid; tapping the centre → keyboard; typing 47 shows :47 in the slot; scrolling after snaps back to the grid.
- [ ] 취소 discards, 설정 commits; a today+passed time rolls to tomorrow visibly (date labels).

**Alarm pipeline:**
- [ ] Arm with a 🔔 marker ~2 min out: push arrives titled "🔔 {label}" (no 종료 duplication).
- [ ] Ring screen: label = "수면 종료" (or "{프리셋} 시작" for an orphan), 출발까지 chip counts to the last EVENT's start.
- [ ] Disarm cancels everything; re-arm reschedules.

### Execution handoff

Plan complete. Two execution options:
1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks (superpowers:subagent-driven-development).
2. **Inline Execution** — execute tasks in this session with checkpoints (superpowers:executing-plans).





