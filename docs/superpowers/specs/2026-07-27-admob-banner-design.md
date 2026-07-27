# AdMob Banner — Release 2 Design (v0.7.0)

**Date:** 2026-07-27
**Status:** Approved (brainstormed + section-by-section approval in session)
**Predecessor:** `2026-07-23-monitoring-release-design.md` (telemetry, shipped as v0.6.0)

## Goal

Add exactly one ad surface to MIRI Alarm: an anchored adaptive banner at the
bottom of the chain list screen, with Google-managed consent (UMP + ATT).
Purpose is to experience the full monetization deploy flow, not to maximize
revenue.

## Scope

**In:** one anchored adaptive banner on `ChainScreen`, UMP consent flow, ATT
message (console-configured), config-plugin setup, app-ads.txt, store-form
updates, unit tests + sim/emulator QA.

**Out (explicit — do not build):** interstitials, rewarded ads, app-open ads,
native ads, ad-free purchase tier, mediation, frequency capping, any ad on or
near the ring/dismiss UI, custom consent UI beyond what UMP renders.

Policy basis (verified 2026-07-20 research): alarm apps must not show
interstitials on load/exit or ads near the ringing screen (core-content
interference + accidental clicks). Banner on the list screen is the only safe
surface.

## AdMob account facts

- Publisher ID: `pub-5599052038923907`. PIN not yet issued (normal — triggers
  at earnings threshold); does not block build or QA.
- Android: appId `ca-app-pub-5599052038923907~8575489973`,
  banner unitId `ca-app-pub-5599052038923907/7030353875`
- iOS: appId `ca-app-pub-5599052038923907~5702060414`,
  banner unitId `ca-app-pub-5599052038923907/8244317487`

## Library

`react-native-google-mobile-ads` (~16.4.x at research time) + its Expo config
plugin. **Verify the actual version `npx expo install` resolves for SDK 56**
(same lesson as Sentry resolving 7.11 instead of 8.x) and read the Expo v56
docs before writing code (AGENTS.md rule).

Config plugin options in `app.config.ts` (added to the existing `plugins`
array):

- `androidAppId` / `iosAppId` — the `~` App IDs above. The app hard-crashes at
  launch if these are missing from the native build.
- `userTrackingUsageDescription` — ATT Info.plist string.
- `skAdNetworkItems` — the ~50 SKAdNetwork IDs from Google's current list.
- `delayAppMeasurementInit: true` — SDK must not phone home before consent.

## Architecture

New module `src/ads/`, mirroring `src/telemetry/` (facade; rest of the app
never imports the ads SDK directly):

- `consent.ts` — wraps Google UMP. `gatherAdsConsent()` runs every app launch
  (cached by the SDK after first resolution; only shows a form when Google
  says one is required). Exposes `canRequestAds` and
  `isPrivacyOptionsRequired`, plus `showPrivacyOptionsForm()`.
- `AdBanner.tsx` — the banner component (behavior below).
- `index.ts` — facade: `initAds()` (gatherConsent → `mobileAds().initialize()`
  gated on `canRequestAds`) + component export.

### Consent layers (all SDK-driven, no custom UI)

1. **UMP form** — Google decides who sees it (EEA/UK get the GDPR form;
   Korean users typically see nothing). Called every launch; obey the result.
2. **ATT (iOS)** — ATT explainer message configured in AdMob console
   (Privacy & messaging); UMP auto-presents Apple's prompt. No ATT code in the
   app beyond the Info.plist usage string. ATT Allow ≠ GDPR consent; never
   gate iOS features on UMP choice flags (3.2.2.vi rejection risk).
3. **Privacy options entry** — a "광고 개인정보 설정" row in the settings/footer
   area, rendered only when `isPrivacyOptionsRequired` (EEA users). Opens
   UMP's privacy options form.

**Boundary:** completely separate from the telemetry opt-in toggle. Telemetry
toggle governs Sentry/PostHog only; ads consent is UMP's. No cross-wiring.

## ChainScreen integration & banner behavior

- Rendered as the last element of `ChainScreen`, outside the scrolling
  content, pinned to the bottom edge; container gets
  `paddingBottom: insets.bottom` (existing safe-area pattern).
- Size: anchored adaptive banner (screen width in, SDK picks ~50–65dp
  height).
- Layout stability: container height is 0 until `onAdLoaded`; collapses back
  to 0 on `onAdFailedToLoad`. No placeholder, no layout jump when there is no
  fill.
- Renders nothing until consent gathering finishes and `canRequestAds` is
  true.
- Shows whenever the chain screen is visible (including empty state). Never
  on Onboarding, the ring screen, or any sheet/alert.
- Declined-consent users in consent regions get non-personalized/limited ads
  if UMP still reports `canRequestAds` — obey the flag, no custom logic.
- `__DEV__` → Google `TestIds.ADAPTIVE_BANNER`; release → real unit IDs.
  Physical QA devices must be registered as test devices in the AdMob console
  before touching a release build (self-clicks = account ban risk).

## Error handling

- UMP gather failure (offline/outage): app starts normally, banner hidden for
  the session, retry next launch. Ads must never block or delay alarm
  functionality; chain screen renders immediately, banner loads async.
- Ad load failure: zero-height collapse; SDK auto-retries on its own
  schedule; no custom retry.
- SDK init failure: caught inside `src/ads/`, telemetry breadcrumb (no PII),
  app unaffected.

## Testing

- Unit tests (Jest, mocked SDK, pattern of `src/telemetry/__tests__/`):
  consent gating (no ad request before `canRequestAds`), test-vs-real unit ID
  selection, zero-height-until-loaded, privacy-options visibility logic.
- Existing test suite (309 green at v0.6.0) stays green.
- Sim/emulator QA with test ads: banner on chain screen (iOS sim + `miri-qa`
  AVD), no banner pre-consent, no ad-server network calls before UMP resolves
  (unified-log technique from telemetry QA), ring screen ad-free.

## Release checklist (outside the code)

1. Create GitHub repo named exactly `2umean.github.io` (user site → serves
   domain root). Single file `app-ads.txt`:
   `google.com, pub-5599052038923907, DIRECT, f08c47fec0942fa0`.
   Existing privacy page stays at `2umean.github.io/miri-alarm/…` — crawlers
   strip the path, so the root repo is required and sufficient.
2. Set developer website `https://2umean.github.io` in BOTH store listings;
   AdMob → app settings → "Check for updates" on app-ads.txt (crawl ≤24h;
   ads serve while pending).
3. AdMob console → Privacy & messaging: publish the GDPR message and the ATT
   message for this app.
4. Store forms change again (see `docs/store-privacy-answers.md` reminder
   section): Apple → tracking = Yes + ATT; Play Data safety → advertising
   categories. Same-day as release, both stores.
5. `npm version minor` → v0.7.0; build/submit flow identical to v0.6.0
   (EAS cloud: iOS TestFlight auto-submit, Android AAB → Play internal,
   preview APK artifact).

## Open items

- PIN postcard: not yet triggered; revenue (not build) blocker.
- Korean tax (세무사 confirmation): still pending, unrelated to this release's
  code.
