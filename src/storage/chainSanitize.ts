import { IANAZone } from 'luxon';

import { Chain, Pill, PILL_TYPES, PillType } from '../domain';

/**
 * Shared boundary sanitizers for persisted chains. Used by BOTH draftChain and
 * armedChain so the two storage paths can't drift (the armed-restore path reads
 * .pills straight into computeChain, so a malformed element must be dropped here
 * rather than reaching the engine as NaN/undefined).
 */

/** A stored arrival is only trusted if it's a finite, strictly-positive instant. */
export function sanitizeArrival(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** A stored zone is only trusted if it's a real IANA zone; anything else → UTC. */
export function sanitizeZone(value: unknown): string {
  return typeof value === 'string' && IANAZone.isValidZone(value) ? value : 'UTC';
}

function sanitizeType(value: unknown): PillType {
  return PILL_TYPES.includes(value as PillType) ? (value as PillType) : 'none';
}

/**
 * Round a stored duration to whole minutes; non-finite → 0. Deliberately does
 * NOT clamp into range — the reducer stores durations verbatim and validation is
 * the gate, so an out-of-range value survives a reload and keeps failing
 * validation rather than being silently rewritten (store-verbatim contract).
 */
function sanitizeDur(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Coerce one stored entry into a valid Pill, or null if it isn't a plain
 * object. Branches on the SANITIZED type and emits the matching union member:
 * a marker keeps only {id, type} (stray event fields are dropped), an event
 * gets fallback values. This is the shared boundary for draft AND armed — a
 * malformed element must be normalised here, never reach the engine.
 */
export function sanitizePill(value: unknown, index: number): Pill | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const id = typeof v.id === 'string' && v.id ? v.id : `pill-${index}`;
  const type = sanitizeType(v.type);
  if (type !== 'none') return { id, type };
  return {
    id,
    type,
    icon: typeof v.icon === 'string' ? v.icon : '',
    name: typeof v.name === 'string' ? v.name : '',
    dur: sanitizeDur(v.dur),
  };
}

/** Coerce a stored pills value into a clean Pill[] (non-array → empty; junk entries dropped). */
export function sanitizePills(value: unknown): Pill[] {
  return (Array.isArray(value) ? value : [])
    .map(sanitizePill)
    .filter((p): p is Pill => p !== null);
}

/**
 * Parse a stored chain payload (draft OR armed) into a sanitised Chain, or null
 * for a missing / corrupt / non-object payload. The single parse+guard+wrapper
 * shared by both restore paths so they can't drift (a bare JSON primitive or
 * array is treated as absent, so callers reliably distinguish "no chain" from a
 * restored empty chain).
 */
export function parseStoredChain(raw: string | null): Chain | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    return {
      arrival: sanitizeArrival(obj.arrival),
      zone: sanitizeZone(obj.zone),
      pills: sanitizePills(obj.pills),
    };
  } catch {
    return null;
  }
}
