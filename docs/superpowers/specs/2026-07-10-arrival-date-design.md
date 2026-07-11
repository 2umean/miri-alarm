# Arrival Date & Visible Day — Design Spec

**Date:** 2026-07-10 · **Target:** v0.3 · **Status:** approved for planning

## 1. Problem

Two intertwined complaints from on-device use of v0.2.0:

1. **"Is this alarm today or tomorrow?"** — no date is shown anywhere before arming.
   Worse, the chain *silently* auto-rolls: the minute the first alarm instant
   passes, `rollChainToFuture` moves every time to tomorrow with zero visual cue.
2. **No date control** — the arrival picker is time-only; the app decides the day
   ("soonest future occurrence"), and the user can't express "arrival on 7/12".

Plus a semantics gap: because rollover and the `past-event` arm-blocker key on the
**first** alarm, a chain whose first alarm just passed can no longer be armed for
*today* — even when later alarms and the arrival are still ahead. The user's
requirement: **passed alerts are skipped; the remaining ones arm.**

## 2. Locked decisions (user-confirmed 2026-07-10)

| # | Decision |
|---|----------|
| D1 | Arrival is picked as an **explicit date + time**. Native pickers only: Android = system date dialog → system time dialog; iOS = existing sheet with the wheel in `datetime` mode. Minimum date = today. |
| D2 | Dates render as **numeric month/day — `7/10`** (no 오늘/내일 words, no weekday). |
| D3 | The date is shown **always**, on: the 📍 arrival anchor row AND every ⏰ alarm / 🔔 push event row. (Pill duration cards and the 🛏 bedtime cap are unchanged.) |
| D4 | Auto-roll is kept but re-keyed: the chain rolls to the next day **when the arrival instant passes** — not when the first alarm passes. Rolling stays visible via D3. |
| D5 | Arming keys on the **last alarm**: `past-event` blocks only when *no alarm instant is still in the future*. At arm time, already-passed alarms/pushes are skipped (the schedulers already filter); the remaining future ones are scheduled. |

Worked timeline (chain ⏰ 07:45 · ⏰ 08:30 · 📍 09:00 on 7/10):

- **08:00** — chain still shows 7/10; armable. Arming schedules only the 08:30
  alarm; 07:45 is skipped.
- **08:45** — chain still shows 7/10; arm is **blocked** (`past-event`: nothing
  left that can ring). The list remains visible for the commute.
- **09:01** — arrival passed → chain rolls to 7/11, all rows visibly dated 7/11;
  the block clears.

## 3. Data model

**No change.** `Chain.arrival` stays a plain epoch-ms instant; `zone` unchanged.
Only *resolution* (picker passes an explicit date) and *interpretation*
(rollover/validation keying) change. Stored drafts, presets, and the armed
snapshot are untouched — no migration.

## 4. Domain changes

### 4.1 `chainRollover.ts` — roll on arrival

`rollChainToFuture(chain, nowMs)` returns the chain unchanged while
`chain.arrival > nowMs`. Once `arrival <= nowMs`, advance the arrival by whole
calendar days **in the chain's zone** (wall-clock preserved, DST-safe — same
mechanism as today) until `arrival > nowMs`. The bulk jump
(`floor((nowMs − arrival) / DAY_MS)`) plus the small fine-tune loop stay, but the
predicate becomes the arrival itself instead of `primaryEventInstant`.

> **Amended (review fix, commit 94477b1):** shipped as `floor`, not the `ceil`
> this spec first wrote. `floor` can never overshoot past a 25h DST fall-back day
> (which `ceil` could, skipping a valid arrival); any undershoot is picked up by
> the additive fine-tune loop that follows.

Consequences:

- After a roll, *early* alerts of very long chains may still land in the past
  (e.g. a bedtime push 25h before a just-rolled arrival). That is consistent by
  design: past alerts are skippable everywhere (D5).
