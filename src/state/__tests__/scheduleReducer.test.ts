import { DateTime } from 'luxon';
import {
  scheduleReducer,
  initialState,
  toSchedule,
  ScheduleState,
} from '../scheduleReducer';
import { reverseCalc } from '../../domain';
import { SEED_DEFAULTS } from '../../storage/presets';

const at = (h: number, m: number) =>
  DateTime.fromObject({ year: 2026, month: 1, day: 6, hour: h, minute: m }, { zone: 'UTC' }).toMillis();
const start = (): ScheduleState => initialState(SEED_DEFAULTS, 'UTC');

test('initial state has no arrival and seeded durations', () => {
  const s = start();
  expect(s.arrival).toBeNull();
  expect(s.travel).toBe(SEED_DEFAULTS.travel);
  expect(toSchedule(s)).toBeNull();
});

test('set-arrival populates arrival and toSchedule yields a Schedule', () => {
  const s = scheduleReducer(start(), { type: 'set-arrival', instant: at(6, 0), zone: 'UTC' });
  expect(s.arrival).toBe(at(6, 0));
  expect(toSchedule(s)).not.toBeNull();
});

test('set-duration updates exactly one field immutably', () => {
  const before = start();
  const after = scheduleReducer(before, { type: 'set-duration', field: 'prep', minutes: 30 });
  expect(after.prep).toBe(30);
  expect(after.travel).toBe(before.travel);
  expect(before.prep).toBe(SEED_DEFAULTS.prep); // original untouched
});

test('edit-wake before an arrival is entered is a no-op', () => {
  const before = start();
  const after = scheduleReducer(before, { type: 'edit-wake', instant: at(3, 25) });
  expect(after).toEqual(before);
});

test('edit-wake adjusts prep and leaves arrival fixed (wiring to editResolver)', () => {
  const armed = scheduleReducer(start(), { type: 'set-arrival', instant: at(6, 0), zone: 'UTC' });
  // base derived wake = 06:00 − (15+60)m − 45m = 04:00; move wake 20 min earlier → prep +20
  const after = scheduleReducer(armed, { type: 'edit-wake', instant: at(3, 40) });
  expect(after.prep).toBe(SEED_DEFAULTS.prep + 20);
  expect(after.arrival).toBe(at(6, 0));
});

test('edit-arrival shifts the anchor; durations unchanged', () => {
  const armed = scheduleReducer(start(), { type: 'set-arrival', instant: at(6, 0), zone: 'UTC' });
  const after = scheduleReducer(armed, { type: 'edit-arrival', instant: at(7, 0) });
  const d = reverseCalc(toSchedule(after)!);
  expect(DateTime.fromMillis(d.arrival, { zone: 'UTC' }).toFormat('HH:mm')).toBe('07:00');
  expect(after.travel).toBe(SEED_DEFAULTS.travel);
});
