import { DateTime } from 'luxon';

import { isChainArmable, validateChain, ChainValidationIssue } from '../chainValidation';
import { Chain, MAX_PILL_MINUTES, Pill, PillType } from '../pill';

const at = (zone: string, y: number, mo: number, d: number, h: number, mi: number) =>
  DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi }, { zone }).toMillis();

const pill = (id: string, dur: number, type: PillType = 'none'): Pill => ({
  id,
  icon: '⬜',
  name: id,
  dur,
  type,
});

const ZONE = 'UTC';
// arrival 09:00; wake alarm 07:30; chain start (취침) 00:30.
const hero = (): Chain => ({
  arrival: at(ZONE, 2026, 6, 30, 9, 0),
  zone: ZONE,
  pills: [pill('sleep', 420, 'alarm'), pill('shower', 20), pill('prep', 15, 'push'), pill('commute', 35)],
});

const kinds = (issues: ChainValidationIssue[]) => issues.map((i) => i.kind);

test('a healthy chain before bedtime has no issues and is armable', () => {
  const now = at(ZONE, 2026, 6, 29, 23, 0); // before start 00:30
  const issues = validateChain(hero(), now);
  expect(issues).toEqual([]);
  expect(isChainArmable(issues)).toBe(true);
});

test('bedtime-passed is a non-blocking nudge while the alarm is still in the future', () => {
  const now = at(ZONE, 2026, 6, 30, 2, 0); // after start 00:30, before wake 07:30
  const issues = validateChain(hero(), now);
  expect(kinds(issues)).toEqual(['bedtime-passed']);
  expect(isChainArmable(issues)).toBe(true);
});

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

test('past-event blocks once ALL alarms in a multi-alarm chain have passed (arrival still ahead)', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [pill('wake', 420, 'alarm'), pill('gap', 30), pill('backup', 15, 'alarm'), pill('commute', 30)],
  };
  // wake ends 07:45; backup ends 08:30; arrival 09:00 still ahead.
  const issues = validateChain(c, at(ZONE, 2026, 6, 30, 8, 45));
  expect(kinds(issues)).toContain('past-event');
  expect(isChainArmable(issues)).toBe(false);
});

test('a chain with no alarm pill cannot be armed (a safety alarm needs a guaranteed ring)', () => {
  const c: Chain = { arrival: at(ZONE, 2026, 6, 30, 9, 0), zone: ZONE, pills: [pill('a', 60), pill('b', 30)] };
  const now = at(ZONE, 2026, 6, 29, 23, 0);
  const issues = validateChain(c, now);
  expect(kinds(issues)).toContain('no-alarm');
  expect(isChainArmable(issues)).toBe(false);
});

test('a push-only chain is not armable — pushes are best-effort, not a guaranteed alarm', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [pill('p', 30, 'push'), pill('x', 60)],
  };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(kinds(issues)).toContain('no-alarm');
  expect(isChainArmable(issues)).toBe(false);
});

test('a null arrival is reported as no-arrival and blocks arming', () => {
  const c: Chain = { arrival: null, zone: ZONE, pills: [pill('sleep', 420, 'alarm')] };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(kinds(issues)).toContain('no-arrival');
  expect(isChainArmable(issues)).toBe(false);
});

test('a non-finite arrival fails closed (no-arrival), never open', () => {
  const c: Chain = { arrival: Number.NaN, zone: ZONE, pills: [pill('sleep', 420, 'alarm')] };
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
    pills: [pill('huge', MAX_PILL_MINUTES + 1, 'alarm')],
  };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(issues).toContainEqual({ kind: 'pill-out-of-range', id: 'huge' });
  expect(isChainArmable(issues)).toBe(false);
});

test('a negative duration is both infeasible and out-of-range, and blocks arming', () => {
  const c: Chain = {
    arrival: at(ZONE, 2026, 6, 30, 9, 0),
    zone: ZONE,
    pills: [pill('neg', -5, 'alarm')],
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
    pills: [pill('a', 800, 'alarm'), pill('b', 800)], // 1600 > 26h (1560)
  };
  const now = at(ZONE, 2026, 7, 1, 0, 0); // well before the chain start
  const issues = validateChain(c, now);
  expect(kinds(issues)).toContain('chain-too-long');
  expect(isChainArmable(issues)).toBe(false);
});
