# Presets — design

Date: 2026-07-10
Status: awaiting review

Visual mockup: [MIRI Alarm UI (Claude design)](https://claude.ai/design/p/11546e25-bada-4439-b772-b96f0bef7c9d?file=MIRI+Alarm+UI.dc.html&via=share),
rows 08–11. The mockup is the source of truth for styling. Rows 01–07 depict
the app as already shipped and are **not** part of this feature. (Row 07's
third phone still draws the old `🛬 도착` chip; rows 08–10 supersede it — see
"Switcher chip" below.)

Key styling values (mapped to existing theme tokens; new hex noted):

| Element | Spec |
| --- | --- |
| Switcher chip | White pill (`bubble`), 1.5px `line` border, `radii.pill`, padding 7×13, `shadows.bubble`; name 13pt `extra` `ink`; ▾ 11pt `faint`. NEW badge beside it: `skyBg` bg, `sky700` text, 9pt `extra`, pill radius |
| Preset row | `bubble` bg, radius 16, padding 13×14, `shadows.bubble`; name 14.5pt `extra` `ink`; emoji strip 14pt (letter-spacing 1); summary 11.5pt bold `faint` |
| Active row mark | Trailing 24×24 circle, `sky500` bg, white ✓; non-active rows show a › chevron in `faint` (mockup uses #C2D4E8; mapped to the nearest token — no new one-off color) |
| Selected row | `skyBg` bg, 2px `sky500` border, `shadows.focus`-strength glow; trailing inline **불러오기** pill button (`sky500` bg, white 11pt `extra`) |
| ＋ 새 프리셋 row | 2px dashed `#A9CFF5`, radius 16, `sky700` 13.5pt `extra` — same recipe as the existing ＋ 이벤트 추가 button (hoist `#A9CFF5` into `theme.colors.dashed` and reuse in both) |
| Empty state | Centered 66×66 radius-20 `skyBg` tile with 🗂️ 30pt; title 16pt `extra` `ink`; body 12.5pt `semi` `ink2` (max-width ~248); CTA = full-width primary gradient pill (`sky500`→`sky700`) |
| Name/edit sheet | Bottom sheet, same chrome as `PillEditorSheet` (handle, `skyBgBottom`, radius 28); label 11pt `extra` `ink2` letter-spaced; name input `bubble` bg, 2px `sky500` border when focused; summary strip `skyBg` radius 13 (emoji strip + 12pt bold `ink2` text); actions: 🗑️ 삭제 `blushBg`/`red` flex 1 + 저장 gradient flex 2 |
| Delete confirm | Native `Alert.alert` (deliberate adaptation — the mockup draws a custom card; see Alternatives) |

## Problem

The app persists exactly one working schedule (the autosaved draft chain).
Users with more than one routine (평일 아침 / 주말 늦잠 / 헬스장 새벽 …) must
manually rebuild their event list every time it changes. Rows 08–11 of the
design add **presets**: named, saved event lists that can be created, applied,
renamed, and deleted, switched from a chip on the home screen.

## Decision summary (locked with the user)

- **Scope: presets only** (design rows 08–11). No changes to onboarding,
  chain editing, arming, or the native modules. The OS-native arrival time
  dialog stays (the row-02 custom wheel is out of scope).
- **A preset stores events only** — `pills`, never `arrival` or `zone`. The
  arrival anchor stays global on the working chain.
- **Live mirror (auto-save):** while a preset is active, every pill change on
  the home screen is written into it immediately. There is no save button and
  no dirty state.
- **Silent replace on apply:** applying a preset swaps the working pill list
  with no warning. (Nothing is lost when a preset is active — its edits were
  mirrored; the unlinked "현재 일정" case is accepted data loss per user
  decision.)
- **Always-in-a-preset (revised D3):** deleting the active preset activates
  and applies the **first remaining** preset. The unlinked **현재 일정** state
  exists only while `presets.length === 0` (first run, or after deleting the
  last preset — in which case the on-screen events remain as the unlinked
  working chain).
- **Two-step apply:** tapping a non-active row selects it (highlight + inline
  불러오기 button, per mockup); tapping 불러오기 commits and closes.
- **Delete confirm:** native `Alert.alert`, irreversible wording from the
  mockup.
- **Ordering:** insertion order, newest last. No manual reorder, no count cap.

## Data model — `src/domain/preset.ts` (new)

```ts
import { Pill } from './pill';

export type Preset = {
  id: string;   // stable, caller-supplied (hook mints) — same contract as Pill.id
  name: string; // user-facing, non-empty (trimmed)
  pills: Pill[];
};

export type PresetSummary = { count: number; totalMinutes: number; icons: string };
export function presetSummary(pills: Pill[]): PresetSummary;
// icons = pills.map(p => p.icon).join(''); totalMinutes = sum of durations.
```

Pill ids inside a preset keep their original values. Ids only need uniqueness
within one chain, and every layer treats pills as immutable (reducers copy on
write), so shared object references between a preset and the working chain —
or between two presets snapshotted from the same base — are safe.

## Persistence — `src/storage/presets.ts` (new)

One AsyncStorage payload under **`schedularm.presets.v1`** (internal keys keep
the `schedularm.*` convention per the rebrand decision):

```ts
type StoredPresets = { presets: Preset[]; activeId: string | null };
```

Boundary sanitizing on load, in the style of `chainSanitize`:

- Payload not a plain object → `null` (hook falls back to `{ presets: [], activeId: null }`).
- `presets` not an array → `[]`.
- Entry dropped if it is not a plain object or its `name` is not a non-empty
  trimmed string. `id`: non-empty string, else `preset-{index}`. Duplicate ids
  → keep the first. `pills` → the existing `sanitizePills`.
- `activeId`: must match a surviving preset's id, else `null`.

The existing draft-chain store (`schedularm.draft.v2`) is unchanged and remains
the source of truth for what is on screen. No migration is needed (new key).

## State

### `src/state/presetsReducer.ts` (new) — pure, mirrors `chainReducer`

```ts
export type PresetsState = { presets: Preset[]; activeId: string | null };

export type PresetsAction =
  | { type: 'hydrate'; state: PresetsState }
  | { type: 'create'; id: string; name: string; pills: Pill[] } // append + set active
  | { type: 'rename'; id: string; name: string }                // unknown id → no-op
  | { type: 'remove'; id: string }  // if active removed → activeId = first remaining ?? null
  | { type: 'apply'; id: string }   // set activeId; unknown id → no-op
  | { type: 'sync-active'; pills: Pill[] }; // overwrite active preset's pills; no-op if activeId null
```

Also exports `firstRemaining(presets: Preset[], removedId: string): Preset | null`
— the delete-active successor rule, shared by the reducer and the screen
orchestration so the two cannot diverge.

### `src/hooks/usePresets.ts` (new) — mirrors `useChain`'s idiom

Hydrates from storage on mount (exposes `hydrated`), autosaves the whole state
on every change **after** hydration, and exposes id-minting helpers
(`createPreset(name, pills): string`, `renamePreset`, `removePreset`,
`applyPreset`, `syncActive`) plus derived `activePreset`.

### `chainReducer` — one new action

```ts
| { type: 'replace-pills'; pills: Pill[] } // wholesale swap; arrival & zone untouched
```

`useChain` exposes it as `replacePills(pills)`.

## Orchestration (in `ChainScreen`)

Both hooks live in `ChainScreen`; presets never talk to storage or native code
directly — arming stays exclusively on the existing `useArmingChain` path.

**Apply** (불러오기, and the delete-active hop):
`disarmForEdit()` (existing helper — toast on Android) → `replacePills(preset.pills)`
→ `applyPreset(preset.id)`. Applying the already-active preset is guarded to a
plain close (live mirror makes it a no-op; skipping avoids a pointless disarm).
After an apply, the mirror effect fires once and writes the identical pill
array back into the just-applied preset — an intended, harmless no-op; do not
"fix" it away.

**Create** (＋ 새 프리셋 / empty-state CTA): snapshot the current working
pills → `createPreset(name, pills)` → reducer appends + activates. On-screen
pills are untouched, so no disarm.

**Delete active with others remaining:** the screen computes the successor
via the shared `firstRemaining` helper (the same rule the reducer applies) →
`removePreset(id)` → apply-flow for the successor (disarm + replace).
**Delete active as last preset:** `removePreset(id)` only; events stay on
screen as the unlinked working chain; chip reverts to 현재 일정; no disarm.
**Delete non-active / rename:** presets state only; screen untouched; no disarm.

**Live mirror** — one effect, the twin of the draft autosave:

```ts
const firstSync = useRef(true);
useEffect(() => {
  if (!chainHydrated || !presetsHydrated) return;
  if (firstSync.current) { firstSync.current = false; return; }
  syncActive(state.pills); // no-op inside the reducer when activeId is null
}, [state.pills, chainHydrated, presetsHydrated]);
```

Both hydration flags MUST be in the dependency array: the two stores hydrate
from independent AsyncStorage reads in nondeterministic order, and the guard
must be consumed by the first run after **both** are live (the restore). With
`[state.pills]` alone, a chain-first hydration order would leave the guard
unconsumed until the first user edit — silently swallowing that edit's mirror.

The invariant: **a restore alone must never write to the preset store.** The
first-run guard means the boot-time hydration of the working chain cannot
clobber the active preset — this matters if a crash previously landed between
the two AsyncStorage writes (presets vs draft) and left them momentarily
inconsistent. Known accepted gap: an edit made in the milliseconds before both
stores hydrate is swallowed by the guard; the next edit self-heals it.

First paint gates on **both** hydrated flags (extends the existing
`if (!hydrated)` backdrop return), so the chip never flashes a wrong label.

## UI

### Switcher chip (inline in `ChainScreen` header area)

- Sits directly under the wordmark row, in the slot of the current
  `🛬 도착 {{time}}` ready chip, which is **removed** (rows 08–10; the arrival
  stays visible on the chain's 📍 anchor row, so no information is lost). The
  armed chip, at-risk banner, missed banner, and issue rows are unchanged.
- Label: `activePreset?.name ?? t('preset.current')` + ▾. NEW badge rendered
  beside the chip iff `presets.length === 0`.
- Tap → opens `PresetListSheet`.

### `PresetListSheet` (new, full-screen `Modal` like `ReorderView`)

- Header: ‹ back + title 프리셋 + right text-action 관리/완료 (hidden while
  empty). Android back / `onRequestClose`: exits manage mode first, then closes.
  The ‹ back affordance is an adaptation — the mockup shows no dismiss control.
- **Empty state** (`presets.length === 0`): 🗂️ tile + title + body + gradient
  CTA ＋ 지금 일정을 프리셋으로 저장 → create flow.
- **Normal mode:** one row per preset (name / emoji strip / summary via
  `presetSummary` + `formatDuration`; emoji strip and name ellipsize to one
  line). Trailing: ✓ (active) or › . Tapping a non-active row selects it
  (highlight + inline 불러오기); tapping 불러오기 applies and closes. Selection
  resets whenever the sheet opens and whenever manage mode is toggled. Tapping
  the active row does nothing.
  Dashed ＋ 새 프리셋 row at the end (both modes) → create flow.
- **Manage mode** (관리 ↔ 완료): hint line under the header; rows show 편집 ›
  and tapping opens `PresetNameSheet` in edit mode. No selection/apply here.

### `PresetNameSheet` (new, bottom sheet like `PillEditorSheet`; one component, two modes)

- **Create:** title 새 프리셋, autofocused name input (`maxLength` 24,
  placeholder 이름), 저장 disabled while the trimmed name is empty. Save →
  `createPreset` → close sheet **and** list, returning home with the chip
  showing the new name. Duplicate names allowed (ids disambiguate).
- **Edit:** title 프리셋 편집, prefilled name input, summary strip
  (emoji strip + `preset.summary` + · 홈에서 편집), 🗑️ 삭제 (flex 1) + 저장
  (flex 2). Save → rename → back to the list (still in manage mode). Delete →
  `Alert.alert(deleteConfirmTitle, deleteConfirmBody, [취소, 삭제(destructive)])`
  → on confirm, the delete orchestration above; return to the list (empty
  state if that was the last preset). Android back / `onRequestClose` cancels
  (dismiss without saving), matching `PillEditorSheet`.

### `PillEditorSheet` — one additive prop

`autosaveNote?: string`. When set, render a ☁︎ info strip (`skyBg`, same
recipe as the type-hint strip) above the action row. `ChainScreen` passes
`t('preset.autosaveNote', { name })` whenever a preset is active, in both
create and edit modes (new events also mirror into the active preset).

## i18n — new `preset` namespace (both catalogs; `catalogs.test.ts` covers parity)

| Key | KO | EN |
| --- | --- | --- |
| `preset.current` | 현재 일정 | Current schedule |
| `preset.newBadge` | NEW | NEW |
| `preset.title` | 프리셋 | Presets |
| `preset.manage` | 관리 | Manage |
| `preset.done` | 완료 | Done |
| `preset.manageHint` | 프리셋을 탭해 이름을 바꾸거나 삭제해요 | Tap a preset to rename or delete it |
| `preset.load` | 불러오기 | Load |
| `preset.addNew` | ＋ 새 프리셋 | ＋ New preset |
| `preset.emptyTitle` | 아직 저장된 프리셋이 없어요 | No saved presets yet |
| `preset.emptyBody` | 지금 이벤트 목록을 프리셋으로 저장하면, 다음에 한 번의 탭으로 불러올 수 있어요. | Save your current events as a preset and bring them back with one tap. |
| `preset.saveCurrent` | ＋ 지금 일정을 프리셋으로 저장 | ＋ Save current schedule as a preset |
| `preset.summary` | 이벤트 {{count}}개 · 총 {{total}} | {{count}} events · {{total}} total |
| `preset.editedAtHome` | 홈에서 편집 | edited on Home |
| `preset.autosaveNote` | ☁︎ 변경은 ‘{{name}}’에 자동 저장돼요. | ☁︎ Changes auto-save to ‘{{name}}’. |
| `preset.createTitle` | 새 프리셋 | New preset |
| `preset.editTitle` | 프리셋 편집 | Edit preset |
| `preset.nameLabel` | 이름 | Name |
| `preset.edit` | 편집 | Edit |
| `preset.deleteConfirmTitle` | ‘{{name}}’ 프리셋을 삭제할까요? | Delete the preset ‘{{name}}’? |
| `preset.deleteConfirmBody` | 이 프리셋의 이벤트 목록이 사라져요. 되돌릴 수 없어요. | This preset's event list will be gone. This can't be undone. |

Reused existing keys: `editor.cancel` (취소), `pillEditor.save` (저장),
`pillEditor.delete` (삭제). `deleteConfirmTitle` deviates slightly from the
mockup ("'헬스장 새벽'**을**") because the 을/를 particle depends on the
name's final consonant; "‘{{name}}’ 프리셋을" sidesteps particle agreement for
arbitrary names. `chainScreen.arrivalSummary` becomes unused and is removed
from both catalogs.

## Edge cases & rules

- **Empty pill list:** a chain with zero pills can still be saved as a preset
  and applied; the existing `no-alarm` validation keeps the arm button gated.
- **Apply/rename/delete while armed:** apply and delete-active run through
  `disarmForEdit` (armed chip disappears, toast, user re-arms deliberately).
  Rename and non-active delete change nothing on screen and do not disarm.
- **`activeId` null with presets present:** unreachable through the UI
  (create/apply activate; delete-active hops). Reachable only via corrupted
  storage; the chip then shows 현재 일정 and the mirror no-ops — tolerated,
  not repaired.
- **NEW badge** is derived (`presets.length === 0`), never stored.
- **Long content:** emoji strip and names render on one line with tail
  ellipsis; the list scrolls (`ScrollView`) for many presets.

## Files touched

| File | Change |
| --- | --- |
| `src/domain/preset.ts` (new) | `Preset`, `presetSummary` |
| `src/domain/index.ts` | Re-export |
| `src/state/presetsReducer.ts` (new) | Pure reducer |
| `src/state/chainReducer.ts` | Add `replace-pills` |
| `src/storage/presets.ts` (new) | Load/save/sanitize under `schedularm.presets.v1` |
| `src/hooks/usePresets.ts` (new) | Hydrate + autosave + id-minting helpers |
| `src/hooks/useChain.ts` | Expose `replacePills` |
| `src/ui/components/PresetListSheet.tsx` (new) | List / empty / manage modes |
| `src/ui/components/PresetNameSheet.tsx` (new) | Create + edit (rename/delete) |
| `src/ui/components/PillEditorSheet.tsx` | `autosaveNote` prop |
| `src/ui/screens/ChainScreen.tsx` | Switcher chip (replaces ready chip), sheets wiring, mirror effect, apply/delete orchestration, dual hydration gate |
| `src/ui/theme.ts` | Hoist `colors.dashed = '#A9CFF5'` (reused by ＋ 이벤트 추가) |
| `src/i18n/ko.ts`, `src/i18n/en.ts` | `preset.*` keys; drop `chainScreen.arrivalSummary` |

## Testing

Unit (Jest, same style as existing suites):

- `presetsReducer`: hydrate; create appends + activates (incl. onto empty
  state); rename; remove non-active; **remove active → first remaining
  activates**; remove last → `activeId` null; unknown-id actions no-op;
  `sync-active` overwrites active pills / no-ops without active; inputs never
  mutated.
- `storage/presets`: round-trip; junk JSON / non-object payload → null;
  malformed entries dropped (empty name, non-object); duplicate ids deduped;
  unknown `activeId` nulled; pills run through `sanitizePills`.
- `chainReducer`: `replace-pills` swaps pills, preserves arrival/zone.
- `presetSummary`: count / total / icon concatenation / empty list.

Manual on-device (gestures/modals, like `ReorderView`): create from empty
state; chip label + NEW badge; two-step apply keeps arrival and disarms;
mirror (edit a pill at home → preset row summary updates); **relaunch with an
active preset → presets and summaries unchanged (a restore alone writes
nothing), then the first edit after relaunch mirrors correctly**; autosave
note in the editor; manage → rename; delete active hops to first remaining;
delete last → 현재 일정 with events intact; Android back exits manage mode
first.

## Out of scope

Rows 01–07 visual reconciliation; the custom arrival wheel; preset reordering;
per-preset arrival times; import/export; any native-module change (none is
needed — arming consumes the working chain exactly as today).

## Alternatives considered

- **Snapshot + explicit save** — adds a dirty state and a save button the
  mockup doesn't show. Rejected by user (live mirror chosen).
- **Unlink on delete-active** (chip reverts to 현재 일정 while presets
  remain) — leaves a vague unnamed state and contradicts the delete-confirm
  copy ("이벤트 목록이 사라져요"). Rejected by user; auto-hop chosen.
- **Custom in-app delete dialog** matching the mockup card — more code for a
  rare destructive path; native `Alert` is the platform-blessed guard.
  Revisit only if the native dialog feels off-brand on device.
- **Separate storage keys per preset** — complicates atomicity and ordering
  for no benefit at this scale; one payload is simpler (KISS).
