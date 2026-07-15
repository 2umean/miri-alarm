import AsyncStorage from '@react-native-async-storage/async-storage';

import { Chain } from '../domain';
import { LegacyDurations } from '../domain/chainMigration';
import { parseStoredChain, sanitizeArrival, sanitizeZone } from './chainSanitize';
import { migrateV2ChainPayload } from './legacyV2';

/**
 * The whole in-progress (editable) v2 chain — arrival anchor + captured zone +
 * ordered pills. Persisted on every change and restored on launch so nothing
 * resets across app restarts. Distinct from the *armed* snapshot.
 *
 * Stored under a v3 key; the legacy v1 draft is read separately
 * (loadLegacyDraft) so the Phase 2 hook can migrate it into a chain.
 */

const DRAFT_KEY = 'schedularm.draft.v3';
const V2_DRAFT_KEY = 'schedularm.draft.v2';
const LEGACY_DRAFT_KEY = 'schedularm.draft.v1';

// Concurrent loads share one in-flight read: a raced second load could
// otherwise see v3 (not yet written) AND v2 (already removed) both empty,
// return null, and let the caller's default state clobber migrated data.
let pendingLoad: Promise<Chain | null> | null = null;

export function loadDraftChain(): Promise<Chain | null> {
  pendingLoad ??= readDraftChain().finally(() => {
    pendingLoad = null;
  });
  return pendingLoad;
}

async function readDraftChain(): Promise<Chain | null> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  if (raw != null) return parseStoredChain(raw);
  // One-time v2 → v3 migration: read, convert (ring-time-preserving split),
  // persist under v3, clear v2. A corrupt v2 payload converts to null and is
  // still cleared — a fresh seed beats a permanent parse-crash loop.
  const v2raw = await AsyncStorage.getItem(V2_DRAFT_KEY);
  if (v2raw == null) return null;
  const migrated = migrateV2ChainPayload(v2raw);
  if (migrated) await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(migrated));
  await AsyncStorage.removeItem(V2_DRAFT_KEY);
  return migrated;
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
