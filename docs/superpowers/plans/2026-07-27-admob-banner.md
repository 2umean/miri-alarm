# AdMob Banner (v0.7.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One anchored adaptive AdMob banner at the bottom of ChainScreen, gated by Google UMP consent, with an EEA-only "ad privacy" footer entry — nothing else.

**Architecture:** New `src/ads/` module mirroring `src/telemetry/`: a facade (`adsState.ts`) that runs UMP consent every launch and initializes the GMA SDK only when `canRequestAds` is true, exposed to React via a `useSyncExternalStore` hook; a self-contained `AdBanner` component that stays zero-height until an ad actually loads. Native config comes entirely from the `react-native-google-mobile-ads` Expo config plugin (CNG — `android/`/`ios/` are gitignored prebuild artifacts).

**Tech Stack:** react-native-google-mobile-ads **16.3.4 exact-pin** (see constraint below), Expo SDK 56 / RN 0.85.3 / React 19.2, ts-jest + react-test-renderer.

**Spec:** `docs/superpowers/specs/2026-07-27-admob-banner-design.md`

---

## Research-verified constraints (2026-07-27, do not re-derive)

- **Version pin:** npm latest **16.4.0 breaks Android builds** on this stack — its Android GMA SDK 25.4.0 ships Kotlin 2.3.0 metadata; RN 0.85.3 pins Kotlin 2.1.20 (`node_modules/react-native/gradle/libs.versions.toml`). Invertase issue #863; fix PR #866 unmerged. Exact-pin **16.3.4** (JS API byte-identical to 16.4.0, verified by tarball diff). Never `npx expo install` this package (not in bundledNativeModules → resolves broken latest).
- **Verified API names (from the 16.3.4 package typings, not docs):**
  - `AdsConsent.gatherConsent(options?)` = `requestInfoUpdate` + `loadAndShowConsentFormIfRequired`; `AdsConsent.getConsentInfo()`; `AdsConsent.showPrivacyOptionsForm()`.
  - `AdsConsentInfo = { status, canRequestAds: boolean, privacyOptionsRequirementStatus, isConsentFormAvailable }`; `AdsConsentPrivacyOptionsRequirementStatus` is a **string enum** `'UNKNOWN' | 'REQUIRED' | 'NOT_REQUIRED'`.
  - `mobileAds()` is the **default export**; `mobileAds().initialize(): Promise<AdapterStatus[]>`.
  - `BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER` (plain `ANCHORED_ADAPTIVE_BANNER` is `@deprecated` in 16.3.x). `TestIds.ADAPTIVE_BANNER` exists and is platform-resolved.
  - `BannerAd` props: required `unitId`, `size`; events `onAdLoaded(({width, height}))`, `onAdFailedToLoad((error: Error))`; **does not forward `style`** — wrap in a `View`. `useForeground` hook is exported from the package root (iOS WKWebView-suspension reload pattern).
  - Config plugin option keys (exact): `androidAppId`, `iosAppId`, `userTrackingUsageDescription`, `skAdNetworkItems`, `delayAppMeasurementInit`. Missing app IDs ⇒ **crash on launch** on that platform. The plugin does NOT auto-inject SKAdNetwork IDs — the full 50-item list must be passed explicitly.
- **Ad unit / app IDs (AdMob console, collected 2026-07-27):**
  - Android app `ca-app-pub-5599052038923907~8575489973`, banner unit `ca-app-pub-5599052038923907/7030353875`
  - iOS app `ca-app-pub-5599052038923907~5702060414`, banner unit `ca-app-pub-5599052038923907/8244317487`
- **Repo anchors (verified):** entry `App.tsx` (initTelemetry effect at lines 32–34); `src/ui/screens/ChainScreen.tsx` — `</ScrollView>` closes at line 348, sheets start line 350, footerLinks row at lines 331–347, scroll `paddingBottom: insets.bottom + spacing.xxl` at line 197; jest maps `react-native` to `test/stubs/react-native.js` (string host components, **no** `__DEV__` defined in `test/setup.js` today); i18n = `src/i18n/en.ts` + `src/i18n/ko.ts`.
- **QA note:** dev clients existing today do NOT contain this native module — every on-device/simulator step needs a fresh build.

## File structure

