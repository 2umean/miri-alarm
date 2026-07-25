import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'schedularm.telemetryConsent.v1';

/** 'unset' = never asked → the one-time ConsentSheet must be shown. */
export type ConsentState = 'granted' | 'denied' | 'unset';

export async function loadConsent(): Promise<ConsentState> {
  try {
    const raw = await AsyncStorage.getItem(CONSENT_KEY);
    return raw === 'granted' || raw === 'denied' ? raw : 'unset';
  } catch {
    return 'unset'; // storage failure must never block the app — fail closed (no collection)
  }
}

export async function saveConsent(state: 'granted' | 'denied'): Promise<void> {
  try {
    await AsyncStorage.setItem(CONSENT_KEY, state);
  } catch {
    // Best-effort: an unpersisted choice re-prompts next launch, which is safe.
  }
}
