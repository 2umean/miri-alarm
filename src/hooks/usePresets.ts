import { useEffect, useMemo, useReducer, useState } from 'react';

import { Pill } from '../domain/pill';
import { loadPresets, savePresets } from '../storage/presets';
import { INITIAL_PRESETS, presetsReducer } from '../state/presetsReducer';

// Session-unique preset ids (same rationale as useChain's makeId).
let idCounter = 0;
const makeId = (): string => `ps${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/**
 * Store hook for the preset library, the twin of useChain: restores on
 * launch (exposing `hydrated`), persists every change after hydration, and
 * exposes id-minting action helpers so the UI never touches the reducer's
 * raw shape. The mirror effect itself lives in ChainScreen — it needs both
 * this hook's state and the chain's.
 */
export function usePresets() {
  const [state, dispatch] = useReducer(presetsReducer, INITIAL_PRESETS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await loadPresets();
        if (cancelled) return;
        if (stored) dispatch({ type: 'hydrate', state: stored });
      } catch {
        // Storage failure — keep the empty initial state; hydrated must
        // still flip so the screen's paint gate opens.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every change — only after hydration, so the empty initial state
  // never clobbers the stored library.
  useEffect(() => {
    if (hydrated) void savePresets(state);
  }, [state, hydrated]);

  const activePreset = useMemo(
    () => state.presets.find((p) => p.id === state.activeId) ?? null,
    [state],
  );

  const createPreset = (name: string, pills: Pill[]): string => {
    const id = makeId();
    dispatch({ type: 'create', id, name, pills });
    return id;
  };
  const renamePreset = (id: string, name: string) => dispatch({ type: 'rename', id, name });
  const removePreset = (id: string) => dispatch({ type: 'remove', id });
  const applyPreset = (id: string) => dispatch({ type: 'apply', id });
  const syncActive = (pills: Pill[]) => dispatch({ type: 'sync-active', pills });

  return {
    presets: state.presets,
    activeId: state.activeId,
    activePreset,
    hydrated,
    createPreset,
    renamePreset,
    removePreset,
    applyPreset,
    syncActive,
  };
}