| File | Responsibility |
|---|---|
| `skAdNetworkItems.js` (repo root, new) | The 50 SKAdNetwork IDs, imported by app.config.ts. (Shipped as CJS `.js`, not the originally planned `.ts`: Expo SDK 56 transpiles only the entry app.config.ts, so nested extensionless `.ts` imports fail under Node 22 require — verified during Task 2.) |
| `app.config.ts` (modify) | Add the RNGMA config plugin entry |
| `locales/ko.json` (modify) | Korean ATT usage description |
| `src/ads/adsState.ts` (new) | Facade: initAds / consent sync / SDK init guard / useAdsState / showAdsPrivacyOptions |
| `src/ads/unitId.ts` (new) | Real unit IDs + dev/release resolver (pure, testable) |
| `src/ads/AdBanner.tsx` (new) | Banner component: consent-gated, zero-height until loaded, safe-area aware |
| `src/ads/index.ts` (new) | Barrel export (no logic) |
| `src/ads/__tests__/*` (new) | Facade, resolver, and component tests |
| `src/telemetry/events.ts` (modify) | Add `ads_init_failed` event |
| `src/ui/screens/ChainScreen.tsx` (modify) | Mount `<AdBanner />` + conditional ad-privacy footer row |
| `App.tsx` (modify) | Call `initAds()` on mount |
| `src/i18n/en.ts`, `src/i18n/ko.ts` (modify) | `ads.privacyOptions` string |
| `docs/deployment.md` (modify) | Pin rationale + upgrade gate + build notes |

---

### Task 1: Branch + exact-pin install

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Create the branch**

```bash
git checkout -b 2umean/admob
```

- [ ] **Step 2: Install with an exact pin (NOT expo install, NO caret)**

```bash
npm install react-native-google-mobile-ads@16.3.4 --save-exact
```

- [ ] **Step 3: Verify the pin and that nothing else moved**

Run: `grep '"react-native-google-mobile-ads"' package.json`
Expected: `"react-native-google-mobile-ads": "16.3.4"` (no `^` / `~`)
Run: `git diff --stat package.json`
Expected: only the one dependency line added.

- [ ] **Step 4: Run the full suite to confirm the install broke nothing**

Run: `npm test`
Expected: 30 suites, 309 tests, all pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(ads): add react-native-google-mobile-ads 16.3.4 (exact pin)

