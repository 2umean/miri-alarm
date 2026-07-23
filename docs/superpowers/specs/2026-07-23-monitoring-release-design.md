# Monitoring Release (v0.6.0) — Design

Date: 2026-07-23
Status: approved in brainstorming; implementation plan to follow.

## Goal & scope

Add opt-in crash reporting (Sentry) and product analytics (PostHog) behind a
single consent gate, plus the privacy-policy and store-form updates the SDKs
require. No ads in this release (AdMob is release 2; account review runs in
parallel).

Decisions locked during brainstorming:

- **Consent model:** one opt-in toggle, default OFF, gating both SDKs together.
- **Consent UI:** onboarding step (new users) + one-time sheet (existing users)
  + permanent footer entry (change anytime).
- **Data region:** EU for both vendors (PIPC recognized EU adequacy 2025-09;
  reduces PIPA cross-border-transfer friction). Projects created manually —
  `eas integrations:posthog:connect` is skipped because it defaults to US.
- **Architecture:** thin telemetry facade; only `src/telemetry/` imports the
  vendor SDKs.

## Consent

Storage: `src/telemetry/consent.ts`, AsyncStorage key
`schedularm.telemetryConsent.v1` with values `'granted' | 'denied'`; absence
means "never asked". Same pattern as `src/storage/onboarding.ts`.

Semantics:

- Neither SDK is initialized until consent is `granted`. Nothing leaves the
  device pre-consent (PostHog is init-gated; Sentry `init` is simply not
  called).
- Granting consent (any surface) initializes both SDKs immediately.
- Revoking calls PostHog `optOut()` and closes the Sentry client immediately;
  no restart needed.

Surfaces (all i18n ko/en):

1. **Onboarding step** — final step in `OnboardingScreen`: short copy
   ("익명 사용 통계와 오류 보고를 공유할까요?"), toggle default off, link to the
   privacy policy, continue enabled regardless of choice. Records
   granted/denied on completion.
2. **Existing users** — on ChainScreen mount, if onboarded and no consent
   record: show `ConsentSheet` (new component following the existing sheet
   idiom) once. Either choice is stored; never reshows.
3. **Footer** — "데이터 설정 / Data settings" link next to the privacy-policy
   link in the ChainScreen footer opens the same `ConsentSheet` pre-set to the
   current state.

## Telemetry facade

```
src/telemetry/
  index.ts    // typed track(event, props); init(); setConsent(granted)
  events.ts   // event-name + prop allowlist (types)
  consent.ts  // AsyncStorage read/write, in-memory cache
  sentry.ts   // the only file importing @sentry/react-native
  posthog.ts  // the only file importing posthog-react-native
```

- `track()` is fire-and-forget, wrapped in try/catch; telemetry must never
  crash, block, or delay the app. Failures are silently dropped.
- Typed event allowlist: props are numbers/booleans/enums only. Alarm labels
  and emoji are unrepresentable in the prop types — content never leaves the
  device.
- PostHog: EU host, anonymous device-generated distinct id, no `identify()`
  calls, session replay OFF, autocapture OFF (manual events only).
- Sentry: crashes + unhandled JS errors only; no user context beyond defaults;
  `sendDefaultPii` false.

## Events

| Event | When | Props |
| --- | --- | --- |
| `chain_armed` | `scheduleAlarms()` succeeds | alarmCount, chainDurationMin, hasArrivalDate, usedPreset |
| `alarm_missed` | `consumeMissedAlarms()` non-empty on app open | count, maxMinutesLate |
| `alarm_health` | app open | reasons[], isArmReliable, manufacturer, osVersion |
| `preset_applied` | preset applied to chain | presetCount |
| `preset_saved` | preset saved | presetCount |
| `onboarding_completed` | onboarding finishes | consentGranted |
| `consent_changed` | toggle flips after initial choice | granted |

`chain_armed` vs `alarm_missed` yields the alarm fire-success rate by
manufacturer/OS — the no-fire-bug radar. `alarm_health` reuses
`deriveHealth()` output from `src/alarm/alarmHealth.ts` verbatim (reasons,
isArmReliable, isAggressiveOEM are already content-free).

Note: JS does not run at actual ring time (native AlarmKit / Android service),
so there is deliberately no `alarm_fired` event; missed-vs-armed is the
observable signal.

## Build & config changes

- Dependencies: `@sentry/react-native`, `posthog-react-native` (+ required
  peer/Expo modules). Exact versions verified against
  https://docs.expo.dev/versions/v56.0.0/ and each vendor's Expo guide at
  implementation time (AGENTS.md rule).
- `app.config.ts`: add Sentry Expo config plugin (org, project, upload
  settings) and `posthog-react-native/expo` plugin.
- EAS: `SENTRY_AUTH_TOKEN` as a **sensitive** environment variable so release
  builds upload source maps automatically. PostHog project API key and Sentry
  DSN are public-by-design and live in app config.
- Full native rebuild + store submission (no OTA in this app).

## Off-app deliverables

Drafted in-repo by Claude; applied in consoles by the user:

1. **privacy.html** (gh-pages, ko + en): what is collected (crash data,
   anonymous usage events, device model/OS), the two processors (Sentry,
   PostHog) with EU hosting, the PIPA automatic-collection-tools disclosure,
   cross-border statement, opt-in nature and how to withdraw (footer → 데이터
   설정), effective date bump.
2. **Apple privacy nutrition label** answer sheet: Crash Data, Performance/
   Diagnostics, Identifiers (Device ID), Usage Data — all "Data Not Linked to
   You", none used for tracking → no ATT prompt this release.
3. **Google Play Data Safety** answer sheet: same categories; collected, not
   shared; optional (opt-in); encrypted in transit; deletion via consent
   withdrawal (stops collection; vendor retention windows noted).

Both store forms ship in the same release as the SDKs (false declarations risk
account bans; deployment.md warning).

## Testing

Unit (existing jest infra, SDK modules mocked, no network):

- consent.ts round-trip: absent → granted → denied; in-memory cache coherence.
- Facade gating: events dropped when consent absent/denied; forwarded when
  granted; revoke stops forwarding immediately.
- Prop allowlist: unknown event names / unexpected prop keys rejected at type
  level (compile-time test) and stripped at runtime.
- Missed-alarm mapping: `consumeMissedAlarms()` output → `alarm_missed` props.
- ConsentSheet + onboarding step: component-contract tests (existing
  react-test-renderer infra) for toggle state and persistence calls.

On-device QA before submit: consent sheet on both platforms (grant, revoke,
reshow-never), events visible in PostHog EU project, forced test crash visible
in Sentry with readable (symbolicated) stack.

## Release checklist

1. Implementation on a feature branch (plan doc to follow).
2. `npm version minor` → 0.6.0 (app.config.ts reads package.json version).
3. EAS build (production profile) → TestFlight + Play internal/closed track.
4. Update both store data forms + publish updated privacy.html in the same
   release window.
5. Device QA per list above; record results + follow-ups in memory.

## Prerequisites (user actions)

- Create Sentry org (EU region) + React Native project; provide DSN, org slug,
  project slug; add `SENTRY_AUTH_TOKEN` to EAS env (sensitive).
- Create PostHog account on EU Cloud + project; provide project API key.
