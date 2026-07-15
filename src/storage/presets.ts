import AsyncStorage from '@react-native-async-storage/async-storage';

import { Preset, PresetLibrary } from '../domain/preset';
import { sanitizePills } from './chainSanitize';
import { migrateV1PresetsPayload } from './legacyV2';

/**
 * The preset library + active pointer, one payload under a versioned key
 * (internal keys keep the schedularm.* convention — rebrand spec's "kept
 * internal" list). The working draft chain (draftChain.ts) remains the
 * source of truth for what's on screen; while a preset is active this store
 * mirrors it.
 */

const PRESETS_KEY = 'schedularm.presets.v2';
const V1_PRESETS_KEY = 'schedularm.presets.v1';

/** Coerce one stored entry into a valid Preset, or null to drop it. Unlike
    pills (which get fallback values), an unnamed preset is meaningless — the
    creation UI enforces a non-empty name, so junk here is corruption. */
function sanitizePreset(value: unknown, index: number): Preset | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const name = typeof v.name === 'string' ? v.name.trim() : '';
  if (!name) return null;
  return {
    id: typeof v.id === 'string' && v.id ? v.id : `preset-${index}`,
    name,
    pills: sanitizePills(v.pills),
  };
}

/** Parse a stored payload into a sanitised library, or null for missing/corrupt. */
export function parseStoredPresets(raw: string | null): PresetLibrary | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;

    const seen = new Set<string>();
    const presets: Preset[] = [];
    (Array.isArray(obj.presets) ? obj.presets : []).forEach((entry, index) => {
      const preset = sanitizePreset(entry, index);
      if (preset && !seen.has(preset.id)) {
        seen.add(preset.id);
        presets.push(preset);
      }
    });

    const activeId =
      typeof obj.activeId === 'string' && seen.has(obj.activeId) ? obj.activeId : null;
    return { presets, activeId };
  } catch {
    return null;
  }
}

// Concurrent loads share one in-flight read (same rationale as draft/armed):
// a future boot re-arm reads presets concurrently with usePresets' own hydrate.
let pendingLoad: Promise<PresetLibrary | null> | null = null;

export function loadPresets(): Promise<PresetLibrary | null> {
  pendingLoad ??= readPresets().finally(() => {
    pendingLoad = null;
  });
  return pendingLoad;
}

async function readPresets(): Promise<PresetLibrary | null> {
  const raw = await AsyncStorage.getItem(PRESETS_KEY);
  if (raw != null) return parseStoredPresets(raw);
  const v1raw = await AsyncStorage.getItem(V1_PRESETS_KEY);
  if (v1raw == null) return null;
  const migrated = migrateV1PresetsPayload(v1raw);
  // Re-check before writing: defends against a hypothetical ungated future
  // writer — today's only savePresets caller is gated on hydration, but the
  // armed-chain path proved this race class real, so all three stores share
  // the shape.
  const winner = await AsyncStorage.getItem(PRESETS_KEY);
  if (winner != null) {
    await AsyncStorage.removeItem(V1_PRESETS_KEY);
    return parseStoredPresets(winner);
  }
  if (migrated) await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(migrated));
  await AsyncStorage.removeItem(V1_PRESETS_KEY);
  return migrated;
}

export async function savePresets(library: PresetLibrary): Promise<void> {
  await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(library));
}