16.4.0 (npm latest) is compiled against Kotlin 2.3.0 metadata and fails to
build with RN 0.85's Kotlin 2.1.20 (invertase/react-native-google-mobile-ads#863).
Pin 16.3.4 until #866 ships; JS API is identical."
```

---

### Task 2: Native config via the Expo plugin

**Files:**
- Create: `skAdNetworkItems.ts` (repo root)
- Modify: `app.config.ts` (plugins array, lines 47–58)
- Modify: `locales/ko.json`

- [ ] **Step 1: Create `skAdNetworkItems.ts` at the repo root**

```ts
// Google's published SKAdNetwork identifier list for AdMob (50 ids), from
// https://developers.google.com/admob/ios/ios14 (fetched 2026-07-27).
// The react-native-google-mobile-ads config plugin does NOT inject any of
// these on its own — the full list must be passed via its skAdNetworkItems
// option or attribution for non-Google buyers silently breaks.
export const SK_AD_NETWORK_ITEMS = [
  'cstr6suwn9.skadnetwork',
  '4fzdc2evr5.skadnetwork',
  '2fnua5tdw4.skadnetwork',
  'ydx93a7ass.skadnetwork',
  'p78axxw29g.skadnetwork',
  'v72qych5uu.skadnetwork',
  'ludvb6z3bs.skadnetwork',
  'cp8zw746q7.skadnetwork',
  '3sh42y64q3.skadnetwork',
  'c6k4g5qg8m.skadnetwork',
  's39g8k73mm.skadnetwork',
  'wg4vff78zm.skadnetwork',
  '3qy4746246.skadnetwork',
  'f38h382jlk.skadnetwork',
  'hs6bdukanm.skadnetwork',
  'mlmmfzh3r3.skadnetwork',
  'v4nxqhlyqp.skadnetwork',
  'wzmmz9fp6w.skadnetwork',
  'su67r6k2v3.skadnetwork',
  'yclnxrl5pm.skadnetwork',
  't38b2kh725.skadnetwork',
  '7ug5zh24hu.skadnetwork',
  'gta9lk7p23.skadnetwork',
  'vutu7akeur.skadnetwork',
  'y5ghdn5j9k.skadnetwork',
  'v9wttpbfk9.skadnetwork',
  'n38lu8286q.skadnetwork',
  '47vhws6wlr.skadnetwork',
  'kbd757ywx3.skadnetwork',
  '9t245vhmpl.skadnetwork',
  'a2p9lx4jpn.skadnetwork',
  '22mmun2rn5.skadnetwork',
  '44jx6755aq.skadnetwork',
  'k674qkevps.skadnetwork',
  '4468km3ulz.skadnetwork',
  '2u9pt9hc89.skadnetwork',
  '8s468mfl3y.skadnetwork',
  'klf5c3l5u5.skadnetwork',
  'ppxm28t8ap.skadnetwork',
  'kbmxgpxpgc.skadnetwork',
  'uw77j35x4d.skadnetwork',
  '578prtvx9j.skadnetwork',
  '4dzt52r2t5.skadnetwork',
  'tl55sbb4fm.skadnetwork',
  'c3frkrj4fj.skadnetwork',
  'e5fvkxwrpn.skadnetwork',
  '8c4e2ghe7u.skadnetwork',
  '3rd42ekr43.skadnetwork',
  '97r2b46745.skadnetwork',
  '3qcr597p9d.skadnetwork',
];
```

- [ ] **Step 2: Add the plugin entry to `app.config.ts`**

Add the import near the existing package.json import at the top:

```ts
import { SK_AD_NETWORK_ITEMS } from './skAdNetworkItems';
```

Append to the existing `plugins` array (after the `expo-splash-screen` tuple):

```ts
    [
      'react-native-google-mobile-ads',
      {
        // Both App IDs are mandatory — the native GMA SDK crashes at launch
        // on any platform whose ID is missing from the build.
        androidAppId: 'ca-app-pub-5599052038923907~8575489973',
        iosAppId: 'ca-app-pub-5599052038923907~5702060414',
        // Defer GMA app measurement until mobileAds().initialize(), which
        // src/ads/adsState.ts only calls once UMP reports canRequestAds.
        delayAppMeasurementInit: true,
        userTrackingUsageDescription:
          'This identifier will be used to deliver personalized ads to you.',
        skAdNetworkItems: SK_AD_NETWORK_ITEMS,
      },
    ],
```

- [ ] **Step 3: Localize the ATT prompt for Korean devices**

Read `locales/ko.json` and add this key, preserving all existing keys:

```json
"NSUserTrackingUsageDescription": "맞춤형 광고를 제공하기 위해 광고 식별자를 사용합니다."
```

- [ ] **Step 4: Verify the config evaluates**

Run: `npx expo config --type prebuild > /dev/null && echo OK`
Expected: `OK` (no plugin-resolution or TS import errors).

- [ ] **Step 5: Verify Android manifest injection via prebuild**

Run: `npx expo prebuild -p android --no-install` then
`grep -o 'com.google.android.gms.ads.[A-Z_]*' android/app/src/main/AndroidManifest.xml | sort -u`
Expected: at minimum `com.google.android.gms.ads.APPLICATION_ID` and `com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT`; and
`grep -A1 'APPLICATION_ID' android/app/src/main/AndroidManifest.xml` shows `ca-app-pub-5599052038923907~8575489973`.

- [ ] **Step 6: Verify iOS Info.plist injection via prebuild**

Run: `npx expo prebuild -p ios --no-install` then:
- `grep -c 'skadnetwork' ios/*/Info.plist` → Expected: `50`
- `grep -c 'GADApplicationIdentifier\|NSUserTrackingUsageDescription\|GADDelayAppMeasurementInit' ios/*/Info.plist` → Expected: `3`
- `grep -A1 'GADApplicationIdentifier' ios/*/Info.plist` shows `ca-app-pub-5599052038923907~5702060414`.

(`android/` and `ios/` are gitignored CNG artifacts — nothing from prebuild gets committed.)

- [ ] **Step 7: Commit**

```bash
git add skAdNetworkItems.ts app.config.ts locales/ko.json
git commit -m "feat(ads): configure google-mobile-ads plugin (app IDs, ATT, SKAdNetwork, delayed measurement)"
```

---

### Task 3: Ads facade — `src/ads/adsState.ts` (TDD)

**Files:**
- Create: `src/ads/adsState.ts`
- Modify: `src/telemetry/events.ts`
- Test: `src/ads/__tests__/adsState.test.ts`

- [ ] **Step 1: Add the `ads_init_failed` event to the telemetry catalog**

In `src/telemetry/events.ts`, add to the `TelemetryEvents` type (match the file's existing doc-comment idiom):

```ts
  /** UMP consent gathering or GMA SDK init threw at launch; retried next launch. */
  ads_init_failed: Record<string, never>;
