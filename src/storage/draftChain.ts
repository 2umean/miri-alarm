import AsyncStorage from '@react-native-async-storage/async-storage';
import { IANAZone } from 'luxon';

import { Chain, Pill, PILL_TYPES, PillType } from '../domain/pill';
import { LegacyDurations } from '../domain/chainMigration';

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

/** A stored arrival is only trusted if it's a finite, strictly-positive instant. */
function sanitizeArrival(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** A stored zone is only trusted if it's a real IANA zone; anything else → UTC. */
function sanitizeZone(value: unknown): string {
  return typeof value === 'string' && IANAZone.isValidZone(value) ? value : 'UTC';
}

function sanitizeType(value: unknown): PillType {
  return PILL_TYPES.includes(value as PillType) ? (value as PillType) : 'none';
}

/**
 * Round a stored duration to whole minutes; non-finite → 0. Deliberately does
 * NOT clamp into range: the reducer stores durations verbatim and validation is
 * the gate (chainValidation), so an out-of-range value must survive a reload and
 * keep failing validation rather than be silently rewritten to a value the user
 * never chose. (Mirrors the store-verbatim contract; save → load round-trips.)
 */
function sanitizeDur(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Coerce one stored entry into a valid Pill, or null if it isn't a plain object. */
function sanitizePill(value: unknown, index: number): Pill | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return {
    id: typeof v.id === 'string' && v.id ? v.id : `pill-${index}`,
    icon: typeof v.icon === 'string' ? v.icon : '',
    name: typeof v.name === 'string' ? v.name : '',
    dur: sanitizeDur(v.dur),
    type: sanitizeType(v.type),
  };
}

export async function loadDraftChain(): Promise<Chain | null> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    // A bare JSON primitive (5, true, "x") or array isn't a draft — treat as absent
    // so callers reliably distinguish "no draft → seed" from a restored empty chain.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    const pillsRaw = Array.isArray(obj.pills) ? obj.pills : [];
    return {
      arrival: sanitizeArrival(obj.arrival),
      zone: sanitizeZone(obj.zone),
      pills: pillsRaw.map(sanitizePill).filter((p): p is Pill => p !== null),
    };
  } catch {
    return null;
  }
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
