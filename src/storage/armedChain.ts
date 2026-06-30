import AsyncStorage from '@react-native-async-storage/async-storage';

import { Chain } from '../domain';
import { parseStoredChain } from './chainSanitize';

/**
 * The *armed* v2 chain snapshot — only exists once an alarm is set. Distinct
 * from the editable draft (draftChain.ts). Shares the SAME parse+sanitize path
 * (parseStoredChain) so the arm-restore path (computeChain reads .pills) can
 * never see a malformed element and can't drift from the draft path.
 */
const ARMED_KEY = 'schedularm.armed.v2';

export async function saveArmedChain(chain: Chain): Promise<void> {
  await AsyncStorage.setItem(ARMED_KEY, JSON.stringify(chain));
}

export async function loadArmedChain(): Promise<Chain | null> {
  return parseStoredChain(await AsyncStorage.getItem(ARMED_KEY));
}

export async function clearArmedChain(): Promise<void> {
  await AsyncStorage.removeItem(ARMED_KEY);
}