```

- [ ] **Step 2: Write the failing facade tests**

Create `src/ads/__tests__/adsState.test.ts`. Mirror `src/telemetry/__tests__/telemetry.test.ts` (fresh module per test because state lives at module scope; `mock`-prefixed vars for hoisting):

```ts
const mockInitialize = jest.fn(() => Promise.resolve([]));
const mockGetConsentInfo = jest.fn();
const mockGatherConsent = jest.fn();
const mockShowPrivacyOptionsForm = jest.fn();
const mockTrack = jest.fn();

jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: () => ({ initialize: mockInitialize }),
  AdsConsent: {
    getConsentInfo: mockGetConsentInfo,
    gatherConsent: mockGatherConsent,
    showPrivacyOptionsForm: mockShowPrivacyOptionsForm,
  },
  AdsConsentPrivacyOptionsRequirementStatus: {
    UNKNOWN: 'UNKNOWN',
    REQUIRED: 'REQUIRED',
    NOT_REQUIRED: 'NOT_REQUIRED',
  },
}));

jest.mock('../../telemetry', () => ({ track: mockTrack }));

type AdsStateModule = typeof import('../adsState');

function freshAds(): AdsStateModule {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../adsState');
}

function info(over: Partial<{ canRequestAds: boolean; privacyOptionsRequirementStatus: string }> = {}) {
  return {
    status: 'OBTAINED',
    isConsentFormAvailable: true,
    canRequestAds: false,
    privacyOptionsRequirementStatus: 'NOT_REQUIRED',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('initAds', () => {
  test('starts the SDK once when a previous session already allows ads', async () => {
    mockGetConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: true }));
    const ads = freshAds();
    await ads.initAds();
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockGatherConsent).toHaveBeenCalledTimes(1);
    expect(ads.getAdsState()).toEqual({ canShowAds: true, isPrivacyOptionsRequired: false });
  });

  test('first-run EEA user: SDK starts only after the consent form grants', async () => {
    mockGetConsentInfo
      .mockResolvedValueOnce(info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }))
      .mockResolvedValue(info({ canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }));
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: true }));
    const ads = freshAds();
    await ads.initAds();
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(ads.getAdsState()).toEqual({ canShowAds: true, isPrivacyOptionsRequired: true });
  });

  test('never initializes the SDK while consent forbids ad requests', async () => {
    mockGetConsentInfo.mockResolvedValue(
      info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }),
    );
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: false }));
    const ads = freshAds();
    await ads.initAds();
    expect(mockInitialize).not.toHaveBeenCalled();
    expect(ads.getAdsState()).toEqual({ canShowAds: false, isPrivacyOptionsRequired: true });
  });

  test('gatherConsent failure never throws, is tracked, and keeps the previous-session fast path', async () => {
    mockGetConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    mockGatherConsent.mockRejectedValue(new Error('ump down'));
    const ads = freshAds();
    await expect(ads.initAds()).resolves.toBeUndefined();
    expect(mockTrack).toHaveBeenCalledWith('ads_init_failed', {});
    expect(ads.getAdsState().canShowAds).toBe(true); // previous session's consent still applies
  });

  test('is idempotent — a second call does not re-run consent', async () => {
    mockGetConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: true }));
    const ads = freshAds();
    await ads.initAds();
    await ads.initAds();
    expect(mockGatherConsent).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });
});

