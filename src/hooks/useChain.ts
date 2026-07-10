import { useEffect, useLayoutEffect, useMemo, useReducer, useState } from 'react';
import { DateTime } from 'luxon';

import {
  Chain,
  Pill,
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
import { chainReducer, initialChainState } from '../state/chainReducer';
import { migratedChain, reconcileAndRoll, withDefaultArrival } from '../state/chainHydrate';

const NOW_TICK_MS = 60_000;

// Session-unique pill ids. Math.random/Date.now are fine in app code (the purity
// constraint is for domain/reducer/workflow scripts, not React hooks).
let idCounter = 0;
const makeId = (): string => `p${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
const resolveName = (key: string): string => t(key);

export type PillInput = { icon: string; name: string; dur: number; type: PillType };

/**
 * v2 twin of useSchedule: restores the chain (v2 draft → migrate v1 → seeded
 * default), persists every change, ticks `now`, and always shows the chain
 * rolled to its next future occurrence. Exposes id-minting action helpers so
 * the UI never touches the reducer's raw shape. Every path runs through
 * withDefaultArrival, so a chain ALWAYS has an arrival anchor (next 09:00 by
 * default) — there is no "set your arrival first" state.
 */
export function useChain() {
  const zone = useMemo(() => DateTime.local().zoneName ?? 'UTC', []);
  const [state, dispatch] = useReducer(chainReducer, undefined, () =>
    withDefaultArrival(initialChainState(zone), zone, Date.now(), resolveName, makeId),
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hydrated, setHydrated] = useState(false);

  // Restore on launch: saved v2 draft → migrate a legacy v1 draft → seeded default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadDraftChain();
        if (cancelled) return;
        if (draft) {
          // withDefaultArrival covers drafts saved before an arrival was ever set.
          const now = Date.now();
          const restored = withDefaultArrival(
            reconcileAndRoll(draft, zone, now),
            zone,
            now,
            resolveName,
            makeId,
          );
          dispatch({ type: 'hydrate', chain: restored });
        } else {
          const legacy = await loadLegacyDraft();
          if (cancelled) return;
          if (legacy && legacy.arrival != null) {
            const migrated = migratedChain(legacy, zone, resolveName, makeId);
            dispatch({ type: 'hydrate', chain: reconcileAndRoll(migrated, zone, Date.now()) });
            await clearLegacyDraft();
          }
          // else: keep the seeded default initial state.
        }
      } catch {
        // Storage failure — proceed with the seeded default initial state; the
        // UI gates first paint on `hydrated`, so it must flip even on error.
      } finally {
        if (!cancelled) setHydrated(true);
      }
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

  /** Move the arrival anchor. (The first arrival + seed pills come from withDefaultArrival.) */
  const setArrival = (instant: number) => dispatch({ type: 'edit-arrival', instant });

  const addPill = (input: PillInput, index?: number): string => {
    const id = makeId();
    dispatch({ type: 'add-pill', pill: { id, ...input }, index });
    return id;
  };
  const updatePill = (id: string, patch: Partial<PillInput>) =>
    dispatch({ type: 'update-pill', id, patch });
  const removePill = (id: string) => dispatch({ type: 'remove-pill', id });
  const reorderPill = (from: number, to: number) =>
    dispatch({ type: 'reorder-pill', from, to });
  /** Wholesale pill swap (preset apply); arrival & zone untouched. */
  const replacePills = (pills: Pill[]) => dispatch({ type: 'replace-pills', pills });

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
    replacePills,
  };
}
