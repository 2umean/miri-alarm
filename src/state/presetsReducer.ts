import { Pill } from '../domain/pill';
import { Preset, PresetLibrary } from '../domain/preset';

/**
 * Pure reducer over the preset library, the twin of chainReducer: structure
 * only — no i18n, id generation, or storage (usePresets wires those). The
 * activeId invariant (null or an existing preset's id) is enforced here on
 * remove and by storage sanitizing on load; create/apply keep it by
 * construction.
 */

export type PresetsState = PresetLibrary;

export type PresetsAction =
  // Replace the whole state from a restored payload (storage → reducer).
  | { type: 'hydrate'; state: PresetsState }
  // Append an already-built preset (the hook mints its id) and make it active.
  | { type: 'create'; id: string; name: string; pills: Pill[] }
  | { type: 'rename'; id: string; name: string }
  // Drop a preset; deleting the active one activates the FIRST remaining
  // (design decision D3: 현재 일정 exists only while the library is empty).
  | { type: 'remove'; id: string }
  // Point the mirror at a preset (the caller swaps the working pills).
  | { type: 'apply'; id: string }
  // Live mirror: overwrite the active preset's pills after a home edit.
  | { type: 'sync-active'; pills: Pill[] };

export const INITIAL_PRESETS: PresetsState = { presets: [], activeId: null };

/**
 * The delete-active successor rule. Exported so the screen orchestration
 * (which must also apply the successor's pills to the chain) uses the exact
 * rule the reducer applies — the two cannot diverge.
 */
export function firstRemaining(presets: Preset[], removedId: string): Preset | null {
  return presets.find((p) => p.id !== removedId) ?? null;
}

export function presetsReducer(state: PresetsState, action: PresetsAction): PresetsState {
  switch (action.type) {
    case 'hydrate':
      return action.state;
    case 'create':
      return {
        presets: [...state.presets, { id: action.id, name: action.name, pills: action.pills }],
        activeId: action.id,
      };
    case 'rename':
      return {
        ...state,
        presets: state.presets.map((p) =>
          p.id === action.id ? { ...p, name: action.name } : p,
        ),
      };
    case 'remove': {
      const presets = state.presets.filter((p) => p.id !== action.id);
      const activeId =
        state.activeId === action.id
          ? (firstRemaining(state.presets, action.id)?.id ?? null)
          : state.activeId;
      return { presets, activeId };
    }
    case 'apply':
      return state.presets.some((p) => p.id === action.id)
        ? { ...state, activeId: action.id }
        : state;
    case 'sync-active':
      if (state.activeId == null) return state;
      return {
        ...state,
        presets: state.presets.map((p) =>
          p.id === state.activeId ? { ...p, pills: action.pills } : p,
        ),
      };
    default:
      return state;
  }
}
