import { DateTime } from 'luxon';

import { migratedChain, reconcileAndRoll, seedPills, withDefaultArrival } from '../chainHydrate';
import { primaryEventInstant } from '../../domain/chainEngine';
import { rollChainToFuture } from '../../domain/chainRollover';
import { resolveArrivalInstant } from '../../domain/datetime';
import { Chain } from '../../domain/pill';

const name = (key: string) => `name:${key}`;
const id = (i: number) => `id-${i}`;
const at = (zone: string, y: number, mo: number, d: number, h: number, mi: number) =>
  DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi }, { zone }).toMillis();

test('seedPills materialises the four default pills with resolved names + ids', () => {
  const pills = seedPills(name, id);
  expect(pills.map((p) => [p.id, p.name, p.type])).toEqual([
    ['id-0', 'name:pill.sleep', 'alarm'],
    ['id-1', 'name:pill.shower', 'none'],
    ['id-2', 'name:pill.breakfast', 'none'],
    ['id-3', 'name:pill.commute', 'none'],
  ]);
});

test('migratedChain maps v1 durations to a zoned chain preserving alert semantics', () => {
  const chain = migratedChain(
    { arrival: 1_800_000_000_000, contingency: 15, travel: 60, prep: 45, sleep: 480 },
    'Asia/Seoul',
    name,
    id,
  );
  expect(chain.arrival).toBe(1_800_000_000_000);
  expect(chain.zone).toBe('Asia/Seoul');
  expect(chain.pills.map((p) => [p.name, p.dur, p.type])).toEqual([
    ['name:pill.sleep', 480, 'alarm'],
    ['name:pill.prep', 45, 'push'],
    ['name:pill.travel', 60, 'none'],
    ['name:pill.contingency', 15, 'none'],
  ]);
});

test('reconcileAndRoll re-zones to the device and rolls a passed chain to the future', () => {
  const zone = 'UTC';
  // arrival 09:00 day 6; alarm pill ends 09:00 − 35 = 08:25 (no longer the roll key — see D4).
  const stored: Chain = {
    arrival: at(zone, 2026, 1, 6, 9, 0),
    zone: 'America/New_York', // stale stored zone, different from the device
    pills: [
      { id: 'a', icon: '😴', name: 's', dur: 420, type: 'alarm' },
      { id: 'b', icon: '🚇', name: 'c', dur: 35, type: 'none' },
    ],
  };
  const now = at(zone, 2026, 1, 6, 9, 30); // after the arrival itself on day 6
  const out = reconcileAndRoll(stored, zone, now);
  expect(out.zone).toBe(zone); // reconciled to the device zone
  expect(primaryEventInstant(out)!).toBeGreaterThan(now); // rolled forward
  expect(DateTime.fromMillis(out.arrival!, { zone }).day).toBe(7);
});

test('withDefaultArrival anchors a fresh chain to the next 09:00 and seeds the default pills', () => {
  const zone = 'UTC';
  const now = at(zone, 2026, 1, 6, 8, 0); // before 09:00 → same day
  const out = withDefaultArrival({ arrival: null, zone, pills: [] }, zone, now, name, id);
  expect(DateTime.fromMillis(out.arrival!, { zone }).toFormat('yyyy-MM-dd HH:mm')).toBe(
    '2026-01-06 09:00',
  );
  expect(out.pills.map((p) => p.name)).toEqual([
    'name:pill.sleep',
    'name:pill.shower',
    'name:pill.breakfast',
    'name:pill.commute',
  ]);
});

test('withDefaultArrival rolls to tomorrow when today’s 09:00 has already passed', () => {
  const zone = 'UTC';
  const now = at(zone, 2026, 1, 6, 9, 0); // exactly 09:00 → strictly-future ⇒ next day
  const out = withDefaultArrival({ arrival: null, zone, pills: [] }, zone, now, name, id);
  expect(DateTime.fromMillis(out.arrival!, { zone }).day).toBe(7);
});

test('withDefaultArrival passes an anchored chain through untouched (referential identity)', () => {
  const zone = 'UTC';
  const chain: Chain = { arrival: at(zone, 2026, 1, 6, 9, 0), zone, pills: [] };
  expect(withDefaultArrival(chain, zone, at(zone, 2026, 1, 6, 0, 0), name, id)).toBe(chain);
});

test('withDefaultArrival keeps existing pills when only the arrival is missing', () => {
  const zone = 'UTC';
  const pills = [{ id: 'a', icon: '😴', name: 's', dur: 420, type: 'alarm' as const }];
  const out = withDefaultArrival({ arrival: null, zone, pills }, zone, at(zone, 2026, 1, 6, 0, 0), name, id);
  expect(out.arrival).not.toBeNull();
  expect(out.pills).toBe(pills);
});

// Regression: the seeded default anchor lands on TOMORROW 09:00 for any launch
// after ~07:45 (today's 09:00 wake-chain is already infeasible). A first pick
// must still be able to target TODAY — it resolves via resolveArrivalInstant
// against `now`, never by pinning to the seeded anchor's calendar day.
test('a first arrival pick over the seeded default can still land on today', () => {
  const zone = 'UTC';
  const now = at(zone, 2026, 1, 6, 12, 0); // noon — seeded anchor is tomorrow 09:00
  const seeded = withDefaultArrival({ arrival: null, zone, pills: [] }, zone, now, name, id);
  expect(DateTime.fromMillis(seeded.arrival!, { zone }).day).toBe(7);

  const picked = resolveArrivalInstant(18, 0, zone, now); // user picks 18:00 meaning today
  const rolled = rollChainToFuture({ ...seeded, arrival: picked }, now);
  expect(DateTime.fromMillis(rolled.arrival!, { zone }).toFormat('yyyy-MM-dd HH:mm')).toBe(
    '2026-01-06 18:00', // stays today: the 18:00 arrival itself is still ahead of noon
  );
});

test('reconcileAndRoll leaves a still-future chain untouched (only re-zones)', () => {
  const zone = 'UTC';
  const stored: Chain = {
    arrival: at(zone, 2026, 1, 6, 9, 0),
    zone,
    pills: [{ id: 'a', icon: '😴', name: 's', dur: 420, type: 'alarm' }],
  };
  const now = at(zone, 2026, 1, 6, 0, 0); // before everything
  const out = reconcileAndRoll(stored, zone, now);
  expect(out.arrival).toBe(stored.arrival);
});