describe('showAdsPrivacyOptions', () => {
  test('re-syncs state after the form — withdrawing consent hides ads', async () => {
    mockGetConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    mockGatherConsent.mockResolvedValue(info({ canRequestAds: true }));
    const ads = freshAds();
    await ads.initAds();
    expect(ads.getAdsState().canShowAds).toBe(true);

    mockGetConsentInfo.mockResolvedValue(
      info({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }),
    );
    mockShowPrivacyOptionsForm.mockResolvedValue(info({ canRequestAds: false }));
    ads.showAdsPrivacyOptions();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ads.getAdsState()).toEqual({ canShowAds: false, isPrivacyOptionsRequired: true });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- adsState`
Expected: FAIL — `Cannot find module '../adsState'`.

- [ ] **Step 4: Implement `src/ads/adsState.ts`**

```ts
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
    isSdkStarted = true;
    await mobileAds().initialize();
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- adsState`
Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ads/adsState.ts src/ads/__tests__/adsState.test.ts src/telemetry/events.ts
git commit -m "feat(ads): consent-gated ads facade with UMP flow and useAdsState hook"
```

---

### Task 4: Unit-ID resolver + AdBanner component (TDD)

> **Amendment (Task 3 quality review):** Task 4 begins with a hardening step in `adsState.ts` — set `isSdkStarted = true` only AFTER `await mobileAds().initialize()` resolves, with two regression tests (fast-path init failure retries after gatherConsent; persistent failure tracks `ads_init_failed` and keeps `canShowAds` false). GMA `initialize()` is idempotent, so the rare double call is safe.

**Files:**
- Create: `src/ads/unitId.ts`, `src/ads/AdBanner.tsx`, `src/ads/index.ts`
- Modify: `test/setup.js` (define `__DEV__`)
- Test: `src/ads/__tests__/unitId.test.ts`, `src/ads/__tests__/AdBanner.test.tsx`

- [ ] **Step 1: Define `__DEV__` for the jest environment**

The repo's plain ts-jest setup does not define React Native's `__DEV__` global (jest-expo would; we don't use it). Add to `test/setup.js`:

```js
globalThis.__DEV__ = true;
```

- [ ] **Step 2: Write the failing resolver test**

Create `src/ads/__tests__/unitId.test.ts`:

```ts
jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: { ADAPTIVE_BANNER: 'test-adaptive-banner' },
}));

import { BANNER_UNIT_IDS, resolveBannerUnitId } from '../unitId';

test('dev builds always use the Google test unit — never the live unit', () => {
  expect(resolveBannerUnitId(true, 'android')).toBe('test-adaptive-banner');
  expect(resolveBannerUnitId(true, 'ios')).toBe('test-adaptive-banner');
});

test('release builds use the real per-platform unit', () => {
  expect(resolveBannerUnitId(false, 'android')).toBe(BANNER_UNIT_IDS.android);
  expect(resolveBannerUnitId(false, 'ios')).toBe(BANNER_UNIT_IDS.ios);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- unitId`
Expected: FAIL — `Cannot find module '../unitId'`.

- [ ] **Step 4: Implement `src/ads/unitId.ts`**

```ts
import { TestIds } from 'react-native-google-mobile-ads';

export const BANNER_UNIT_IDS = {
  android: 'ca-app-pub-5599052038923907/7030353875',
  ios: 'ca-app-pub-5599052038923907/8244317487',
} as const;

// Dev builds must never request the live units — impressions/clicks from a
// developer device risk an AdMob account suspension.
export function resolveBannerUnitId(isDev: boolean, platform: string): string {
  if (isDev) return TestIds.ADAPTIVE_BANNER;
  return platform === 'ios' ? BANNER_UNIT_IDS.ios : BANNER_UNIT_IDS.android;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- unitId` → Expected: 2 tests PASS.

- [ ] **Step 6: Write the failing AdBanner tests**

Create `src/ads/__tests__/AdBanner.test.tsx` (mirror `src/ui/__tests__/ConsentSheet.test.tsx` for renderer + safe-area mocking; React 19 function components accept `ref` as a prop, so the plain-function BannerAd mock needs no forwardRef):

```tsx
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { View } from 'react-native';

const mockUseAdsState = jest.fn();
jest.mock('../adsState', () => ({ useAdsState: () => mockUseAdsState() }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  BannerAd: () => null,
  BannerAdSize: { LARGE_ANCHORED_ADAPTIVE_BANNER: 'LARGE_ANCHORED_ADAPTIVE_BANNER' },
  TestIds: { ADAPTIVE_BANNER: 'test-adaptive-banner' },
  useForeground: jest.fn(),
}));

import { BannerAd } from 'react-native-google-mobile-ads';
import { AdBanner } from '../AdBanner';

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AdBanner />);
  });
  return tree;
}

test('renders nothing until consent allows ads', () => {
  mockUseAdsState.mockReturnValue({ canShowAds: false, isPrivacyOptionsRequired: false });
  const tree = render();
  expect(tree.root.findAllByType(BannerAd)).toHaveLength(0);
  expect(tree.root.findAllByType(View)).toHaveLength(0);
});

test('mounts zero-height, then reserves safe-area space once an ad loads', () => {
  mockUseAdsState.mockReturnValue({ canShowAds: true, isPrivacyOptionsRequired: false });
  const tree = render();
  expect(tree.root.findByType(View).props.style).toMatchObject({ height: 0, overflow: 'hidden' });
  act(() => {
    tree.root.findByType(BannerAd).props.onAdLoaded({ width: 320, height: 50 });
  });
  expect(tree.root.findByType(View).props.style).toEqual({ paddingBottom: 34 });
});

test('collapses back to zero height when a later load fails', () => {
  mockUseAdsState.mockReturnValue({ canShowAds: true, isPrivacyOptionsRequired: false });
  const tree = render();
  act(() => {
    tree.root.findByType(BannerAd).props.onAdLoaded({ width: 320, height: 50 });
  });
  act(() => {
    tree.root.findByType(BannerAd).props.onAdFailedToLoad(new Error('no fill'));
  });
  expect(tree.root.findByType(View).props.style).toMatchObject({ height: 0, overflow: 'hidden' });
});
```

(If `test/stubs/react-native.js`'s `StyleSheet.create` transforms objects, adjust the hidden-style assertions accordingly — check the stub first; `toMatchObject` covers the identity-create case.)

- [ ] **Step 7: Run to verify failure**

Run: `npm test -- AdBanner`
Expected: FAIL — `Cannot find module '../AdBanner'`.

- [ ] **Step 8: Implement `src/ads/AdBanner.tsx`**

```tsx
import { useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerAd, BannerAdSize, useForeground } from 'react-native-google-mobile-ads';

import { useAdsState } from './adsState';
import { resolveBannerUnitId } from './unitId';

// Anchored banner for the bottom of ChainScreen. Self-contained: renders
// nothing without consent, stays zero-height until an ad actually loads (no
// gray placeholder, no layout jump on no-fill), and owns the bottom safe-area
// inset while visible.
export function AdBanner() {
  const { canShowAds } = useAdsState();
  const insets = useSafeAreaInsets();
  const [isLoaded, setIsLoaded] = useState(false);
  const bannerRef = useRef<BannerAd>(null);

  // iOS suspends the banner's WKWebView while backgrounded; reload on return.
  useForeground(() => {
    if (Platform.OS === 'ios') bannerRef.current?.load();
  });

  if (!canShowAds) return null;

  return (
    <View style={isLoaded ? { paddingBottom: insets.bottom } : styles.hidden}>
      <BannerAd
        ref={bannerRef}
        unitId={resolveBannerUnitId(__DEV__, Platform.OS)}
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setIsLoaded(true)}
        onAdFailedToLoad={() => setIsLoaded(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { height: 0, overflow: 'hidden' },
});
```

- [ ] **Step 9: Create the barrel `src/ads/index.ts`**

```ts
export { initAds, showAdsPrivacyOptions, useAdsState } from './adsState';
export type { AdsState } from './adsState';
export { AdBanner } from './AdBanner';
```

- [ ] **Step 10: Run the ads tests, then the full suite**

Run: `npm test -- src/ads` → Expected: all ads tests PASS (6 + 2 + 3).
Run: `npm test` → Expected: 320 tests, 0 failures (309 existing + 11 new).

- [ ] **Step 11: Commit**

```bash
git add src/ads test/setup.js
git commit -m "feat(ads): AdBanner component — consent-gated, zero-height until loaded"
```

---

### Task 5: Wire into ChainScreen and App

**Files:**
- Modify: `src/ui/screens/ChainScreen.tsx` (imports ~line 23; footerLinks lines 331–347; after `</ScrollView>` line 348)
- Modify: `App.tsx` (effect at lines 32–34)
- Modify: `src/i18n/en.ts`, `src/i18n/ko.ts`

- [ ] **Step 1: Add i18n strings**

In `src/i18n/en.ts`, add a top-level `ads` block matching the file's existing structure:

```ts
  ads: {
    privacyOptions: 'Ad Privacy',
  },
```

In `src/i18n/ko.ts`:

```ts
  ads: {
    privacyOptions: '광고 개인정보 설정',
  },
```

- [ ] **Step 2: Mount the banner and the conditional footer row in ChainScreen**

Add to the imports:

```ts
import { AdBanner, showAdsPrivacyOptions, useAdsState } from '../../ads';
```

Inside the component (near the other hooks, ~line 61):

```ts
const { isPrivacyOptionsRequired: isAdPrivacyRequired } = useAdsState();
```

Insert the banner between `</ScrollView>` (line 348) and `<ArrivalPickerSheet` (line 350), as a direct child of the LinearGradient:

```tsx
      <AdBanner />
```

(The scroll content keeps its existing `paddingBottom: insets.bottom + spacing.xxl` — when the banner is visible this yields extra trailing whitespace inside the scroll, which matches the design's airy spacing; when hidden, layout is identical to today.)

In the footerLinks View (lines 331–347), after the data-settings Pressable, add:

```tsx
          {isAdPrivacyRequired ? (
            <>
              <Text style={styles.privacyLinkText}>·</Text>
              <Pressable
                accessibilityRole="button"
                onPress={showAdsPrivacyOptions}
                style={styles.privacyLink}
              >
                <Text style={styles.privacyLinkText}>{t('ads.privacyOptions')}</Text>
              </Pressable>
            </>
          ) : null}
```

- [ ] **Step 3: Call `initAds()` at startup in `App.tsx`**

Add the import next to the telemetry import (line 12):

```ts
import { initAds } from './src/ads';
```

Extend the existing mount effect (lines 32–34):

```ts
  useEffect(() => {
    void initTelemetry(); // idempotent; starts SDKs iff consent was granted earlier
    void initAds(); // idempotent; shows the UMP consent form only where required
  }, []);
```

- [ ] **Step 4: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm test`
Expected: 320 tests, 0 failures. (ChainScreen has no existing render test — the new row/banner are covered by the component/facade tests plus the QA task.)

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/ChainScreen.tsx App.tsx src/i18n/en.ts src/i18n/ko.ts
git commit -m "feat(ads): banner on chain screen, ad-privacy footer entry, init at startup"
```

---

### Task 6: Docs

> **Amendment (Task 5 quality review):** Task 6 begins with a one-line UI hardening — add `flexWrap: 'wrap'` to `styles.footerLinks` in ChainScreen so the three-link footer (privacy policy · data settings · ad privacy) cannot clip on narrow ko-locale screens when the EEA-only ad-privacy row is visible.

**Files:**
- Modify: `docs/deployment.md`
- Modify: `docs/store-privacy-answers.md`

- [ ] **Step 1: Record the pin + build implications in `docs/deployment.md`**

Read the file and add an "Ads (AdMob)" section in its existing style covering exactly:

- `react-native-google-mobile-ads` is exact-pinned to 16.3.4: 16.4.0's Android GMA SDK 25.4.0 carries Kotlin 2.3.0 metadata and fails against RN 0.85's Kotlin 2.1.20 (invertase #863). Before ANY upgrade, check that invertase PR #866 (or a release containing it) shipped.
- Never `npx expo install` this package (not in bundledNativeModules → resolves broken latest).
- Adding this native module invalidated all previous dev clients — build fresh ones.
- Dev builds serve Google test ads (`TestIds.ADAPTIVE_BANNER`); release builds serve live units. Register physical QA devices in AdMob (Settings → Test devices) before running release builds on them.

- [ ] **Step 2: Add the v0.7.0 reminder to `docs/store-privacy-answers.md`**

Read the file and append a clearly-marked "v0.7.0 (ads) — forms change AGAIN" section: Apple App Privacy → tracking = Yes + ATT prompt required; Play Data safety → advertising data categories; both must be updated the same day the ads release goes live.

- [ ] **Step 3: Commit**

```bash
git add docs/deployment.md docs/store-privacy-answers.md
git commit -m "docs(ads): 16.3.4 pin rationale, dev-client invalidation, store-form reminders"
```

---

### Task 7: Simulator/emulator QA (fresh builds required)

> **Android results (2026-07-27, `miri-qa` emulator, debug build):** Q1 ✅ (test banner renders bottom-anchored after console messages published); Q2 ✅ (zero-height/no-layout-shift observed live — including the pre-publish state where UMP config was missing and the app degraded exactly as designed, banner hidden, no crash); Q4 ✅ with corrected expectation — after "Do not consent" UMP keeps `canRequestAds` true and Google serves *limited ads*, so the banner legitimately stays (spec's "obey the flag" clause; the original "declining hides the banner" wording was wrong); the "Ad Privacy" footer row appears on decline-required geography, reopens the form, and re-consent works without restart; Q6 ✅ for fresh users (UNKNOWN status → no ad request; returning users may see ads pre-form via UMP's previous-session consent, per Google's documented pattern). Q3/Q5 + the iOS pass remain. Console prerequisite discovered: UMP hard-fails with "Publisher misconfiguration" until the GDPR + IDFA messages are published in Privacy & messaging — published by the user mid-QA, after which everything worked. Note for the user: `LARGE_ANCHORED_ADAPTIVE_BANNER` is ~13% of screen height; classic 320×50 `BANNER` is a one-line swap if preferred.

No code. Existing recipes: Android debug APK = `npx expo prebuild -p android && cd android && SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew assembleDebug` with `ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`, AVD `miri-qa` (`emulator -avd miri-qa`). iOS = `npx expo run:ios` on the iPhone 17 Pro simulator.

- [ ] **Q1 (both platforms):** Chain screen shows a Google **test** banner anchored at the bottom; scroll content is not obscured; onboarding and all sheets are banner-free.
- [ ] **Q2 (both):** With no ad loaded (airplane mode at launch), the banner area is invisible (zero height) and layout matches v0.6.0.
- [ ] **Q3 (iOS):** ATT prompt appears via UMP (after the IDFA message is published in the console — coordinate with the release checklist) and shows the Korean usage string on a ko-locale simulator.
- [ ] **Q4 (EEA flow, one platform):** Temporarily (do NOT commit) pass `{ debugGeography: AdsConsentDebugGeography.EEA }` to `AdsConsent.gatherConsent()` in `src/ads/adsState.ts`: GDPR form appears; declining hides the banner; the "광고 개인정보 설정" footer row appears; reopening the form from it and consenting shows the banner without restart. Revert the patch afterwards.
- [ ] **Q5 (EEA + upgrade combo):** With telemetry consent cleared (v0.5.x-upgrade simulation from the telemetry QA notes) and EEA debug geography, verify the UMP form and the telemetry migration sheet don't deadlock — UMP presents natively above the RN sheet; both remain answerable.
- [ ] **Q6 (no-consent network check):** In the EEA-debug build, before answering the UMP form, verify no ad requests are made (iOS unified log / Android logcat technique from the telemetry QA notes; `canRequestAds` false ⇒ no `initialize()`).
- [ ] **Q7:** Full suite still green: `npm test` → 320 passing.

---

## Release checklist (mostly user/console actions — NOT part of the code tasks)

1. **AdMob console — Privacy & messaging:** publish the **European regulations (GDPR) message** (select the app, enable "Do not consent" button, add privacy policy URL `https://2umean.github.io/miri-alarm/privacy.html`) and the **IDFA/ATT message** for iOS. Without the GDPR message published, EEA users get no form and `canRequestAds` stays false there.
2. **app-ads.txt:** create GitHub repo named exactly `2umean.github.io`, single file `app-ads.txt` containing `google.com, pub-5599052038923907, DIRECT, f08c47fec0942fa0`. Set developer website `https://2umean.github.io` in BOTH store listings. AdMob → Apps → View all apps → app-ads.txt tab → "Check for updates" (crawl ≤24h; ads serve while pending).
3. **Test devices:** AdMob → Settings → Test devices → add both physical phones (AAID/IDFA) before any release build touches them.
4. **Store forms:** update per `docs/store-privacy-answers.md` v0.7.0 section, same day as rollout.
5. **Version + build:** merge to main, `npm version minor` (→ 0.7.0), EAS cloud builds + submit — same flow as v0.6.0 (Play internal draft needs manual rollout; preview-profile APK needs SENTRY_AUTH_TOKEN in the preview env — already set since v0.6.0).
6. **Before building:** re-check invertase #866 — if a fixed release shipped, still ship 16.3.4 this release (QA'd) and note the upgrade for release 3.
7. **PIN:** revenue starts only after the earnings-threshold PIN postcard is entered — unrelated to shipping.
