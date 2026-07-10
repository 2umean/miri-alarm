# Arrival Date & Visible Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explicit date+time arrival picking, always-on `M/D` date labels on the anchor and alert rows, rollover re-keyed to the arrival instant, and past-event re-keyed to the last alarm so passed alerts are skipped and remaining ones arm.

**Architecture:** Pure-domain changes first (rollover keying, validation keying, a new `upcomingAlarmItem` selector), then the two retired primary-instant functions are deleted once their last consumer (the armed summary) moves over. UI lands last: a `formatMonthDay` helper, the two-step native picker, and date labels in `ChainList`. No storage or data-model change — `Chain.arrival` stays epoch ms.

**Tech Stack:** React Native 0.81 / Expo SDK 56, luxon, `@react-native-community/datetimepicker`, jest (node env, domain/format only — UI components are tsc + device-verified).

**Spec:** `docs/superpowers/specs/2026-07-10-arrival-date-design.md` (D1–D5 decision table + worked timeline).

**Environment for every command:** `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` first (node 22 lives there on this Mac). Repo root: `/Users/umean/Documents/dev/agent/miri-alarm`.

---

### Task 1: Rollover keys on the arrival instant

**Files:**
- Modify: `src/domain/chainRollover.ts` (whole file below)
- Test: `src/domain/__tests__/chainRollover.test.ts` (whole file below)

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/arrival-date main
```

- [ ] **Step 2: Rewrite the test file** — the old tests key on `primaryEventInstant`; the new keying is the arrival itself. Replace `src/domain/__tests__/chainRollover.test.ts` entirely with:

```ts
import { DateTime } from 'luxon';

import { rollChainToFuture } from '../chainRollover';
import { Chain, Pill, PillType } from '../pill';

const at = (zone: string, y: number, mo: number, d: number, h: number, mi: number) =>
  DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi }, { zone }).toMillis();

const pill = (id: string, dur: number, type: PillType = 'none'): Pill => ({
  id,
  icon: '⬜',
  name: id,
  dur,
  type,
});

const arrivalLocal = (c: Chain) => DateTime.fromMillis(c.arrival!, { zone: c.zone });

// arrival 09:00; the alarm pill ends at 09:00 − 35 (commute) = 08:25.
const base = (zone: string, d: number): Chain => ({
  arrival: at(zone, 2026, 1, d, 9, 0),
  zone,
  pills: [pill('sleep', 420, 'alarm'), pill('commute', 35)],
});

test('no arrival → identity', () => {
  const c: Chain = { arrival: null, zone: 'UTC', pills: [pill('a', 30, 'alarm')] };
  expect(rollChainToFuture(c, Date.UTC(2026, 0, 6))).toBe(c);
});

test('a non-finite arrival → identity (defensive, NaN must not roll)', () => {
  const c: Chain = { arrival: Number.NaN, zone: 'UTC', pills: [pill('a', 30, 'alarm')] };
  expect(rollChainToFuture(c, Date.UTC(2026, 0, 6))).toBe(c);
});

test('a future arrival is returned unchanged (identity)', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 6, 7, 0); // morning, everything ahead
  expect(rollChainToFuture(c, now)).toBe(c);
});

test('alarms passed but arrival still ahead → NO roll (the v0.3 invariant)', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 6, 8, 30); // alarm end 08:25 passed; arrival 09:00 ahead
  expect(rollChainToFuture(c, now)).toBe(c); // referential identity — today's chain stays
});

test('an arrival that just passed rolls the whole chain to the next day', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 6, 9, 30); // after arrival 09:00
  const rolled = rollChainToFuture(c, now);
  expect(arrivalLocal(rolled).day).toBe(7);
  expect(arrivalLocal(rolled).toFormat('HH:mm')).toBe('09:00');
  expect(rolled.arrival!).toBeGreaterThan(now);
});

test('arrival exactly == now still rolls forward (strictly future)', () => {
  const c = base('UTC', 6);
  const now = c.arrival!;
  const rolled = rollChainToFuture(c, now);
  expect(rolled.arrival!).toBeGreaterThan(now);
  expect(arrivalLocal(rolled).day).toBe(7);
});

