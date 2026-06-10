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

test('edit-leave-home adjusts travel and leaves arrival fixed (wiring to editResolver)', () => {
  const armed = scheduleReducer(start(), { type: 'set-arrival', instant: at(6, 0), zone: 'UTC' });
  // leaveHome = 06:00 − (15+60)m = 04:45; move 15 min earlier to 04:30
  // editLeaveHome: travel = toMinutes(arrival − contingency*ms − newLeave)
  //              = toMinutes(at(5,45) − at(4,30)) = 75
  const after = scheduleReducer(armed, { type: 'edit-leave-home', instant: at(4, 30) });
  expect(after.travel).toBe(SEED_DEFAULTS.travel + 15); // 60 + 15 = 75
  expect(after.arrival).toBe(at(6, 0));
  expect(after.contingency).toBe(SEED_DEFAULTS.contingency);
});

test('edit-fall-asleep adjusts sleep and leaves arrival fixed (wiring to editResolver)', () => {
  const armed = scheduleReducer(start(), { type: 'set-arrival', instant: at(6, 0), zone: 'UTC' });
  // wake = leaveHome − prep*ms = at(4,45) − 45m = at(4,0)
  // move fallAsleep to at(2,0): sleep = toMinutes(at(4,0) − at(2,0)) = 120
  const after = scheduleReducer(armed, { type: 'edit-fall-asleep', instant: at(2, 0) });
  expect(after.sleep).toBe(120);
  expect(after.arrival).toBe(at(6, 0));
  expect(after.prep).toBe(SEED_DEFAULTS.prep);
});

test('infeasible edit result is written back (negative duration allowed; spec §6)', () => {
  const armed = scheduleReducer(start(), { type: 'set-arrival', instant: at(6, 0), zone: 'UTC' });
  // wake = at(4,0); move fallAsleep after wake → sleep = toMinutes(at(4,0) − at(5,0)) = −60
  const after = scheduleReducer(armed, { type: 'edit-fall-asleep', instant: at(5, 0) });
  expect(after.sleep).toBe(-60);
});

test('edit-arrival shifts the anchor; durations unchanged', () => {
  const armed = scheduleReducer(start(), { type: 'set-arrival', instant: at(6, 0), zone: 'UTC' });
  const after = scheduleReducer(armed, { type: 'edit-arrival', instant: at(7, 0) });
  const d = reverseCalc(toSchedule(after)!);
  expect(DateTime.fromMillis(d.arrival, { zone: 'UTC' }).toFormat('HH:mm')).toBe('07:00');
  expect(after.travel).toBe(SEED_DEFAULTS.travel);
});
