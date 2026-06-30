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

test('a passed primary event blocks arming', () => {
  const now = at(ZONE, 2026, 6, 30, 8, 0); // after wake 07:30
  const issues = validateChain(hero(), now);
  expect(kinds(issues)).toContain('past-event');
  expect(isChainArmable(issues)).toBe(false);
});

test('a chain with no alarm/push pill cannot be armed (nothing to schedule)', () => {
  const c: Chain = { arrival: at(ZONE, 2026, 6, 30, 9, 0), zone: ZONE, pills: [pill('a', 60), pill('b', 30)] };
  const now = at(ZONE, 2026, 6, 29, 23, 0);
  const issues = validateChain(c, now);
  expect(kinds(issues)).toContain('no-events');
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

test('an empty chain reports no-events and is not armable', () => {
  const c: Chain = { arrival: at(ZONE, 2026, 6, 30, 9, 0), zone: ZONE, pills: [] };
  const issues = validateChain(c, at(ZONE, 2026, 6, 29, 23, 0));
  expect(kinds(issues)).toContain('no-events');
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