- `reconcileAndRoll` (hydration) and the `useChain` minute-tick need no code
  change — they call `rollChainToFuture` and inherit the new keying.

### 4.2 `chainValidation.ts` — past-event keys on the last alarm

Replace the primary-instant check with:

- Let `lastAlarm` = max `endAt` over items with `pill.type === 'alarm'`
  (compute from the already-built `computed`, not via `latestAlarmInstant`,
  to keep the single `computeChain` pass).
- `past-event` is issued when the chain **has alarm pills** and
  `lastAlarm <= nowMs`.
- Alarm-less chains never get `past-event` — they are already blocked by
  `no-alarm`, and stacking both banners tells the user nothing new.
- `bedtime-passed` (non-blocking nudge, keyed on `computed.start`) is unchanged,
  except it can no longer be shadowed by an early `past-event`: emit it whenever
  `computed.start <= nowMs` and `past-event` was **not** issued.

`BLOCKING` list is unchanged (`past-event` remains blocking).

### 4.3 `chainEngine.ts` — retire the primary-instant pair

`primaryInstantFromComputed` / `primaryEventInstant` lose their last consumers
(rollover → arrival, validation → last alarm, armed summary → next alarm, below).
Delete both functions, their tests, their barrel exports, and the long
"anchor on the earliest alarm" doc comment — its rationale is superseded by D4/D5.
`latestAlarmInstant` stays (armed-liveness in `useArmingChain` still uses it).

### 4.4 Armed summary shows the next upcoming ring

`ChainScreen`'s `armedInfo` currently labels the armed chip with the *first*
alarm — which can be a skipped past alarm under D5. New rule: the first alarm
item with `endAt > nowMs`; if none (last ring just passed, snapshot about to
expire), fall back to the latest alarm. The ring-date chip (`formatAlarmDate`)
keeps using that same instant.

## 5. Arrival picker

Signature change: `onConfirm(date: {year, month, day}, hour: number, minute: number)`.
`ChainScreen.onConfirmArrival` calls the **existing** explicit-date branch of
`resolveArrivalInstant(hour, minute, zone, nowMs, date)` (no domain change needed)
and still disarms first (`disarmForEdit`), exactly as today.

**Android** — two chained system dialogs, no custom UI:

1. `DateTimePicker mode="date"` (default calendar display), `minimumDate` = today
   in the device zone, seeded with the current arrival's date.
2. On OK → `DateTimePicker mode="time"` spinner (`is24Hour`), seeded with the
   current arrival's time.
3. On OK → `onConfirm`. **Cancel at either step aborts the whole edit** (no
   half-applied date). The component holds the step in local state; dismissing
   resets to step 1 for the next open.

**iOS** — the existing bottom sheet, wheel switched to `mode="datetime"` with the
same `minimumDate`. One wheel, one 설정 button — flow otherwise unchanged.

**Past time on today's date:** the date dialog can't offer past days
(`minimumDate`), but today + a passed time resolves to a past instant. No special
casing: the arrival is then `<= now`, so the chain immediately rolls to tomorrow
(D4) — same outcome as the old time-only picker, but now visible through the date
labels. Not worth a warning state.

## 6. Display

### 6.1 `formatMonthDay(instantMs, zone): string`

New helper in `ui/format.ts`: luxon in the chain zone, `'M/d'` → `7/10`.
Numeric and locale-neutral (KO reads 7/10 naturally; EN too) — **no i18n key**.

### 6.2 `ChainList`

- **Anchor row (📍 도착 시간):** date before the time — `7/12  09:00`. The date
  is smaller and fainter than the time (e.g. `fontSize` ~12, `colors.ink2`,
  `fonts.clock`), so the clock stays dominant. (Amended by review: shipped as
  `colors.ink` — `ink2` on the amber anchor is only 2.2:1. Event-row dates do use
  `colors.ink2`, ~3.8:1 on the bubble.)
