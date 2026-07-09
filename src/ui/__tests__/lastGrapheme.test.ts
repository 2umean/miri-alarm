import { lastGrapheme, lastGraphemeFallback } from '../lastGrapheme';

// Both the Segmenter path and the manual fallback must agree on the emoji-input
// cases below (the fallback is emoji-focused, not full UAX #29).
const ENGLAND = String.fromCodePoint(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);

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

  test('tag-sequence subdivision flag stays whole', () => {
    expect(fn(ENGLAND)).toBe(ENGLAND);
    expect(fn('a' + ENGLAND)).toBe(ENGLAND);
  });
});
