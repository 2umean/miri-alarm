import { DateTime } from 'luxon';

import { migratedChain, reconcileAndRoll, seedPills } from '../chainHydrate';
import { primaryEventInstant } from '../../domain/chainEngine';
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
  // arrival 09:00 day 6; alarm pill ends 09:00 − 35 = 08:25 = primary.
  const stored: Chain = {
    arrival: at(zone, 2026, 1, 6, 9, 0),
    zone: 'America/New_York', // stale stored zone, different from the device
    pills: [
      { id: 'a', icon: '😴', name: 's', dur: 420, type: 'alarm' },
      { id: 'b', icon: '🚇', name: 'c', dur: 35, type: 'none' },
    ],
  };
  const now = at(zone, 2026, 1, 6, 8, 30); // after the primary on day 6
  const out = reconcileAndRoll(stored, zone, now);
  expect(out.zone).toBe(zone); // reconciled to the device zone
  expect(primaryEventInstant(out)!).toBeGreaterThan(now); // rolled forward
  expect(DateTime.fromMillis(out.arrival!, { zone }).day).toBe(7);
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
