import { sanitizeProps } from '../events';

test('keeps numbers, booleans and short strings', () => {
  expect(sanitizeProps({ a: 3, b: true, c: 'none' })).toEqual({ a: 3, b: true, c: 'none' });
});

test('drops objects, arrays, undefined, null and functions', () => {
  expect(
    sanitizeProps({ o: { x: 1 }, arr: [1], u: undefined, n: null, f: () => 1, keep: 1 }),
  ).toEqual({ keep: 1 });
});

test('drops strings longer than 64 chars (free-text guard)', () => {
  expect(sanitizeProps({ label: 'x'.repeat(65), ok: 'x'.repeat(64) })).toEqual({
    ok: 'x'.repeat(64),
  });
});
