import AsyncStorage from '@react-native-async-storage/async-storage';

import { Chain } from '../domain';
import { LegacyDurations } from '../domain/chainMigration';
import { parseStoredChain, sanitizeArrival, sanitizeZone } from './chainSanitize';

/**
 * The whole in-progress (editable) v2 chain — arrival anchor + captured zone +
 * ordered pills. Persisted on every change and restored on launch so nothing
 * resets across app restarts. Distinct from the *armed* snapshot.
 *
 * Stored under a new v2 key; the legacy v1 draft is read separately
 * (loadLegacyDraft) so the Phase 2 hook can migrate it into a chain.
 */

const DRAFT_KEY = 'schedularm.draft.v2';
const LEGACY_DRAFT_KEY = 'schedularm.draft.v1';

export async function loadDraftChain(): Promise<Chain | null> {
  return parseStoredChain(await AsyncStorage.getItem(DRAFT_KEY));
}

export async function saveDraftChain(chain: Chain): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(chain));
}

export async function clearDraftChain(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}

/** A legacy v1 draft, reduced to what a v2 migration needs (durations + anchor + zone). */
export type LegacyDraft = LegacyDurations & { arrival: number | null; zone: string };

/** Non-negative whole-minute coercion; non-finite → 0. */
function legacyMinutes(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/**
 * Read the legacy v1 draft (if any) so the Phase 2 hook can migrate it. Does NOT
 * delete it — the caller clears it (clearLegacyDraft) only after a successful
 * migration, so a crash mid-migration leaves the source intact.
 */
export async function loadLegacyDraft(): Promise<LegacyDraft | null> {
  const raw = await AsyncStorage.getItem(LEGACY_DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const p = parsed as Record<string, unknown>;
    return {
      arrival: sanitizeArrival(p.arrival),
      zone: sanitizeZone(p.zone),
      contingency: legacyMinutes(p.contingency),
      travel: legacyMinutes(p.travel),
      prep: legacyMinutes(p.prep),
      sleep: legacyMinutes(p.sleep),
    };
  } catch {
    return null;
  }
}

export async function clearLegacyDraft(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_DRAFT_KEY);
}
