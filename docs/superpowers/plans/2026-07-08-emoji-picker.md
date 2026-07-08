# Emoji Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the event editor's fixed 12-emoji palette with 6 quick-pick tiles plus a free emoji input driven by the OS keyboard, so users can pick any emoji.

**Architecture:** A pure grapheme-cluster utility (`lastGrapheme`) keeps multi-code-unit emoji (skin tones, ZWJ families, flags) intact; `PillEditorSheet` renders a 6-tile quick row and turns the icon tile into a `TextInput` that feeds through that utility. No new dependencies, no domain/storage changes (`Pill.icon` is already an arbitrary string).

**Tech Stack:** React Native 0.85 / Expo 56, TypeScript, jest + ts-jest (node env — no RN component tests in this repo).

**Spec:** `docs/superpowers/specs/2026-07-08-emoji-picker-design.md` (includes mockup styling table).

---

### Task 1: `lastGrapheme` utility (TDD)

The util returns the final user-perceived character of a string. Primary path uses `Intl.Segmenter` when the runtime has it; a manual emoji-aware fallback covers runtimes without it (Hermes's `Intl` coverage is not guaranteed — verify on device in Task 3). Both are exported so both are testable under Node (whose `Intl.Segmenter` exists and would otherwise shadow the fallback).

**Files:**
- Test: `src/ui/__tests__/lastGrapheme.test.ts` (create)
- Create: `src/ui/lastGrapheme.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/ui/__tests__/lastGrapheme.test.ts
import { lastGrapheme, lastGraphemeFallback } from '../lastGrapheme';

// Both the Segmenter path and the manual fallback must agree on every case.
describe.each([
  ['lastGrapheme', lastGrapheme],
  ['lastGraphemeFallback', lastGraphemeFallback],
])('%s', (_name, fn) => {
  test('empty string stays empty', () => {
    expect(fn('')).toBe('');
  });

  test('plain characters: last one wins', () => {
    expect(fn('a')).toBe('a');
    expect(fn('ab')).toBe('b');
    expect(fn('샤워')).toBe('워');
  });

  test('single and trailing emoji', () => {
    expect(fn('🧥')).toBe('🧥');
    expect(fn('🧥😴')).toBe('😴');
    expect(fn('coffee ☕')).toBe('☕');
  });

  test('skin-tone modifier stays attached', () => {
    expect(fn('👍🏽')).toBe('👍🏽');
    expect(fn('x👍🏽')).toBe('👍🏽');
  });

  test('ZWJ family stays whole', () => {
    expect(fn('👨‍👩‍👧')).toBe('👨‍👩‍👧');
    expect(fn('a👨‍👩‍👧')).toBe('👨‍👩‍👧');
  });

  test('flags: regional-indicator pairs stay whole and split between flags', () => {
    expect(fn('🇰🇷')).toBe('🇰🇷');
    expect(fn('a🇰🇷')).toBe('🇰🇷');
    expect(fn('🇰🇷🇺🇸')).toBe('🇺🇸');
  });

  test('variation selector and keycap sequences stay whole', () => {
    expect(fn('watch ⌚️')).toBe('⌚️'); // U+231A U+FE0F
    expect(fn('1️⃣')).toBe('1️⃣'); // digit + U+FE0F + U+20E3
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lastGrapheme`
Expected: FAIL — `Cannot find module '../lastGrapheme'`

- [ ] **Step 3: Implement the utility**

```ts
// src/ui/lastGrapheme.ts
/**
 * Last user-perceived character of a string. Used by the emoji input in
 * PillEditorSheet: "last grapheme wins" keeps multi-code-unit emoji
 * (skin tones 👍🏽, ZWJ families 👨‍👩‍👧, flags 🇰🇷) intact where naive
 * slicing would split them.
 */

const ZWJ = 0x200d;
const VARIATION_SELECTORS = new Set([0xfe0e, 0xfe0f]);
const COMBINING_KEYCAP = 0x20e3;
const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;
const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

type SegmenterLike = new () => { segment(input: string): Iterable<{ segment: string }> };

export function lastGrapheme(text: string): string {
  if (!text) return '';
  // Typed via a lookup so compilation doesn't depend on the ES lib including
  // Intl.Segmenter, and the runtime check covers Hermes builds without it.
  const Segmenter = (Intl as { Segmenter?: SegmenterLike }).Segmenter;
  if (!Segmenter) return lastGraphemeFallback(text);
  let last = '';
  for (const part of new Segmenter().segment(text)) last = part.segment;
  return last;
}

/** Emoji-aware manual clustering for runtimes without Intl.Segmenter. */
export function lastGraphemeFallback(text: string): string {
  const cps = Array.from(text); // code points, not UTF-16 units
  if (cps.length === 0) return '';
  const cpAt = (i: number) => cps[i].codePointAt(0) as number;

  let start = cps.length - 1;

  // Regional indicators pair up from the left edge of their run, so an even
  // run ends in a complete flag (🇰🇷🇺🇸 → 🇺🇸) and an odd run ends in a lone half.
  if (isRegionalIndicator(cpAt(start))) {
    let runStart = start;
    while (runStart > 0 && isRegionalIndicator(cpAt(runStart - 1))) runStart -= 1;
    const runLength = start - runStart + 1;
    return cps.slice(runLength % 2 === 0 ? start - 1 : start).join('');
  }

  while (start > 0) {
    const cur = cpAt(start);
    if (VARIATION_SELECTORS.has(cur) || cur === COMBINING_KEYCAP || isSkinTone(cur)) {
      start -= 1; // modifier attaches to the code point before it
      continue;
    }
    if (cpAt(start - 1) === ZWJ && start >= 2) {
      start -= 2; // ZWJ joins this cluster to the one before it
      continue;
    }
    break;
  }
  return cps.slice(start).join('');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lastGrapheme`
Expected: PASS (all cases, both describe blocks)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all suites pass, no type errors

- [ ] **Step 6: Commit**

```bash
git add src/ui/lastGrapheme.ts src/ui/__tests__/lastGrapheme.test.ts
git commit -m "feat(ui): add lastGrapheme utility for emoji-safe single-char input"
```

---

### Task 2: PillEditorSheet — quick picks + free emoji input

No component tests exist in this repo (jest runs in node env without an RN renderer), so this task is implementation + typecheck + the manual QA in Task 3. Line numbers reference the file before edits.

**Files:**
- Modify: `src/ui/components/PillEditorSheet.tsx`

- [ ] **Step 1: Swap the palette constant and imports**

At `PillEditorSheet.tsx:2`, add `useRef`:

```ts
import { useEffect, useRef, useState } from 'react';
```

Below the theme import (line 19), add:

```ts
import { lastGrapheme } from '../lastGrapheme';
```

Replace line 32 (`const EMOJI_PALETTE = [...]`) with:

```ts
const QUICK_PICKS = ['🧥', '😴', '🚿', '🍳', '🚇', '☕'];
```

- [ ] **Step 2: Add icon-input state and safe-icon plumbing**

Inside the component, next to the existing `const [icon, setIcon] = useState(initial.icon);` (line 55), add:

```ts
const [isIconFocused, setIsIconFocused] = useState(false);
const lastIconRef = useRef(initial.icon); // last non-empty icon, for revert + submit

const pickIcon = (next: string) => {
  setIcon(next);
  if (next) lastIconRef.current = next;
};
```

Remove line 81 (`const palette = EMOJI_PALETTE.includes(icon) ? ... ;`).

Replace the `submit` definition (line 83) so a transiently-empty icon can never be saved:

```ts
const submit = () =>
  onSubmit({ icon: icon || lastIconRef.current, name: name.trim() || initial.name, dur, type });
```

- [ ] **Step 3: Replace the palette JSX with the 6-tile quick row**

Replace the `<View style={styles.palette}>…</View>` block (lines 105–115) with:

```tsx
<View style={styles.quickRow}>
  {QUICK_PICKS.map((e) => (
    <Pressable
      key={e}
      onPress={() => {
        pickIcon(e);
        Keyboard.dismiss();
      }}
      style={[styles.emoji, e === icon && styles.emojiActive]}
    >
      <Text style={styles.emojiText}>{e}</Text>
    </Pressable>
  ))}
</View>
```

(`Keyboard` is already imported; a quick pick while the emoji input is focused dismisses the keyboard, per spec. When `icon` is a custom emoji, no tile matches and none is highlighted — mockup frame C.)

- [ ] **Step 4: Add the free emoji input to the field row**

Inside `<View style={styles.fieldRow}>` (line 117), insert as the FIRST child, before the name `TextInput`:

```tsx
<TextInput
  style={[styles.iconInput, isIconFocused && styles.iconInputFocused]}
  value={icon}
  onChangeText={(txt) => pickIcon(lastGrapheme(txt))}
  onFocus={() => setIsIconFocused(true)}
  onBlur={() => {
    setIsIconFocused(false);
    if (!icon) setIcon(lastIconRef.current); // empty is never saved
  }}
  selectTextOnFocus
  returnKeyType="done"
/>
```

- [ ] **Step 5: Update styles**

Replace the `palette` style (line 236) with:

```ts
quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.m + 2 },
```

Change `emojiText` (line 248) font size 19 → 20 per mockup:

```ts
emojiText: { fontSize: 20 },
```

Add below `emojiText` (mockup: 46×46 tile, focused = 2px sky500 border + glow; `shadows.focus` is the existing glow recipe):

```ts
iconInput: {
  width: 46,
  height: 46,
  borderRadius: 13,
  backgroundColor: colors.bubble,
  borderWidth: 1.5,
  borderColor: colors.line,
  textAlign: 'center',
  textAlignVertical: 'center', // Android; ignored on iOS
  fontSize: 22,
  padding: 0,
},
iconInputFocused: { borderWidth: 2, borderColor: colors.sky500, ...shadows.focus },
```

The existing `emoji` / `emojiActive` styles stay — the quick-pick tiles keep using them.

- [ ] **Step 6: Typecheck and run the suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/PillEditorSheet.tsx
git commit -m "feat(ui): replace fixed emoji palette with 6 quick picks + free emoji input"
```

---

### Task 3: On-device verification (manual)

**Files:** none (QA checklist from the spec — run in the dev client, Android first)

- [ ] **Step 1: Quick picks** — open the event editor; the 6 tiles render edge-to-edge; tapping one sets the icon, highlights the tile, and dismisses the keyboard if open.
- [ ] **Step 2: Free input** — tap the icon tile: focused style appears (sky border + glow), current icon is text-selected; switch the keyboard to its emoji pane and pick 👨‍👩‍👧 → tile shows the whole family emoji (this also verifies the grapheme path on Hermes); quick-pick row shows no highlight.
- [ ] **Step 3: Paste** — paste a multi-emoji string (e.g. "가족 👨‍👩‍👧🇰🇷") into the icon input → only 🇰🇷 remains.
- [ ] **Step 4: Empty revert** — clear the icon input, tap elsewhere → previous icon comes back; clear it and hit the submit button directly → saved event keeps the previous icon.
- [ ] **Step 5: Persistence** — save an event with a custom emoji, kill and relaunch the app → icon survives (exercises draft storage + sanitizer with a ZWJ emoji).
- [ ] **Step 6: iOS spot-check** — repeat steps 1–2 on the iOS build.

---

## Self-review notes

- Spec coverage: 6 quick picks (T2S1/S3), any-emoji free input (T2S4), last-grapheme rule incl. skin tone/ZWJ/flags (T1), any-grapheme-allowed (no filtering anywhere), empty-never-saved via blur revert + submit guard (T2S2/S4), 🧥 default untouched (`DEFAULT_NEW_PILL` unchanged), no hint line (nothing added), mockup styling values (T2S5), no new deps, no domain/storage changes, unit tests (T1), manual QA (T3). No gaps found.
- No placeholders; every code step shows the full code.
- Names consistent across tasks: `lastGrapheme`, `lastGraphemeFallback`, `QUICK_PICKS`, `pickIcon`, `lastIconRef`, `isIconFocused`, `quickRow`, `iconInput`, `iconInputFocused`.
