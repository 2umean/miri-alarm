import { useEffect, useLayoutEffect, useMemo, useReducer, useState } from 'react';
import { DateTime } from 'luxon';

import {
  Chain,
  PillType,
  computeChain,
  isChainArmable,
  rollChainToFuture,
  validateChain,
} from '../domain';
import { t } from '../i18n';
import {
  clearLegacyDraft,
  loadDraftChain,
  loadLegacyDraft,
  saveDraftChain,
} from '../storage/draftChain';
import { ChainState, chainReducer, initialChainState } from '../state/chainReducer';
import { migratedChain, reconcileAndRoll, seedPills } from '../state/chainHydrate';

const NOW_TICK_MS = 60_000;

// Session-unique pill ids. Math.random/Date.now are fine in app code (the purity
// constraint is for domain/reducer/workflow scripts, not React hooks).
let idCounter = 0;
const makeId = (): string => `p${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
const resolveName = (key: string): string => t(key);

export type PillInput = { icon: string; name: string; dur: number; type: PillType };

/**
 * v2 twin of useSchedule: restores the chain (v2 draft → migrate v1 → empty),
 * persists every change, ticks `now`, and always shows the chain rolled to its
 * next future occurrence. Exposes id-minting action helpers so the UI never
 * touches the reducer's raw shape.
 */
export function useChain() {
  const zone = useMemo(() => DateTime.local().zoneName ?? 'UTC', []);
  const [state, dispatch] = useReducer(chainReducer, undefined, () => initialChainState(zone));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hydrated, setHydrated] = useState(false);

  // Restore on launch: saved v2 draft → migrate a legacy v1 draft → empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadDraftChain();
      if (cancelled) return;
      if (draft) {
        dispatch({ type: 'hydrate', chain: reconcileAndRoll(draft, zone, Date.now()) });
      } else {
        const legacy = await loadLegacyDraft();
        if (cancelled) return;
        if (legacy && legacy.arrival != null) {
          const migrated = migratedChain(legacy, zone, resolveName, makeId);
          dispatch({ type: 'hydrate', chain: reconcileAndRoll(migrated, zone, Date.now()) });
          await clearLegacyDraft();
        }
        // else: keep the empty initial state (no arrival yet).
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [zone]);

  // Persist every change — only after hydration, so the initial state never
  // clobbers the stored draft.
  useEffect(() => {
    if (hydrated) void saveDraftChain(state);
  }, [state, hydrated]);

  // Re-evaluate past-event / bedtime and re-roll as time passes.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // The chain shown and armed is always rolled to its next future occurrence.
  const chain = useMemo(() => rollChainToFuture(state, nowMs), [state, nowMs]);

  // Sync the stored anchor to the rolled value so edits operate on the instant the
  // user sees (layout effect → before paint; idempotent once future).
  useLayoutEffect(() => {
    if (chain.arrival != null && chain.arrival !== state.arrival) {
      dispatch({ type: 'roll-arrival', instant: chain.arrival });
    }
  }, [chain.arrival, state.arrival]);

  const computed = useMemo(() => computeChain(chain), [chain]);
  const issues = useMemo(() => validateChain(chain, nowMs), [chain, nowMs]);
  const armable = chain.arrival != null && isChainArmable(issues);

  // ----- id-minting action helpers (the UI's only entry points) -----

  /** Set the arrival. First entry captures the zone and seeds the default pills. */
  const setArrival = (instant: number) => {
    if (state.arrival == null) {
      dispatch({ type: 'set-arrival', instant, zone });
      if (state.pills.length === 0) {
        seedPills(resolveName, makeId).forEach((pill) => dispatch({ type: 'add-pill', pill }));
      }
    } else {
      dispatch({ type: 'edit-arrival', instant });
    }
  };

  const addPill = (input: PillInput, index?: number) =>
    dispatch({ type: 'add-pill', pill: { id: makeId(), ...input }, index });
  const updatePill = (id: string, patch: Partial<PillInput>) =>
    dispatch({ type: 'update-pill', id, patch });
  const removePill = (id: string) => dispatch({ type: 'remove-pill', id });
  const reorderPill = (from: number, to: number) =>
    dispatch({ type: 'reorder-pill', from, to });

  return {
    state,
    chain,
    computed,
    issues,
    armable,
    zone,
    nowMs,
    hydrated,
    setArrival,
    addPill,
    updatePill,
    removePill,
    reorderPill,
  };
}
