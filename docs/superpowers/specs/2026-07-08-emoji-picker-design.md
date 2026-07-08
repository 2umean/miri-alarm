# Emoji picker for event editor — design

Date: 2026-07-08
Status: approved

## Problem

The event editor (`PillEditorSheet`) offers only a hardcoded 12-emoji palette
(`EMOJI_PALETTE`). Users cannot pick an emoji outside that set.

## Decision summary

- Replace the 12-tile palette with a **row of 6 quick-pick tiles** plus a
  **free emoji input** driven by the OS keyboard's emoji pane.
- No new dependencies. No in-app picker library (the system keyboard already
  provides categories and localized search, including Korean).

## UI behavior (`src/ui/components/PillEditorSheet.tsx`)

### Quick-pick row

- One row of 6 preset tiles: 🧥 😴 🚿 🍳 🚇 ☕
  (seeded routine icons — sleep/shower/breakfast/commute — plus the
  new-event default 🧥 and coffee).
- Tapping a tile sets the icon immediately and shows the existing
  active-highlight style. If the current icon is not among the 6, no tile is
  highlighted.
- Tapping a quick pick while the free input is focused also dismisses the
  keyboard.
- `EMOJI_PALETTE` (12 entries) and its render loop are removed.

### Free emoji input tile

- The emoji tile sits in the field row, left of the name input
  (~48×48, centered, large font). It is a styled `TextInput` whose value is
  the current icon, with `selectTextOnFocus` so the first keystroke replaces
  it.
- It always displays the current icon, whether set by quick pick or keyboard.
- Neither platform can force the emoji keyboard open; the user taps the
  emoji/globe key on their own keyboard. While the input is focused, a
  one-line hint appears (new i18n key, `en` + `ko`):
  "use the emoji key on your keyboard" / "키보드의 이모지 키를 눌러 선택하세요".
- The sheet's existing `KeyboardAvoidingView` logic already covers the
  keyboard being open here; no changes.

## Input rules & edge cases

- **Last grapheme wins.** Whatever is typed or pasted, keep only the final
  user-perceived character via a new `lastGrapheme()` utility that handles
  multi-code-unit emoji: skin tones (👍🏽), ZWJ sequences (👨‍👩‍👧), flags (🇰🇷).
  Naive string slicing would split these.
- **Any grapheme is accepted** — emoji, letter, or symbol. No emoji-only
  validation.
- **Empty is never saved.** Clearing the field and blurring reverts to the
  previous icon. New events still default to 🧥
  (`DEFAULT_NEW_PILL` in `ChainScreen.tsx`).
- No domain/storage/notification changes: `Pill.icon` is already an arbitrary
  string and `chainSanitize` accepts any string, so saved chains, migrations,
  and alarm payloads are unaffected.

## Files touched

| File | Change |
| --- | --- |
| `src/ui/components/PillEditorSheet.tsx` | Remove 12-tile palette; add 6-tile quick row + emoji `TextInput` tile + focused hint |
| `src/ui/lastGrapheme.ts` (new) | Grapheme-cluster utility |
| `src/ui/__tests__/lastGrapheme.test.ts` (new) | Unit tests |
| `src/i18n/en.ts`, `src/i18n/ko.ts` | One hint key |

## Testing

- Unit tests for `lastGrapheme`: plain char, multi-char string, skin-tone
  emoji, ZWJ family emoji, flag, empty string.
- Manual on-device: type emoji via Android and iOS keyboards, paste
  multi-emoji text, clear-and-blur revert, quick-pick highlight sync.

## Alternatives considered

- **rn-emoji-keyboard library** — pure-JS in-app picker with categories and
  `ko` labels, but adds a dependency, bundles an emoji dataset, search is
  English-first, and last release was 2024. Rejected.
- **Custom in-app picker** — full control (incl. Korean search) but far more
  build/maintenance cost. Rejected (YAGNI).
- **Bigger curated set only** — still limits choice. Rejected.
