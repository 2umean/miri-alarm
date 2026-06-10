import {
  Schedule,
  editArrival,
  editFallAsleep,
  editLeaveHome,
  editWake,
} from '../domain';
import { Durations } from '../storage/presets';

export type DurationField = keyof Durations;

export type ScheduleState = {
  arrival: number | null; // epoch ms, or null before entry
  zone: string;
  contingency: number;
  travel: number;
  prep: number;
  sleep: number;
};

export type ScheduleAction =
  | { type: 'set-arrival'; instant: number; zone: string }
  | { type: 'set-duration'; field: DurationField; minutes: number }
  | { type: 'edit-wake'; instant: number }
  | { type: 'edit-leave-home'; instant: number }
  | { type: 'edit-fall-asleep'; instant: number }
  | { type: 'edit-arrival'; instant: number };

export function initialState(durations: Durations, zone: string): ScheduleState {
  return { arrival: null, zone, ...durations };
}

/** Project state to a domain Schedule, or null if no arrival yet. */
export function toSchedule(state: ScheduleState): Schedule | null {
  if (state.arrival == null) return null;
  return {
    arrival: state.arrival,
    zone: state.zone,
    contingency: state.contingency,
    travel: state.travel,
    prep: state.prep,
    sleep: state.sleep,
  };
}

function writeBack(state: ScheduleState, s: Schedule): ScheduleState {
  return { ...state, ...s };
}

/**
 * Edits use editResolver and accept the result even when infeasible (a negative
 * duration is displayed; validation gates arming — spec §6). Edits before an
 * arrival exists are no-ops.
 */
export function scheduleReducer(state: ScheduleState, action: ScheduleAction): ScheduleState {
  switch (action.type) {
    case 'set-arrival':
      return { ...state, arrival: action.instant, zone: action.zone };
    case 'set-duration':
      return { ...state, [action.field]: action.minutes };
    case 'edit-wake': {
      const s = toSchedule(state);
      return s ? writeBack(state, editWake(s, action.instant).schedule) : state;
    }
    case 'edit-leave-home': {
      const s = toSchedule(state);
      return s ? writeBack(state, editLeaveHome(s, action.instant).schedule) : state;
    }
    case 'edit-fall-asleep': {
      const s = toSchedule(state);
      return s ? writeBack(state, editFallAsleep(s, action.instant).schedule) : state;
    }
    case 'edit-arrival': {
      const s = toSchedule(state);
      return s ? writeBack(state, editArrival(s, action.instant).schedule) : state;
    }
    default:
      return state;
  }
}
