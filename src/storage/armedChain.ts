import AsyncStorage from '@react-native-async-storage/async-storage';

import { Chain } from '../domain';

/**
 * The *armed* v2 chain snapshot — only exists once an alarm is set. Distinct
 * from the editable draft (draftChain.ts). Mirrors armedSchedule.ts (v1) but
 * stores a Chain; light shape-guarding on load so a corrupt value can't crash
 * the arm-restore path (computeChain reads .pills).
 */
const ARMED_KEY = 'schedularm.armed.v2';

export async function saveArmedChain(chain: Chain): Promise<void> {
  await AsyncStorage.setItem(ARMED_KEY, JSON.stringify(chain));
}

export async function loadArmedChain(): Promise<Chain | null> {
  const raw = await AsyncStorage.getItem(ARMED_KEY);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as unknown;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    const obj = c as Record<string, unknown>;
    return {
      arrival: typeof obj.arrival === 'number' ? obj.arrival : null,
      zone: typeof obj.zone === 'string' && obj.zone ? obj.zone : 'UTC',
      pills: Array.isArray(obj.pills) ? (obj.pills as Chain['pills']) : [],
    };
  } catch {
    return null;
  }
}

export async function clearArmedChain(): Promise<void> {
  await AsyncStorage.removeItem(ARMED_KEY);
}
