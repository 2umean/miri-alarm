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