test('an arrival several days in the past advances by as many whole days as needed', () => {
  const c = base('UTC', 6);
  const now = at('UTC', 2026, 1, 9, 12, 0); // 3 days + 3 h past the arrival
  const rolled = rollChainToFuture(c, now);
  expect(rolled.arrival!).toBeGreaterThan(now);
  expect(arrivalLocal(rolled).toFormat('HH:mm')).toBe('09:00');
  expect(arrivalLocal(rolled).day).toBe(10);
});

test('pills are untouched by the roll (same reference)', () => {
  const c = base('UTC', 6);
  const rolled = rollChainToFuture(c, at('UTC', 2026, 1, 6, 9, 30));
  expect(rolled.pills).toBe(c.pills);
});

test('rolled arrival stays minute-aligned', () => {
  const c = base('UTC', 6);
  const rolled = rollChainToFuture(c, at('UTC', 2026, 1, 6, 9, 30));
  expect(rolled.arrival! % 60_000).toBe(0);
});

test('rolling across a spring-forward day preserves the wall-clock arrival time', () => {
  // US Eastern spring-forward 2026-03-08 (02:00 → 03:00). arrival 12:00 on 03-07;
  // now just after that arrival → roll to 03-08 12:00 despite the 23-hour day.
  const zone = 'America/New_York';
  const c: Chain = {
    arrival: at(zone, 2026, 3, 7, 12, 0),
    zone,
    pills: [pill('sleep', 420, 'alarm'), pill('commute', 60)],
  };
  const now = at(zone, 2026, 3, 7, 12, 30);
  const rolled = rollChainToFuture(c, now);
  const local = arrivalLocal(rolled);
  expect(local.day).toBe(8);
  expect(local.toFormat('HH:mm')).toBe('12:00'); // same wall-clock
  expect(rolled.arrival!).toBeGreaterThan(now);
});
```

- [ ] **Step 3: Run the tests to verify the new ones fail**

Run: `npx jest src/domain/__tests__/chainRollover.test.ts`
Expected: FAIL — 'alarms passed but arrival still ahead' gets a rolled chain (old keying rolls on the 08:25 alarm), and the 'just passed' tests use times the old predicate treats differently.

- [ ] **Step 4: Rewrite `src/domain/chainRollover.ts`** — whole file:

```ts
import { DateTime } from 'luxon';

import { MINUTE_MS } from './schedule';
import { Chain } from './pill';

const DAY_MS = 24 * 60 * MINUTE_MS;
/** Cap on the DST fine-tune loop — the bulk jump lands within ~1 day of `now`. */
const MAX_FINE_TUNE_STEPS = 5;

/**
 * Advance the chain's arrival forward to its next future occurrence — in whole
 * calendar days within the captured zone, so the wall-clock arrival time is
 * preserved and each step is DST-safe — until the ARRIVAL instant is strictly
 * after `nowMs`.
 *
 * v0.3 (arrival-date spec D4): the roll keys on the arrival anchor itself, NOT
 * on any alarm instant. A chain whose alarms have already passed but whose
 * arrival is still ahead stays on today — past alerts are skippable at arm
 * time (alarmPlan/chainPushAlerts filter them), and the remaining future ones
 * must stay armable. Only once the arrival itself has passed does the day
 * flip. Returns the input unchanged (referential identity, so callers can
 * memoize) while the arrival is future or absent.
 */
export function rollChainToFuture(chain: Chain, nowMs: number): Chain {
  // Non-finite guard: a NaN anchor must never be "advanced" into more NaN.
  if (chain.arrival == null || !Number.isFinite(chain.arrival)) return chain;
  if (chain.arrival > nowMs) return chain;

  // Jump most of the gap at once (ceil → the minimal whole-day advance), then
  // fine-tune for DST unevenness (a 23h day can under-shoot) or an exact tie.
  const approxDays = Math.ceil((nowMs - chain.arrival) / DAY_MS);
  let arrival = DateTime.fromMillis(chain.arrival, { zone: chain.zone })
    .plus({ days: approxDays })
    .toMillis();
  // Defensive: an invalid zone would make luxon return NaN here. Zones are
  // validated at the storage boundary (draftChain), so this shouldn't trigger —
  // but never propagate a NaN anchor into the derived alarm times.
  if (!Number.isFinite(arrival)) return chain;

  for (let i = 0; arrival <= nowMs && i < MAX_FINE_TUNE_STEPS; i += 1) {
    arrival = DateTime.fromMillis(arrival, { zone: chain.zone }).plus({ days: 1 }).toMillis();
  }
  return { ...chain, arrival };
}
```

- [ ] **Step 5: Run the rollover tests**

Run: `npx jest src/domain/__tests__/chainRollover.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Run the full suite** — hydration (`reconcileAndRoll`) and `useChain` inherit the keying; nothing else should break.

