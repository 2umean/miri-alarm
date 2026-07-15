import { Chain, Pill, PILL_TYPES, PillType } from '../domain';
import { Preset, PresetLibrary } from '../domain/preset';
import { sanitizeArrival, sanitizeZone } from './chainSanitize';

/**
 * FROZEN readers for the v2 storage format (schedularm.draft.v2 / armed.v2 /
 * presets.v1) + the v2→v3 pill splitter. The PILL coercion rules are a frozen
 * COPY of the pre-union sanitizePill — deliberately NOT shared with the live
 * sanitizer, so future changes to the v3 boundary can never silently change
 * what old payloads migrate to. (arrival/zone reuse the live sanitizers on
 * purpose: version-agnostic scalars.) Delete this file once the v2 keys are
 * extinct.
 */

type V2Pill = { id: string; icon: string; name: string; dur: number; type: PillType };

function readV2Type(value: unknown): PillType {
  return PILL_TYPES.includes(value as PillType) ? (value as PillType) : 'none';
}

function readV2Dur(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function readV2Pill(value: unknown, index: number): V2Pill | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return {
    id: typeof v.id === 'string' && v.id ? v.id : `pill-${index}`,
    icon: typeof v.icon === 'string' ? v.icon : '',
    name: typeof v.name === 'string' ? v.name : '',
    dur: readV2Dur(v.dur),
    type: readV2Type(v.type),
  };
}

/**
 * The spec's converter. The old pill fired at its own END; the new marker sits
 * at zero duration immediately after the event, so it lands on that same
 * instant — every ring time is byte-identical (legacyV2.test.ts proves it).
 */
function splitV2Pill(p: V2Pill): Pill[] {
  const event: Pill = { id: p.id, type: 'none', icon: p.icon, name: p.name, dur: p.dur };
  return p.type === 'none' ? [event] : [event, { id: `${p.id}~m`, type: p.type }];
}

export function convertV2Pills(value: unknown): Pill[] {
  return (Array.isArray(value) ? value : [])
    .map(readV2Pill)
    .filter((p): p is V2Pill => p !== null)
    .flatMap(splitV2Pill);
}

/** A raw v2 chain payload (draft or armed) → a v3 Chain, or null for missing/corrupt. */
export function migrateV2ChainPayload(raw: string | null): Chain | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    return {
      arrival: sanitizeArrival(obj.arrival),
      zone: sanitizeZone(obj.zone),
      pills: convertV2Pills(obj.pills),
    };
  } catch {
    return null;
  }
}

/** A raw presets.v1 payload → a v2 library with every pill list converted. */
export function migrateV1PresetsPayload(raw: string | null): PresetLibrary | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;

    const seen = new Set<string>();
    const presets: Preset[] = [];
    (Array.isArray(obj.presets) ? obj.presets : []).forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const v = entry as Record<string, unknown>;
      const name = typeof v.name === 'string' ? v.name.trim() : '';
      if (!name) return; // v1 rule: an unnamed preset is corruption — drop it
      const id = typeof v.id === 'string' && v.id ? v.id : `preset-${index}`;
      if (seen.has(id)) return;
      seen.add(id);
      presets.push({ id, name, pills: convertV2Pills(v.pills) });
    });

    const activeId = typeof obj.activeId === 'string' && seen.has(obj.activeId) ? obj.activeId : null;
    return { presets, activeId };
  } catch {
    return null;
  }
}
