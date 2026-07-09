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
