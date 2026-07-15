import { DateTime } from 'luxon';

import { isChainArmable, validateChain, ChainValidationIssue } from '../chainValidation';
import { Chain, MAX_PILL_MINUTES, Pill } from '../pill';

const at = (zone: string, y: number, mo: number, d: number, h: number, mi: number) =>
  DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi }, { zone }).toMillis();

const event = (id: string, dur: number): Pill => ({ id, type: 'none', icon: '⬜', name: id, dur });
const marker = (id: string, type: 'push' | 'alarm' = 'alarm'): Pill => ({ id, type });

const ZONE = 'UTC';
// arrival 09:00; wake alarm 07:50; chain start (취침) 00:50.
const hero = (): Chain => ({
  arrival: at(ZONE, 2026, 6, 30, 9, 0),
  zone: ZONE,
  pills: [event('sleep', 420), marker('wake'), event('shower', 20), event('prep', 15), event('commute', 35)],
});

const kinds = (issues: ChainValidationIssue[]) => issues.map((i) => i.kind);

test('a healthy chain before its start time has no issues and is armable', () => {
  const now = at(ZONE, 2026, 6, 29, 23, 0); // before start 00:50
  const issues = validateChain(hero(), now);
  expect(issues).toEqual([]);
  expect(isChainArmable(issues)).toBe(true);
});

test('start-passed is a non-blocking nudge while the alarm is still in the future', () => {
  const now = at(ZONE, 2026, 6, 30, 2, 0); // after start 00:30, before wake 07:50
  const issues = validateChain(hero(), now);
  expect(kinds(issues)).toEqual(['start-passed']);
  expect(isChainArmable(issues)).toBe(true);
});

test('a passed FIRST alarm does not block arming while a later alarm remains (past alerts are skipped)', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [event('sleep', 420), marker('wake'), event('gap', 30), event('tail', 15), marker('backup')],
  };
  // wake fires 08:15; backup (last pill) fires at the arrival 09:00.
  const now = at(ZONE, 2026, 6, 30, 8, 30); // wake passed, backup ahead
  const issues = validateChain(c, now);
  expect(kinds(issues)).not.toContain('past-event');
  expect(isChainArmable(issues)).toBe(true);
  expect(kinds(issues)).toContain('start-passed'); // start long past — the nudge survives
});

test('past-event blocks arming once ALL alarms have passed, even with the arrival ahead', () => {
  const now = at(ZONE, 2026, 6, 30, 8, 0); // hero's only alarm fired 07:50; arrival 09:00 ahead
  const issues = validateChain(hero(), now);
  expect(kinds(issues)).toContain('past-event');
  expect(kinds(issues)).not.toContain('start-passed'); // past-event supersedes the nudge
  expect(isChainArmable(issues)).toBe(false);
});

test('an alarm-less chain past its arrival reports no-alarm but never past-event', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [event('p', 30), marker('pm', 'push'), event('x', 60)],
  };
  const now = at(ZONE, 2026, 6, 30, 10, 0); // arrival passed
  const issues = validateChain(c, now);
  expect(kinds(issues)).toContain('no-alarm');
  expect(kinds(issues)).not.toContain('past-event');
  expect(isChainArmable(issues)).toBe(false);
});

test('past-event blocks once ALL alarms in a multi-alarm chain have passed (arrival still ahead)', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [event('sleep', 420), marker('wake'), event('gap', 30), event('tail', 15), marker('backup'), event('commute', 30)],
  };
  // wake fires 07:45; backup fires 08:30; arrival 09:00 still ahead.
  const issues = validateChain(c, at(ZONE, 2026, 6, 30, 8, 45));
  expect(kinds(issues)).toContain('past-event');
  expect(isChainArmable(issues)).toBe(false);
});

test('a chain with no alarm pill cannot be armed (a safety alarm needs a guaranteed ring)', () => {
  const c: Chain = { arrival: at(ZONE, 2026, 6, 30, 9, 0), zone: ZONE, pills: [event('a', 60), event('b', 30)] };
  const now = at(ZONE, 2026, 6, 29, 23, 0);
  const issues = validateChain(c, now);
  expect(kinds(issues)).toContain('no-alarm');
  expect(isChainArmable(issues)).toBe(false);
});

test('a push-only chain is not armable — pushes are best-effort, not a guaranteed alarm', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [event('p', 30), marker('pm', 'push'), event('x', 60)],
  };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(kinds(issues)).toContain('no-alarm');
  expect(isChainArmable(issues)).toBe(false);
});

test('a null arrival is reported as no-arrival and blocks arming', () => {
  const c: Chain = { arrival: null, zone: ZONE, pills: [event('sleep', 420), marker('wake')] };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(kinds(issues)).toContain('no-arrival');
  expect(isChainArmable(issues)).toBe(false);
});

test('a non-finite arrival fails closed (no-arrival), never open', () => {
  const c: Chain = { arrival: Number.NaN, zone: ZONE, pills: [event('sleep', 420), marker('wake')] };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(kinds(issues)).toContain('no-arrival');
  expect(isChainArmable(issues)).toBe(false);
});

test('an empty chain reports no-alarm and is not armable', () => {
  const c: Chain = { arrival: at(ZONE, 2026, 6, 30, 9, 0), zone: ZONE, pills: [] };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(kinds(issues)).toContain('no-alarm');
  expect(isChainArmable(issues)).toBe(false);
});

test('a pill duration over the per-pill bound is flagged with its id and blocks arming', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [event('huge', MAX_PILL_MINUTES + 1), marker('m')],
  };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(issues).toContainEqual({ kind: 'pill-out-of-range', id: 'huge' });
  expect(isChainArmable(issues)).toBe(false);
});

test('a negative duration is both infeasible and out-of-range, and blocks arming', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [event('neg', -5), marker('m')],
  };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(kinds(issues)).toContain('infeasible');
  expect(issues).toContainEqual({ kind: 'pill-out-of-range', id: 'neg' });
  expect(isChainArmable(issues)).toBe(false);
});

test('a total span beyond the chain cap blocks arming', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 7, 5, 9, 0),
    zone: ZONE,
    pills: [event('a', 800), marker('m'), event('b', 800)], // 1600 > 26h (1560)
  };
  const now = at(ZONE, 2026, 7, 1, 0, 0); // well before the chain start
  const issues = validateChain(c, now);
  expect(kinds(issues)).toContain('chain-too-long');
  expect(isChainArmable(issues)).toBe(false);
});

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