- **Event rows (⏰/🔔):** same treatment before the end-time clock:
  `수면 종료  [알람]   7/12 07:45`. Rendered unconditionally (D3).
- Rows need no `nowMs` and no conditional logic — pure function of the computed
  instants + zone, so `ChainList` stays presentational.

### 6.3 Unchanged

The armed header date chip (`formatAlarmDate`, "내일 · 7월 11일 (금)") stays: it
describes the *armed snapshot*, complements the always-on M/D labels, and its
relative wording was not part of this request.

## 7. i18n

- **`chainIssue.past-event` copy must change.** It now appears in the "alarms all
  passed, arrival still ahead" window, where the current KO "이미 지난
  일정이에요." is wrong (the schedule hasn't passed — the alarms have).
  Proposed (user may reword): KO `울릴 알람 시각이 모두 지났어요.` / EN
  `All alarm times have already passed.`
- `arrivalPicker.title/subtitle` (iOS sheet) unchanged — still accurate.
- No other new strings.

## 8. Edge cases

| Case | Behavior |
|------|----------|
| DST spring-forward/fall-back on the roll day | Roll steps are whole calendar days in `chain.zone` via luxon (existing mechanism); nonexistent local times resolve forward, ambiguous to the earlier offset (existing policy). |
| Device zone change (flight) | `reconcileAndRoll` rewrites `zone` then rolls — inherits arrival keying; labels always format in `chain.zone`. |
| Arrival picked days ahead | Fully supported; nothing rolls until that arrival passes. The 26h `chain-too-long` span cap concerns pill durations only and is unaffected. |
| Chain with no alarm pills | `no-alarm` blocks arming (unchanged); `past-event` never stacks on top (4.2); rollover still keys on arrival so the display never goes stale. |
| All alarms past, arrival ahead, already **armed** | Untouched by this change: armed liveness keys on the last alarm (`useArmingChain`), and the armed snapshot is independent of the working chain. |
| 0-duration pills sharing an instant | Ordering within `computed.items` is preserved; date labels are per-item formatting, no uniqueness assumptions. |
| Preset apply / live mirror | Presets store pills only; arrival (and its date) is global and untouched by preset operations — no interaction. |

## 9. Testing

**Unit (jest, domain/format only — UI stays tsc + device-verified):**

- `chainRollover`: arrival future → identity (referential); arrival just passed →
  next day, wall clock kept; ancient arrival → single bulk jump lands future;
  DST-transition day keeps wall clock; alarm-passed-but-arrival-future → **no
  roll** (the new invariant).
- `chainValidation`: matrix over {first alarm passed / all alarms passed / none
  passed} × {has alarms / alarm-less} → `past-event` exactly when alarms exist
  and all passed; `bedtime-passed` nudge preserved; alarm-less → `no-alarm` only.
- `resolveArrivalInstant`: explicit-date path (already exists — extend with a
  passed-instant-today case documenting that it returns the past instant).
- `formatMonthDay`: zone-aware M/D, single-digit month/day, across-midnight.

**Device QA:**

1. Pick 7/12 09:00 via both pickers (Android two-dialog flow incl. cancel at each
   step; iOS datetime wheel) → anchor shows `7/12 09:00`, event rows dated.
2. The §2 worked timeline: arm at "08:00" (past first alarm) → only future alarms
   ring; at "08:45" arm blocked with the new copy; after "09:01" the chain shows
   tomorrow's dates.
3. Relaunch after arrival passed → hydration rolls once, visibly.
4. Midnight-crossing chain shows split dates (bedtime rows today, wake rows
   tomorrow).

## 10. Out of scope

- Relative day words (오늘/내일) anywhere new — D2 chose numeric M/D.
- Weekday display, custom picker UI, quick "today/tomorrow" chips (descoped with
  the native-picker decision).
- Recurring/weekly schedules; multiple simultaneous chains.
- Any change to the armed snapshot model or native alarm module.