Run: `npx jest`
Expected: PASS. (If a `smoke.test.ts` or hydrate test asserts old rolling of an alarm-passed chain, update its expectation to the new invariant — the chain stays until arrival passes.)

- [ ] **Step 7: Commit**

```bash
git add src/domain/chainRollover.ts src/domain/__tests__/chainRollover.test.ts
git commit -m "feat(domain): roll the chain on its arrival instant, not the first alarm"
```

---

### Task 2: past-event keys on the last alarm (+ banner copy)

**Files:**
- Modify: `src/domain/chainValidation.ts:44-56` (the computed/primary block)
- Modify: `src/i18n/ko.ts` (`chainIssue['past-event']`), `src/i18n/en.ts` (`chainIssue['past-event']`)
- Test: `src/domain/__tests__/chainValidation.test.ts`

- [ ] **Step 1: Update the tests.** In `src/domain/__tests__/chainValidation.test.ts`, DELETE this test:

```ts
test('a passed primary event blocks arming', () => {
  const now = at(ZONE, 2026, 6, 30, 8, 0); // after wake 07:30
  const issues = validateChain(hero(), now);
  expect(kinds(issues)).toContain('past-event');
  expect(isChainArmable(issues)).toBe(false);
});
```

and ADD these three in its place (note: the hero's single alarm ends at 09:00 − (20+15+35) = 07:50):

```ts
test('a passed FIRST alarm does not block arming while a later alarm remains (past alerts are skipped)', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [pill('wake', 420, 'alarm'), pill('gap', 30), pill('backup', 15, 'alarm')],
  };
  // wake ends 08:15; backup (last pill) ends at the arrival 09:00.
  const now = at(ZONE, 2026, 6, 30, 8, 30); // wake passed, backup ahead
  const issues = validateChain(c, now);
  expect(kinds(issues)).not.toContain('past-event');
  expect(isChainArmable(issues)).toBe(true);
  expect(kinds(issues)).toContain('bedtime-passed'); // start long past — the nudge survives
});

test('past-event blocks arming once ALL alarms have passed, even with the arrival ahead', () => {
  const now = at(ZONE, 2026, 6, 30, 8, 0); // hero's only alarm ended 07:50; arrival 09:00 ahead
  const issues = validateChain(hero(), now);
  expect(kinds(issues)).toContain('past-event');
  expect(kinds(issues)).not.toContain('bedtime-passed'); // past-event supersedes the nudge
  expect(isChainArmable(issues)).toBe(false);
});

test('an alarm-less chain past its arrival reports no-alarm but never past-event', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [pill('p', 30, 'push'), pill('x', 60)],
  };
  const now = at(ZONE, 2026, 6, 30, 10, 0); // arrival passed
  const issues = validateChain(c, now);
  expect(kinds(issues)).toContain('no-alarm');
  expect(kinds(issues)).not.toContain('past-event');
  expect(isChainArmable(issues)).toBe(false);
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx jest src/domain/__tests__/chainValidation.test.ts`
Expected: FAIL — the first-alarm-passed case gets `past-event` under the old keying.

- [ ] **Step 3: Re-key the check.** In `src/domain/chainValidation.ts`, replace this block:

```ts
  // Compute the chain once; reuse it for both the anchor check and the
  // primary/bedtime gates (primaryInstantFromComputed avoids a second build).
  const computed = computeChain(chain);
  if (!computed) {
    issues.push({ kind: 'no-arrival' });
  } else {
    const primary = primaryInstantFromComputed(computed);
    if (primary <= nowMs) {
      issues.push({ kind: 'past-event' });
    } else if (computed.start <= nowMs) {
      issues.push({ kind: 'bedtime-passed' });
    }
  }
```

with:

```ts
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
```

and shrink the import at the top of the file (`primaryInstantFromComputed` is no longer used here):

```ts
import { computeChain, totalSpanMinutes } from './chainEngine';
```

Also update the docstring for the `past-event` kind in the `ChainValidationIssue` type:

```ts
  | { kind: 'past-event' } // every alarm instant has passed — nothing left that can ring
```

- [ ] **Step 4: Update the banner copy** (the old copy is wrong in the new "alarms passed, arrival ahead" window). In `src/i18n/ko.ts`, `chainIssue`:

```ts
    'past-event': '울릴 알람 시각이 모두 지났어요.',
```

In `src/i18n/en.ts`, `chainIssue`:

```ts
    'past-event': 'All alarm times have already passed.',
```

- [ ] **Step 5: Run the validation tests, then the full suite**

Run: `npx jest src/domain/__tests__/chainValidation.test.ts && npx jest`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add src/domain/chainValidation.ts src/domain/__tests__/chainValidation.test.ts src/i18n/ko.ts src/i18n/en.ts
git commit -m "feat(domain): past-event blocks arming only when the last alarm has passed"
```

---

### Task 3: `upcomingAlarmItem` selector

**Files:**
- Modify: `src/domain/chainEngine.ts` (append one function)
- Test: `src/domain/__tests__/chainEngine.test.ts` (append one describe)

- [ ] **Step 1: Write the failing tests.** Append to `src/domain/__tests__/chainEngine.test.ts` (and add `upcomingAlarmItem` to the existing `../chainEngine` import):

```ts
describe('upcomingAlarmItem', () => {
  const zone = 'UTC';
  // wake ends 09:00 − (30+15) = 08:15; backup is the last pill → ends at 09:00.
  const twoAlarms = (): Chain => ({
    arrival: at(zone, 2026, 6, 30, 9, 0),
    zone,
    pills: [pill('wake', 420, 'alarm'), pill('gap', 30), pill('backup', 15, 'alarm')],
  });

  test('before any alarm: the first alarm', () => {
    const r = computeChain(twoAlarms())!;
    expect(upcomingAlarmItem(r, at(zone, 2026, 6, 30, 8, 0))!.pill.id).toBe('wake');
  });

  test('after the first alarm: the next future one', () => {
    const r = computeChain(twoAlarms())!;
    expect(upcomingAlarmItem(r, at(zone, 2026, 6, 30, 8, 30))!.pill.id).toBe('backup');
  });

  test('after all alarms: falls back to the last one', () => {
    const r = computeChain(twoAlarms())!;
    expect(upcomingAlarmItem(r, at(zone, 2026, 6, 30, 9, 30))!.pill.id).toBe('backup');
  });

  test('no alarm pills → null', () => {
    const r = computeChain({
      arrival: at(zone, 2026, 6, 30, 9, 0),
      zone,
      pills: [pill('p', 30, 'push')],
    })!;
    expect(upcomingAlarmItem(r, at(zone, 2026, 6, 30, 8, 0))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/domain/__tests__/chainEngine.test.ts`
Expected: FAIL — `upcomingAlarmItem` is not exported.

- [ ] **Step 3: Implement.** Append to `src/domain/chainEngine.ts`:

```ts
/**
 * The alarm item the user should be watching: the FIRST alarm still in the
 * future — else the LAST alarm (a fully-elapsed chain, e.g. an armed snapshot
 * about to expire) — else null when the chain has no alarm pills. The armed
 * summary uses this instead of the earliest alarm, which may already have
 * passed and been skipped at arm time (v0.3 arrival-date spec).
 */
export function upcomingAlarmItem(computed: ChainComputed, nowMs: number): ComputedItem | null {
  const alarms = computed.items.filter((it) => it.pill.type === 'alarm');
  if (alarms.length === 0) return null;
  return alarms.find((it) => it.endAt > nowMs) ?? alarms[alarms.length - 1];
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/domain/__tests__/chainEngine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/chainEngine.ts src/domain/__tests__/chainEngine.test.ts
git commit -m "feat(domain): add upcomingAlarmItem selector"
```

---

### Task 4: Armed summary tracks the next upcoming alarm

**Files:**
- Modify: `src/ui/screens/ChainScreen.tsx` (imports + the `armedInfo` memo)

No jest coverage (UI is tsc + device-verified).

- [ ] **Step 1: Switch the import.** In the `../../domain` import block of `src/ui/screens/ChainScreen.tsx`, replace `primaryInstantFromComputed` with `upcomingAlarmItem`:

```ts
import {
  ChainValidationIssue,
  computeChain,
  resolveArrivalInstant,
  toLocalClock,
  upcomingAlarmItem,
} from '../../domain';
```

- [ ] **Step 2: Replace the `armedInfo` memo** (currently finds the item whose `endAt` equals the primary instant):

```ts
  // Armed snapshot summary (primary event label/time + the ring date chip).
  const armedInfo = useMemo(() => {
    if (!armed) return null;
    const c = computeChain(armed);
    if (!c) return null;
    const primary = primaryInstantFromComputed(c);
    const item = c.items.find((it) => it.endAt === primary);
    return {
      label: item ? t('chainScreen.eventEnds', { name: item.pill.name }) : '',
      time: toLocalClock(primary, armed.zone),
      date: formatAlarmDate(primary, nowMs, armed.zone),
    };
  }, [armed, nowMs]);
```

becomes:

```ts
  // Armed snapshot summary: the NEXT alarm still to ring (an already-passed
  // alarm was skipped at arm time or has fired — advertising its dead time
  // would repeat the today-or-tomorrow confusion this feature removes).
  const armedInfo = useMemo(() => {
    if (!armed) return null;
    const c = computeChain(armed);
    if (!c) return null;
    const item = upcomingAlarmItem(c, nowMs);
    if (!item) return null; // unreachable for a real armed chain (arm gate requires an alarm)
    return {
      label: t('chainScreen.eventEnds', { name: item.pill.name }),
      time: toLocalClock(item.endAt, armed.zone),
      date: formatAlarmDate(item.endAt, nowMs, armed.zone),
    };
  }, [armed, nowMs]);
```

- [ ] **Step 3: Type-check and run the suite**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/ChainScreen.tsx
git commit -m "fix(ui): armed summary tracks the next upcoming alarm"
```

---

### Task 5: Retire `primaryEventInstant` / `primaryInstantFromComputed`

**Files:**
- Modify: `src/domain/chainEngine.ts` (delete two functions + their doc comments)
- Test: `src/domain/__tests__/chainEngine.test.ts` (drop the primary describe, keep `latestAlarmInstant` coverage)

- [ ] **Step 1: Confirm there are no remaining consumers**

Run: `grep -rn "primaryEventInstant\|primaryInstantFromComputed" src/ --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v "chainEngine.ts"`
Expected: no output. (If anything prints, that consumer was missed — stop and fix it first.)

- [ ] **Step 2: Delete from `src/domain/chainEngine.ts`:** the whole `primaryInstantFromComputed` function with its long "goes live / anchors on the STRONG alarm" doc comment, and the whole `primaryEventInstant` convenience wrapper with its comment. Keep `latestAlarmInstant` (still used by `useArmingChain`) and the new `upcomingAlarmItem`.

- [ ] **Step 3: Rework the tests.** In `src/domain/__tests__/chainEngine.test.ts`: remove `primaryEventInstant` from the import; delete the entire `describe('primaryEventInstant', …)` block; add this standalone describe so `latestAlarmInstant` keeps its coverage (the two tests previously lived inside the deleted block):

```ts
describe('latestAlarmInstant', () => {
  test('returns the last alarm end (a multi-alarm chain stays armed until the last fires)', () => {
    const zone = 'UTC';
    const c: Chain = {
      arrival: at(zone, 2026, 6, 30, 9, 0),
      zone,
      pills: [pill('wake', 420, 'alarm'), pill('gap', 30), pill('backup', 15, 'alarm')],
    };
    // wake ends 09:00 − (30+15) = 08:15; backup is the last pill so it ends AT arrival 09:00.
    expect(clock(latestAlarmInstant(c)!, zone)).toBe('09:00');
  });

  test('is null with no alarm pills', () => {
    const c: Chain = {
      arrival: at('UTC', 2026, 6, 30, 9, 0),
      zone: 'UTC',
      pills: [pill('p', 30, 'push')],
    };
    expect(latestAlarmInstant(c)).toBeNull();
  });

  test('is null before an arrival exists', () => {
    expect(latestAlarmInstant({ arrival: null, zone: 'UTC', pills: [] })).toBeNull();
  });
});
```

- [ ] **Step 4: Type-check and full suite** (the barrel `export *` needs no edit — the names simply vanish)

Run: `npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/chainEngine.ts src/domain/__tests__/chainEngine.test.ts
git commit -m "refactor(domain): retire primaryEventInstant/primaryInstantFromComputed"
```

---

### Task 6: `formatMonthDay` helper

**Files:**
- Modify: `src/ui/format.ts` (append one function)
- Test: `src/ui/__tests__/format.test.ts` (append tests; extend the import)

- [ ] **Step 1: Write the failing tests.** In `src/ui/__tests__/format.test.ts`, add `formatMonthDay` to the `../format` import and append:

```ts
test('formatMonthDay renders numeric M/d (no zero padding) in the given zone', () => {
  expect(formatMonthDay(at(6, 9, 0), 'UTC')).toBe('1/6');
  // 2026-01-06 23:30 UTC is already the next day in Seoul — the zone decides the day.
  expect(formatMonthDay(at(6, 23, 30), 'Asia/Seoul')).toBe('1/7');
  expect(
    formatMonthDay(
      DateTime.fromObject({ year: 2026, month: 12, day: 31, hour: 8 }, { zone: 'UTC' }).toMillis(),
      'UTC',
    ),
  ).toBe('12/31');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/ui/__tests__/format.test.ts`
Expected: FAIL — `formatMonthDay` is not exported.

- [ ] **Step 3: Implement.** Append to `src/ui/format.ts`:

```ts
/** Numeric month/day in the chain zone — `7/10`. Deliberately locale-neutral
 *  (spec D2: no 오늘/내일 words, no weekday), so it needs no i18n key. */
export function formatMonthDay(instantMs: number, zone: string): string {
  return DateTime.fromMillis(instantMs, { zone }).toFormat('M/d');
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/ui/__tests__/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/format.ts src/ui/__tests__/format.test.ts
git commit -m "feat(ui): add formatMonthDay helper"
```

---

### Task 7: Date+time arrival picker (two-step Android, datetime iOS) + wiring

The `onConfirm` signature changes, so the sheet and its `ChainScreen` caller land in ONE commit to keep tsc green.

**Files:**
- Modify: `src/ui/components/ArrivalPickerSheet.tsx` (whole file below)
- Modify: `src/ui/screens/ChainScreen.tsx` (`onConfirmArrival`)
- Test: `src/domain/__tests__/datetime.test.ts` (append one test documenting the past-instant contract)

- [ ] **Step 1: Add the contract test.** Append to `src/domain/__tests__/datetime.test.ts`:

```ts
test('an explicit date with a passed time returns that past instant (rollover advances it downstream)', () => {
  const now = nowAt('UTC', 2026, 1, 6, 9, 0);
  const ms = resolveArrivalInstant(8, 0, 'UTC', now, { year: 2026, month: 1, day: 6 });
  expect(ms).toBeLessThan(now);
  expect(DateTime.fromMillis(ms, { zone: 'UTC' }).toFormat('yyyy-MM-dd HH:mm')).toBe('2026-01-06 08:00');
});
```

Run: `npx jest src/domain/__tests__/datetime.test.ts` — expected: PASS immediately (the explicit-date branch already skips the roll-forward; this test pins the contract the picker relies on).

- [ ] **Step 2: Replace `src/ui/components/ArrivalPickerSheet.tsx`** entirely with:

```tsx
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { colors, fonts, radii, shadows, spacing } from '../theme';

export type ArrivalDate = { year: number; month: number; day: number };

type Props = {
  visible: boolean;
  /** Seed date+time shown when the picker opens. */
  initial: Date;
  onCancel: () => void;
  onConfirm: (date: ArrivalDate, hour: number, minute: number) => void;
};

const toArrivalDate = (d: Date): ArrivalDate => ({
  // Device-zone getters are correct here: the app is single-zone by design
  // (reconcileAndRoll pins chain.zone to the device zone on every hydration).
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
});

/**
 * Arrival date+time picker (v0.3 arrival-date spec D1). Android chains the two
 * SYSTEM dialogs — date calendar, then time spinner — with no custom UI;
 * cancelling either step aborts the whole edit. iOS keeps the bottom sheet with
 * the wheel in `datetime` mode. Both constrain to today-or-later.
 */
export function ArrivalPickerSheet({ visible, initial, onCancel, onConfirm }: Props) {
  const [value, setValue] = useState<Date>(initial);
  const [step, setStep] = useState<'date' | 'time'>('date');
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const insets = useSafeAreaInsets();

  // The sheet stays mounted (visible toggles), so re-seed the wheel and reset
  // the Android two-step state machine on each open. Keyed on `visible` only —
  // not `initial` — so scrolling while open isn't reset out from under the user.
  useEffect(() => {
    if (visible) {
      setValue(initial);
      setStep('date');
      setPickedDate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (Platform.OS === 'android') {
    if (!visible) return null;
    if (step === 'date') {
      return (
        <DateTimePicker
          value={initial}
          mode="date"
          minimumDate={new Date()}
          onChange={(e: DateTimePickerEvent, d?: Date) => {
            if (e.type === 'set' && d) {
              setPickedDate(d);
              setStep('time');
            } else onCancel(); // cancel at either step aborts the whole edit
          }}
        />
      );
    }
    return (
      <DateTimePicker
        value={initial}
        mode="time"
        is24Hour
        display="spinner"
        onChange={(e: DateTimePickerEvent, d?: Date) => {
          if (e.type === 'set' && d && pickedDate) {
            onConfirm(toArrivalDate(pickedDate), d.getHours(), d.getMinutes());
          } else onCancel();
        }}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.sheet, { paddingBottom: spacing.xxl + 2 + insets.bottom }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('arrivalPicker.title')}</Text>
        <Text style={styles.subtitle}>{t('arrivalPicker.subtitle')}</Text>
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={value}
            mode="datetime"
            minimumDate={new Date()}
            display="spinner"
            onChange={(_e, d?: Date) => d && setValue(d)}
          />
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.cancel} onPress={onCancel}>
            <Text style={styles.cancelText}>{t('editor.cancel')}</Text>
          </Pressable>
          <Pressable
            style={styles.confirmWrap}
            onPress={() => onConfirm(toArrivalDate(value), value.getHours(), value.getMinutes())}
          >
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
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: spacing.l,
  },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.extra, marginHorizontal: 2 },
  subtitle: {
    color: colors.ink2,
    fontSize: 12,
    fontFamily: fonts.semi,
    marginHorizontal: 2,
    marginTop: spacing.xs,
    marginBottom: spacing.l,
  },
  pickerWrap: { alignItems: 'center', marginBottom: spacing.l },
  actions: { flexDirection: 'row', gap: spacing.s + 2 },
  cancel: {
    flex: 1,
    borderRadius: radii.pill,
    paddingVertical: spacing.l - 1,
    alignItems: 'center',
    backgroundColor: colors.disabledBg,
  },
  cancelText: { color: colors.disabledText, fontSize: 15, fontFamily: fonts.extra },
  confirmWrap: { flex: 2, borderRadius: radii.pill, ...shadows.button },
  confirm: { borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center' },
  confirmText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
});
```

- [ ] **Step 3: Rewire `ChainScreen`.** In `src/ui/screens/ChainScreen.tsx`, replace `onConfirmArrival` and its comment:

```tsx
  // The picker is time-only and no date is shown before arming, so the only
  // reading a pick can have is "the next HH:mm" — resolve to the soonest future
  // occurrence. Pinning to the current anchor's day instead would silently keep
  // a rollover-chosen "tomorrow" (e.g. the seeded default after ~07:45) and arm
  // a day late. If today's occurrence is infeasible, rollChainToFuture advances it.
  const onConfirmArrival = (hour: number, minute: number) => {
    disarmForEdit();
    setArrival(resolveArrivalInstant(hour, minute, zone, nowMs, date));
    setPickerOpen(false);
  };
```

(the current body reads `resolveArrivalInstant(hour, minute, zone, nowMs)` — the whole block above becomes:)

```tsx
  // The picker returns an explicit date+time (spec D1). A today-date pick with
  // an already-passed time resolves to a past instant on purpose — the chain
  // then rolls to tomorrow visibly via the date labels (spec §5), matching the
  // old time-only behavior without a special warning state.
  const onConfirmArrival = (date: { year: number; month: number; day: number }, hour: number, minute: number) => {
    disarmForEdit();
    setArrival(resolveArrivalInstant(hour, minute, zone, nowMs, date));
    setPickerOpen(false);
  };
```

No change to the `<ArrivalPickerSheet …>` JSX — its `onConfirm={onConfirmArrival}` prop now matches the new signature.

- [ ] **Step 4: Type-check and full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/ArrivalPickerSheet.tsx src/ui/screens/ChainScreen.tsx src/domain/__tests__/datetime.test.ts
git commit -m "feat(ui): arrival picker takes an explicit date (two-step Android, datetime iOS)"
```

---

### Task 8: Always-on M/D labels on the anchor and alert rows

**Files:**
- Modify: `src/ui/components/ChainList.tsx`

No jest coverage (presentational; tsc + device-verified).

- [ ] **Step 1: Import and thread the formatter.** In `src/ui/components/ChainList.tsx`, extend the format import:

```ts
import { formatDuration, formatMonthDay } from '../format';
```

In the `ChainList` body, next to the existing `clock` helper, add:

```ts
  const monthDay = (ms: number) => formatMonthDay(ms, zone);
```

Pass it to each row: `<PillRow key={item.pill.id} item={item} clock={clock} monthDay={monthDay} onPress={…} />`, and add `monthDay: (ms: number) => string;` to `PillRow`'s props (both the destructuring and the inline type).

- [ ] **Step 2: Anchor row.** In the anchor `Pressable`, insert the date before the time (spec D3: always shown):

```tsx
      <Pressable style={styles.anchor} onPress={onPressAnchor}>
        <Text style={styles.anchorIcon}>📍</Text>
        <Text style={styles.anchorLabel}>{t('chainScreen.anchorLabel')}</Text>
        <Text style={styles.anchorDate}>{monthDay(computed.arrival)}</Text>
        <Text style={styles.anchorTime}>{clock(computed.arrival)}</Text>
      </Pressable>
```

(`monthDay` is in scope in `ChainList`, where the anchor renders.)

- [ ] **Step 3: Event rows.** In `PillRow`'s event-row block, insert the date between the spacer and the time:

```tsx
            <View style={styles.eventSpacer} />
            <Text style={styles.eventDate}>{monthDay(item.endAt)}</Text>
            <Text style={[styles.eventTime, { color: sx.eventTime }]}>{clock(item.endAt)}</Text>
```

- [ ] **Step 4: Styles.** Add to the `StyleSheet.create` block (date smaller + fainter than the clock, which stays dominant):

```ts
  eventDate: { color: colors.faint, fontSize: 11, fontFamily: fonts.clock },
```

and next to the anchor styles:

```ts
  anchorDate: { color: colors.ink2, fontSize: 12, fontFamily: fonts.clock },
```

- [ ] **Step 5: Type-check and full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/ChainList.tsx
git commit -m "feat(ui): always-on M/D date labels on anchor and alert rows"
```

---

### Task 9: Final verification + device QA checklist

- [ ] **Step 1: Full gates**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc clean; all suites pass (baseline was 188 tests; this plan adds ~12 and removes ~7 — expect ≈193, exact count from the run).

- [ ] **Step 2: Whole-branch review** — diff `main...feat/arrival-date` against the spec's D1–D5 table and §4–§7. Every spec section must map to a commit.

- [ ] **Step 3: On-device QA checklist** (local release build; document pass/fail per item):

1. Tap 📍 on Android: system calendar (past days disabled) → OK → system time spinner → OK → anchor shows `7/12  09:00` with the date visibly smaller. Cancel at the calendar: nothing changes. Cancel at the time spinner: nothing changes.
2. iOS: one datetime wheel in the sheet; 설정 applies date+time; 취소 keeps the old arrival.
3. Every ⏰/🔔 event row shows its M/D date always, including today.
4. Midnight-crossing chain (bedtime tonight, arrival tomorrow): early rows dated today, wake/arrival rows dated tomorrow.
5. Worked timeline (set a chain with two alarms + near arrival): after the FIRST alarm passes → still today, arm enabled; arming rings only the remaining alarm. After ALL alarms pass → arm disabled with the new "울릴 알람 시각이 모두 지났어요." banner, chain still shows today. After the ARRIVAL passes → chain visibly flips to tomorrow's date, banner clears.
6. Armed chip: arm past the first alarm → the armed summary names the LATER alarm, not the passed one.
7. Pick today's date with a passed time → chain lands on tomorrow, visibly dated.
8. Relaunch after the arrival passed → chain hydrates already rolled, dates correct.

- [ ] **Step 4: Hand off to superpowers:finishing-a-development-branch** (present merge options; do NOT push without the user's say-so).
