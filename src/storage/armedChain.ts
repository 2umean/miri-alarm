import AsyncStorage from '@react-native-async-storage/async-storage';

import { Chain } from '../domain';
import { parseStoredChain } from './chainSanitize';
import { migrateV2ChainPayload } from './legacyV2';

/**
 * The *armed* chain snapshot — only exists once an alarm is set. Distinct from
 * the editable draft (draftChain.ts). Shares the SAME parse+sanitize path
 * (parseStoredChain). On upgrade the snapshot migrates in place with identical
 * alarm instants (legacyV2 split), and the native alarm store is NOT touched —
 * OS alarms keep ringing on their old ids; the next arm/disarm replaces the
 * set atomically (scheduleAlarms is a full-set replace, dismissAll is not
 * id-keyed), so the transient p1 vs p1~m id mismatch is never observable.
 */
const ARMED_KEY = 'schedularm.armed.v3';
const V2_ARMED_KEY = 'schedularm.armed.v2';

export async function saveArmedChain(chain: Chain): Promise<void> {
  await AsyncStorage.setItem(ARMED_KEY, JSON.stringify(chain));
}

// Concurrent loads share one in-flight read (same rationale as draftChain):
// a raced second load could see v3 unwritten AND v2 already removed, return
// null, and make the boot path silently drop a live armed snapshot.
let pendingLoad: Promise<Chain | null> | null = null;

export function loadArmedChain(): Promise<Chain | null> {
  pendingLoad ??= readArmedChain().finally(() => {
    pendingLoad = null;
  });
  return pendingLoad;
}

async function readArmedChain(): Promise<Chain | null> {
  const raw = await AsyncStorage.getItem(ARMED_KEY);
  if (raw != null) return parseStoredChain(raw);
  const v2raw = await AsyncStorage.getItem(V2_ARMED_KEY);
  if (v2raw == null) return null;
  const migrated = migrateV2ChainPayload(v2raw);
  if (migrated) await AsyncStorage.setItem(ARMED_KEY, JSON.stringify(migrated));
  await AsyncStorage.removeItem(V2_ARMED_KEY);
  return migrated;
}

export async function clearArmedChain(): Promise<void> {
  await AsyncStorage.removeItem(ARMED_KEY);
  await AsyncStorage.removeItem(V2_ARMED_KEY); // a disarm must not leave a resurrectable v2 ghost
}
