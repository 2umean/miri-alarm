# Store privacy-form answers — v0.6.0 (opt-in Sentry + PostHog)

Both forms MUST be updated in the same release that ships the SDKs
(deployment.md: false declarations can ban the account). Current state on both
stores is "no data collected" — that stops being true with v0.6.0.

## Apple App Store Connect → App Privacy

Collection is OPT-IN, anonymous, and NOT used for tracking (no cross-company
linking → no ATT prompt needed this release).

| Data type | Collected? | Linked to user? | Used for tracking? | Purposes |
| --- | --- | --- | --- | --- |
| Identifiers → Device ID (PostHog per-install anonymous id) | Yes | No | No | Analytics |
| Usage Data → Product Interaction | Yes | No | No | Analytics |
| Diagnostics → Crash Data | Yes | No | No | App Functionality |
| Diagnostics → Other Diagnostic Data (alarm health/permission states) | Yes | No | No | App Functionality, Analytics |
| Everything else | No | — | — | — |

## Google Play Console → App content → Data safety

Play counts data as "collected" when it leaves the device (stricter than
Apple). Sentry/PostHog are service providers → "collected", NOT "shared".

- Does your app collect or share user data? **Yes**
- Encrypted in transit? **Yes**
- Deletion mechanism: users can stop collection anytime (footer → Data
  Settings); deletion requests via the privacy-policy contact email.
- App activity → App interactions: **Collected, optional, Analytics**
- App info and performance → Crash logs: **Collected, optional, App functionality**
- App info and performance → Diagnostics: **Collected, optional, App functionality + Analytics**
- Device or other IDs: **Collected, optional, Analytics**
- Everything else: not collected. Nothing is "shared".

## ⚠️ v0.7.0 (ads) — forms change AGAIN

When the AdMob release ships, BOTH forms change materially and must be updated
the SAME DAY the release goes live:

- Apple App Privacy: **Used for tracking = Yes** (ad identifiers leave the app
  for Google's ad network) → the in-app **ATT prompt is required**.
- Play Data safety: add the **advertising data categories as SHARED** — not
  merely collected (device/ad IDs and ad-related data go to Google's ad
  network, a third party; purpose Advertising or marketing). Play treats
  ad-network transfers as "shared", unlike the Sentry/PostHog
  service-provider case above.

### Exact v0.7.0 answers (prepared 2026-07-27)

Source: Google's GMA SDK disclosure guidance
(developers.google.com/admob/ios/data-disclosure and
…/android/privacy/play-data-disclosure). The SDK collects: device/ad IDs,
IP address (used to estimate coarse location), ad interactions (ads seen,
video views), product interactions (app launches, taps), and performance
diagnostics (launch time, hang rate, energy).

#### Apple App Privacy — deltas vs the v0.6.0 table above

| Data type | Change |
| --- | --- |
| Identifiers → Device ID | purposes + Third-Party Advertising; **Used for tracking = Yes** |
| Usage Data → Advertising Data | ADD: Collected, Not linked, **Tracking = Yes**, Third-Party Advertising |
| Usage Data → Product Interaction | purposes + Third-Party Advertising |
| Location → Coarse Location | ADD: Collected, Not linked, Not tracking, Third-Party Advertising (IP-derived) |
| Diagnostics → Performance Data | ADD: Collected, Not linked, Not tracking, App Functionality |

Crash Data / Other Diagnostic Data rows are unchanged. "Not linked" follows
the v0.6.0 stance (no accounts; only resettable ad IDs) — if App Review ever
objects, the fallback is flipping the ad rows to "linked", not removing them.

#### Play Data safety — deltas vs the v0.6.0 answers above

Ads have no in-app opt-out outside the EEA (UMP only gates EEA/UK), so the
ad-touched rows are **required**, not optional — and a data type with any
required collection must be declared required, which flips the previously
optional rows below.

| Data type | v0.7.0 answer |
| --- | --- |
| Location → Approximate location | ADD: Collected + **Shared**, required, Advertising or marketing (IP-derived) |
| Device or other IDs | now Collected + **Shared**, required; purposes + Advertising or marketing |
| App activity → App interactions | now also **Shared**, required; purposes + Advertising or marketing |
| App info and performance → Diagnostics | now also **Shared**, required; purposes + Fraud prevention, security, and compliance |

Crash logs stay collected-only/optional (Sentry). "Shared with" = Google's
ad network (third party). Encrypted in transit stays **Yes**; deletion
mechanism answer unchanged.
