import { Chain, Pill } from '../domain/pill';

/**
 * v2 reducer over the Chain. Deliberately primitive: it mutates structure only.
 * Higher-level orchestration that needs i18n or id generation — seeding default
 * pills when an arrival is first set, migrating a legacy draft — lives in the
 * Phase 2 hook, so this stays pure and trivially testable. Durations are stored
 * as given (even if infeasible); validation is the gate, mirroring v1.
 */

export type ChainState = Chain;

export type PillPatch = Partial<Pick<Pill, 'icon' | 'name' | 'dur' | 'type'>>;

export type ChainAction =
  // Replace the whole state from a restored draft (storage → reducer).
  | { type: 'hydrate'; chain: ChainState }
  // First arrival entry — captures the zone alongside the anchor.
  | { type: 'set-arrival'; instant: number; zone: string }
  // Move an EXISTING anchor; zone and pills untouched. No-op before an arrival
  // exists — first entry must go through set-arrival, which captures the zone.
  | { type: 'edit-arrival'; instant: number }
  // Advance the anchor to its next future occurrence (rollChainToFuture); no-op before an arrival exists.
  | { type: 'roll-arrival'; instant: number }
  // Insert an already-built pill (the UI mints its id) at `index` (default: end).
  | { type: 'add-pill'; pill: Pill; index?: number }
  | { type: 'remove-pill'; id: string }
  // Move the pill at `from` to `to` (drag-reorder). Out-of-range or no-op indices are ignored.
  | { type: 'reorder-pill'; from: number; to: number }
  // Patch any of a pill's editable fields (rename / re-icon / re-type / change duration).
  | { type: 'update-pill'; id: string; patch: PillPatch };

export function initialChainState(zone: string): ChainState {
  return { arrival: null, zone, pills: [] };
}

/** Clamp an insertion point into [0, len]; non-finite → append at the end. */
function clampInsertIndex(index: number, len: number): number {
  if (!Number.isFinite(index)) return len;
  return Math.max(0, Math.min(len, Math.trunc(index)));
}

export function chainReducer(state: ChainState, action: ChainAction): ChainState {
  switch (action.type) {
    case 'hydrate':
      return action.chain;
    case 'set-arrival':
      return { ...state, arrival: action.instant, zone: action.zone };
    case 'edit-arrival':
      return state.arrival == null ? state : { ...state, arrival: action.instant };
    case 'roll-arrival':
      return state.arrival == null ? state : { ...state, arrival: action.instant };
    case 'add-pill': {
      const index = clampInsertIndex(action.index ?? state.pills.length, state.pills.length);
      return {
        ...state,
        pills: [...state.pills.slice(0, index), action.pill, ...state.pills.slice(index)],
      };
    }
    case 'remove-pill':
      return { ...state, pills: state.pills.filter((p) => p.id !== action.id) };
    case 'reorder-pill': {
      const { from, to } = action;
      const n = state.pills.length;
      if (from < 0 || from >= n || to < 0 || to >= n || from === to) return state;
      const pills = [...state.pills];
      const [moved] = pills.splice(from, 1);
      pills.splice(to, 0, moved);
      return { ...state, pills };
    }
    case 'update-pill':
      return {
        ...state,
        pills: state.pills.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      };
    default:
      return state;
  }
}
