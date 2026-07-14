# Marker pills, arrival picker, start row — design

Date: 2026-07-14
Source design: `MIRI Alarm UI.dc.html` (Claude Design project `11546e25-bada-4439-b772-b96f0bef7c9d`)

## Why

Four changes, requested against the published design:

1. **Separate alert/alarm from normal events.** Today a single `Pill` carries `icon`, `name`, `dur`, and a `type` saying what fires when it *ends*. So `😴 수면 / 420분 / type:'alarm'` **is** the wake alarm — the alarm is an attribute of the sleep event. The user wants them split: a plain `수면` event **followed by** a bare `⏰` pill that can be placed after any event.
2. **A dedicated arrival picker** with a date row (defaults to today, tap to adjust) and a scrollable time wheel that can also be typed into.
3. **The chain's start row** shows when the whole preset starts, replacing the `취침` (bedtime) cap.
4. **Drop the `NEW` badge** next to the preset chip.

Everything else in the design (onboarding permission gates, arm/disarm, safety banners, presets, reorder screen, emoji quick-picks, the ring screen's `🚪 출발까지 N분` chip) is already built. Scope is these four deltas only.

## The design document contradicts itself — resolved here

The design's own `Chain.dc.html` script implements *today's* model: pills carry `{icon,name,dur,type}` and the 🔔/⏰ row is **derived**, rendered right after its own pill, labelled `p.name + ' 종료'`.

But screens **5C/5D** show the editor with emoji/name/duration hidden and copy reading "**앞** 이벤트가 끝나는 지점에… 필요한 곳에 **옮겨** 보세요" — which only makes sense if the marker is its own draggable pill.

This spec takes the second reading (it is what was asked for). Consequently **two design screens are stale and are not implemented as drawn**:

- **3A (create sheet)** — draws emoji + name + duration *and* a type selector together. Replaced (see "Editor sheets").
- **4A (reorder screen)** — draws 🔔/⏰ as *badges on event rows*, with no marker rows to drag. But dragging the marker onto a different event is the entire point of the change. Replaced (see "ReorderView").

## Domain model (v3)

`type` remains the discriminator — it is literally what the editor's segmented control sets — but `Pill` becomes a union.

```ts
// src/domain/pill.ts
export type PillType = 'none' | 'push' | 'alarm';

export type EventPill = {
  id: string;
  type: 'none';
  icon: string;   // emoji
  name: string;   // user-facing, free text
  dur: Minutes;   // whole minutes, [0, MAX_PILL_MINUTES]
};

export type MarkerPill = {
  id: string;
  type: 'push' | 'alarm';   // no icon, no name, no dur
};

export type Pill = EventPill | MarkerPill;

export const isEventPill  = (p: Pill): p is EventPill  => p.type === 'none';
export const isMarkerPill = (p: Pill): p is MarkerPill => p.type !== 'none';

/** The one seam. A marker occupies zero minutes. */
export const pillDur = (p: Pill): Minutes => (isEventPill(p) ? p.dur : 0);
```

`Chain` is unchanged: `{ arrival: number | null; zone: string; pills: Pill[] }`.

### Why `pillDur` is the whole engine change

`computeChain` swaps `pill.dur` → `pillDur(pill)` and everything else falls out:

- A marker gets `startAt === endAt` = the preceding item's end — which is exactly its fire time.
- A marker at index 0 (no preceding event) lands on `computed.start`. **No special case in the engine.**
- `ChainComputed.start`, `latestAlarmFromComputed`, `upcomingAlarmItem` are otherwise untouched.

Same substitution in `chainValidation.totalSpanMinutes` and `preset.presetSummary`.

### Derived marker labels

A marker stores no name. Its label is computed from position:

```ts
// src/domain/markerLabel.ts
/** Nearest EventPill before `index`, skipping other markers. Null if none. */
export function labelSourceFor(pills: Pill[], index: number): EventPill | null;
```

Callers resolve it through i18n:

- **has a preceding event** → `t('chainScreen.eventEnds', { name })` → `수면 종료`
- **orphan (index 0, or only markers before it)** → the chain's start label → `평일 아침 시작`

This single derivation feeds four consumers — the chain row, `NativeAlarm.label` (the ring screen), the push notification title, and the armed summary chip (`chainScreen.armedSummary: '✓ 알람 설정됨 · {{label}} {{time}}'`, whose `label` came from `pill.name`) — so **no Kotlin/Swift changes are needed**. The native contract (`NativeAlarm { id, at, label, leaveAt }`) is preserved exactly.

The start label needs the active preset's name, which lives in `PresetLibrary`, not `Chain`. `ChainScreen` already has it. Thread it as one string:

```ts
AlarmService.armChain(chain, startLabel)     // startLabel e.g. "평일 아침 시작"
  → planNativeAlarms(computed, nowMs, startLabel)
  → scheduleChainPush(chain, computed, alarmIds, startLabel)
```

When no preset is active the name falls back to `t('preset.current')` → `현재 일정 시작`.

## Behaviour decisions

| Case | Decision |
|---|---|
| Marker first in the chain (no preceding event) | **Allowed.** Fires at `computed.start`; labelled `{프리셋명} 시작`. Nothing is rejected, no drag springs back. |
| Two identical markers back-to-back | **Allowed, no special handling.** Both schedule, both fire at the same instant. Self-inflicted, visually obvious, trivially undone. No validation rule, no de-dupe. |
| Marker immediately before `📍 도착` | Allowed. Fires exactly at the arrival instant. |
| Marker between two markers | Label scans back past them to the nearest event. |
| Armed chain during upgrade | **Stays armed.** See Migration. |

## Editor sheets

One sheet for create and edit (as today), with the segmented control **moved to the top**.

The design draws it at the bottom (5A/5C). That breaks: choosing 알림 collapses the emoji/name/duration *above* it, so the control jumps up under the user's finger. At the top, the inputs simply collapse below it.

### Copy change: 없음 → 이벤트

`없음` only made sense when the type was an *attribute of an event*. Now that it **is** the kind, the control reads:

```
종류
[ 이벤트 ] [ 🔔 알림 ] [ ⏰ 알람 ]
```

replacing `타입 — 이벤트가 끝나면?`. Same control, same three values, in both the create and edit sheets.

### The toggle is lossy — the guard

Picking 알림 on an event discards its `icon`, `name`, and `dur`. The sheet mitigates this:

- The sheet holds a **full local draft** (`icon`, `name`, `dur`, `type`) regardless of the selected type. Toggling within one sheet session is **free** — the fields are hidden, not destroyed.
- The discard commits only on **저장**: `type === 'none'` persists an `EventPill`; otherwise a `MarkerPill` (fields dropped).
- Opening an **existing marker** seeds a blank draft (`🧥`, `''`, `0:15`). So 알림 → 이벤트 gives a fresh event to fill in, not a resurrection of something that was never stored.
- A warning line (replacing `warnRowGone`) shows when an event is about to become a marker: **이모지·이름·시간은 지워져요.**

### Marker hint copy

Per design 5C/5D, name-free:

- push: `🔔 앞 이벤트가 끝나는 지점에 알림이 따로 떠요 — 필요한 곳에 옮겨 보세요.`
- alarm: `⏰ 앞 이벤트가 끝나는 지점에 강한 알람이 따로 울려요 — 필요한 곳에 옮겨 보세요.`

### Add flow

The single dashed button becomes **`＋ 추가`** (from `＋ 이벤트 추가`). The create sheet's 종류 control picks what is being added; new pills append at the end, just before `📍 도착`, as today. Reorder to place a marker after a different event.

## Seed chain must ship pre-split

Today's seed makes `😴 수면` *be* the alarm. Under the new toggle, a curious user tapping 수면 and poking 알림 would delete 7 hours from their day. So the seed splits:

```ts
SEED_PILLS = [
  { icon: '😴', nameKey: 'pill.sleep',     dur: 420, type: 'none' },
  {                                                  type: 'alarm' },
  { icon: '🚿', nameKey: 'pill.shower',    dur: 20,  type: 'none' },
  { icon: '🍳', nameKey: 'pill.breakfast', dur: 20,  type: 'none' },
  { icon: '🚇', nameKey: 'pill.commute',   dur: 35,  type: 'none' },
];
```

With the default 09:00 arrival: 시작 00:45 · ⏰ 수면 종료 07:45 · 📍 도착 09:00 — matching design 2A's caption (`기본 체인 (수면 종료 07:45)`).

`PillSpec` becomes a union mirroring `Pill`. `materializePills` branches on `type`.

## Migration — three storage keys bump

| Key | v2 | v3 |
|---|---|---|
| draft | `schedularm.draft.v2` | `schedularm.draft.v3` |
| armed | `schedularm.armed.v2` | `schedularm.armed.v3` |
| presets | `schedularm.presets.v1` | `schedularm.presets.v2` |

There is no version envelope in the payloads — versioning lives entirely in the AsyncStorage key suffix. Follow the existing v1 pattern: read the legacy key, migrate, write the new key, clear the legacy key.

### The pill converter

```
for each v2 pill { id, icon, name, dur, type }:
  type === 'none'  →  [ { id, type: 'none', icon, name, dur } ]
  otherwise        →  [ { id, type: 'none', icon, name, dur },
                        { id: `${id}~m`, type } ]
```

**Every ring time is byte-identical.** The old pill fired at its own end; the new marker sits at zero duration immediately after the event, so it lands on that same instant. This is the property that makes the armed-state decision safe.

Applies to the draft chain, the armed snapshot, and the `pills` of every saved preset.

### Armed chains stay armed

MIRI is a safety alarm; an app update must never be why someone oversleeps. On upgrade:

- The armed snapshot migrates in place. Its computed alarm instants are unchanged.
- The **native alarm store is not touched**. Alarms already scheduled with the OS keep their ids and their times, and still ring.
- The next arm or disarm replaces the native set atomically — `scheduleAlarms` is documented as a full-set replace (`SchedularmAlarm.types.ts:6-8`), and `dismissAll()` is not id-keyed. So the transient id mismatch (`p1` in the native store vs `p1~m` in JS) is never observable.

## Validation

- `pill-out-of-range` checks **event pills only** — a marker has no duration to be out of range.
- `no-alarm` unchanged in spirit: blocks arming unless ≥1 pill has `type === 'alarm'`.
- `chain-too-long` uses `pillDur`.
- `bedtime-passed` → renamed **`start-passed`**. The kind and the i18n key both change; it stops referring to a bedtime that no longer exists as a concept.
- No new validation rules. Orphan markers and duplicate markers are legal (see Behaviour decisions).

## UI changes

### ChainList

- **Top row**: the `취침` cap is replaced by a **start row** — `{프리셋명} 시작 · M/D HH:MM`, muted, with the hollow-dot styling from the design's `Chain` component. Falls back to `현재 일정 시작` with no active preset.
- **Event rows**: unchanged (icon · name · H:MM).
- **Marker rows**: bordered 🔔/⏰ rows carrying the derived label, `M/D`, and the clock time. Reuses today's push/alarm "event row" styling (`pillStyle.push` / `pillStyle.alarm`), which already looks exactly like the design.
- **Anchor row**: unchanged.

`chainScreen.bedtime` is deleted from both catalogs; `colors.faint`'s "bedtime cap" comment moves with it.

### ReorderView

Markers become their own draggable rows. `ROW_H = 58` stays uniform for all kinds — the drag math is absolute-positioned and a shorter marker row is not free. The footer's `총 준비 시간` sums `pillDur`.

### ArrivalPickerSheet — rewritten

Today it is platform-forked (Android: two chained system dialogs with no cancel/confirm chrome; iOS: a `datetime` wheel sheet). The rewrite is one unified sheet on both platforms.

- **Title/subtitle**: `언제까지 도착해야 하나요?` / `도착 날짜와 시간만 정하면 나머지는 거꾸로 계산해 드려요.` (the code's current subtitle says 시간만 and must be updated — the design already fixed this).
- **도착 날짜 row**: `📅 2026. 7. 14. (화)`, with an `오늘` badge — a **state badge**, not a button — shown when the selected date is today. Tapping the row opens the native date picker (`@react-native-community/datetimepicker`, `mode="date"`, `minimumDate = startOfToday()`). The design's `✎ 직접 입력` hint is dropped: the date is not typed.
- **도착 시간 wheel**: custom, scroll + tap.
  - Hour column: 0–23, 1-step.
  - Minute column: 00/05/…/55, 5-step.
  - Tapping the centred number swaps it for a numeric `TextInput` so any exact minute can be entered.
  - An off-grid minute (e.g. `:47`, typed) renders in the centre slot; scrolling the wheel snaps back to the 5-minute grid.
  - Hint: `✎ 굴리거나 직접 입력`.
- **Buttons**: `취소` / `설정`.
- Invariants to preserve from the current component: `minimumDate` floored to **start of today** (not now), and ref-stabilized handlers — `ChainScreen` re-renders every 60s.

New extracted component: `src/ui/components/WheelPicker.tsx` (one scroll-snapping, tappable column).

### New domain helper

`src/domain/datetime.ts` has `YMD → instant` (`resolveArrivalInstant`) but **no inverse**. The picker must open on the current arrival, so add:

```ts
export function instantToYMD(instantMs: number, zone: string): YMD;
```

(Today `ArrivalPickerSheet` derives this ad-hoc on a JS `Date`.)

### ChainScreen

- Delete the `NEW` badge block and its styles; delete `preset.newBadge` from both catalogs.
- `chainScreen.addPill`: `＋ 이벤트 추가` → `＋ 추가`.
- `DEFAULT_NEW_PILL` becomes the editor sheet's default draft rather than a `Pill`.
- Pass `startLabel` into `armChain`.
- The start row needs `computed`, which is null before an arrival exists — guard accordingly.

### preset.ts

`presetSummary` skips markers: `icons`, `count`, and `totalMinutes` come from event pills only.

## State

`PillPatch = Partial<Pick<Pill, 'icon'|'name'|'dur'|'type'>>` cannot express a union. Replace the patch-based action with a whole-pill replacement:

```ts
| { type: 'update-pill'; id: string; next: Pill }
```

The editor sheet already holds a complete draft, so it dispatches the finished pill. This also removes the need for the reducer to know how to add/drop fields on a type flip — the sheet owns that.

`chainSanitize.sanitizePill` branches on the sanitized `type` and emits the correct union member. It is the shared boundary for draft **and** armed, and is the most fragile file in the change.

## i18n

Both catalogs move in lockstep — `catalogs.test.ts` asserts identical key sets **and** identical `{{placeholder}}` sets.

**Removed**: `preset.newBadge`, `chainScreen.bedtime`, `pillEditor.warnRowGone`.

**Renamed / re-worded**: `chainIssue.bedtime-passed` → `chainIssue.start-passed`; `chainScreen.addPill`; `arrivalPicker.subtitle`; `pillEditor.typeSection` → `pillEditor.kindSection` (`종류`); `pillEditor.hintNone` → `pillEditor.hintEvent`; `pillType.none`: `없음` → `이벤트`; `pillEditor.hintPush` / `hintAlarm` become name-free.

**Added**: `chainScreen.chainStarts` (`{{name}} 시작`), `pillEditor.warnFieldsDropped` (`이모지·이름·시간은 지워져요.`).

**Changed placeholder**: `alerts.pill.title` `🔔 {{name}} 종료` → `🔔 {{label}}` — the marker has no name, and the derived label already contains 종료 (or 시작). Both catalogs.

## Tests

Every pill-shaped test moves. Existing files that break: `alarmPlan.test.ts` (the only assertion on the native payload — the hard blocker), `chainEngine`, `chainValidation`, `chainRollover`, `chainMigration`, `preset`, `smoke`, `chainReducer`, `chainHydrate`, `presetsReducer`, `draftChain`, `armedChain`, `presets`, `catalogs`.

New tests required:

- **Migration is time-preserving**: a stored v2 `{😴 수면, dur 420, type 'alarm'}` under a fixed arrival produces the identical alarm instant after conversion. This is the safety-critical assertion.
- **Orphan marker**: a marker at index 0 computes to `computed.start` and takes the start label.
- **Duplicate markers**: two `alarm` markers after one event produce two `NativeAlarm`s at the same `at`.
- **`pillDur`**: markers contribute zero to `totalSpanMinutes` and `presetSummary`.
- **Editor conversion**: toggling type within a sheet session preserves the draft; saving as a marker drops the fields.

## Out of scope

- Native module changes (none needed — `NativeAlarm.label` survives via derivation).
- The emoji picker (design draws 7 quick-picks; code ships 6 + free input — leaving as is).
- Onboarding, arming, banners, presets, the ring screen — all already match the design.
