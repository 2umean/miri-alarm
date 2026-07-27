import { useSyncExternalStore } from 'react';
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
} from 'react-native-google-mobile-ads';

import { track } from '../telemetry';

export type AdsState = {
  /** SDK initialized and consent allows ad requests — banners may render. */
  canShowAds: boolean;
  /** UMP requires a persistent privacy-options entry point (EEA users). */
  isPrivacyOptionsRequired: boolean;
};

let state: AdsState = { canShowAds: false, isPrivacyOptionsRequired: false };
let ready: Promise<void> | null = null;
let isSdkStarted = false;
const listeners = new Set<() => void>();

function emit(next: AdsState): void {
  if (
    next.canShowAds === state.canShowAds &&
    next.isPrivacyOptionsRequired === state.isPrivacyOptionsRequired
  ) {
    return;
  }
  state = next;
  listeners.forEach((listener) => listener());
}

async function syncFromConsentInfo(): Promise<void> {
  const info = await AdsConsent.getConsentInfo();
  const isPrivacyOptionsRequired =
    info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  if (!info.canRequestAds) {
    emit({ canShowAds: false, isPrivacyOptionsRequired });
    return;
  }
  if (!isSdkStarted) {
    // Latch only after success: if initialize() rejects on the fast path,
    // the post-gatherConsent sync must retry instead of skipping init and
    // reporting canShowAds for an uninitialized SDK. GMA initialize() is
    // idempotent, so a rare double call is safe.
    await mobileAds().initialize();
    isSdkStarted = true;
  }
  emit({ canShowAds: true, isPrivacyOptionsRequired });
}

export function initAds(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // Fast path first: UMP reuses the previous session's consent, so
      // returning users get ads without waiting on the network (official
      // react-native-google-mobile-ads consent pattern).
      await syncFromConsentInfo().catch(() => {});
      await AdsConsent.gatherConsent();
      await syncFromConsentInfo();
    })().catch(() => {
      // Ads must never break startup; UMP retries next launch.
      track('ads_init_failed', {});
    });
  }
  return ready;
}

export function showAdsPrivacyOptions(): void {
  AdsConsent.showPrivacyOptionsForm()
    .then(() => syncFromConsentInfo())
    .catch(() => {});
}

export function getAdsState(): AdsState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAdsState(): AdsState {
  return useSyncExternalStore(subscribe, getAdsState);
}
