import { MINUTE_MS, Schedule, DerivedSchedule } from './schedule';

/** Pure epoch-ms subtraction — elapsed real time, so gaps are DST-safe by construction. */
export function reverseCalc(s: Schedule): DerivedSchedule {
  const leaveHome = s.arrival - (s.contingency + s.travel) * MINUTE_MS;
  const wake = leaveHome - s.prep * MINUTE_MS;
  const fallAsleep = wake - s.sleep * MINUTE_MS;
  return { arrival: s.arrival, leaveHome, wake, fallAsleep };
}
