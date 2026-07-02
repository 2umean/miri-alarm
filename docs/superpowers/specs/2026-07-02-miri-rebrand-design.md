# MIRI Rebrand — Design

**Date:** 2026-07-02
**Status:** Approved scope (user chose "Full rename"); wordmark + Korean display name use recommended defaults pending user confirmation.
**Brand source:** claude.ai/design project `MIRI Brand.dc.html` — direction **1c "First Light"** (amber sun cresting a broken white horizon on the Soft Sky blue gradient).

## What & Why

`schedularm` becomes **MIRI Alarm** (brand: MIRI, Korean 미리 — "in advance / ahead of time"). The user picked the brand page's full-rename handoff: new display name, new logo assets, and new app identifiers (`slug`/`scheme` → `miri`, `bundleIdentifier`/`package` → `com.umean.miri`).

**Consequence accepted by the user:** a new bundle ID / package means Apple and Google treat this as a *brand-new app*. The existing TestFlight record (ascAppId 6780713952, `com.umean.schedularm`) is orphaned; installed Android APKs will not update in place — users reinstall and lose locally saved chains.

## Decisions

| Decision | Value | Notes |
| --- | --- | --- |
| Display name | `MIRI Alarm` | user's explicit words |
| Korean launcher label | `미리` via `locales` config | **default (user AFK)** — matches brand mock; flip to "MIRI Alarm everywhere" by deleting the locales entry |
| In-app wordmark | `MIRI ✈` | **default (user AFK)** — keeps crew plane motif; brand lockup alternative is `MIRI.` |
| Korean running text | `미리는 …` | user decision 2026-07-02: brand is written in hangul in Korean sentences (overrides the earlier Latin-MIRI default) |
| slug / scheme | `miri` | per brand handoff |
| bundleId / package | `com.umean.miri` | per brand handoff |
| NSAlarmKitUsageDescription | "MIRI Alarm sets alarms so airline crew reliably wake up and leave on time for their duties." | keeps the crew-specific wording Apple reviewers prefer; brand page's generic sentence rejected |
| package.json name | `miri` | cosmetic; lockfile regenerated |
| Splash | unchanged (`#F2F8FF`, tile 160px) | brand page: "matches app.config" |
| Ring notification title | `MIRI Alarm` (inline in `AlarmForegroundService.kt`) | brand mark, identical in both locales — no string resource needed |
| `extra.eas.projectId` | **removed** | EAS slugs are immutable (expo.fyi/eas-project-id): the old `schedularm` project can't become `miri`. `eas init` creates @kgulag98/miri and re-pins the ID |
| `eas.json` ascAppId | **removed** | 6780713952 is the old bundle ID's ASC record; submitting a `com.umean.miri` binary to it is rejected at delivery. Re-pin after the new ASC record exists |
| Korean launcher label mechanism | `locales: { ko: './locales/ko.json' }` + `CFBundleAllowMixedLocalizations: true` | verified against v56 docs + installed @expo/config-plugins: iOS gets `ko.lproj/InfoPlist.strings` (CFBundleDisplayName), Android gets `values-b+ko/strings.xml` (app_name) |

## Explicit non-changes

- **AsyncStorage keys** (`schedularm.armed.v2`, `schedularm.draft.v*`, `schedularm.onboarded.v1`) — internal; new package = fresh installs anyway, and keeping them avoids touching domain code and tests.
- **Native module** `modules/schedularm-alarm` and its `expo.modules.schedularmalarm` namespace (intent actions, prefs `schedularm_alarm_prefs`, channel `schedularm_alarm_channel`) — module namespace is independent of `applicationId`; verified nothing hardcodes `com.umean.schedularm` outside `app.config.ts`.
- **Historical docs and comments** ("Schedularm UI v2" etc.) — record of what was, not user-facing.
- **Repo folder name / git remotes** — out of scope.

## Architecture

Asset pipeline stays exactly as before: `scripts/generate-brand-assets.mjs` is the single deterministic source (SVG masters inline, `sharp` renders PNGs). The script is the design project's drop-in replacement plus two review-driven changes: it now also **writes** `assets/brand/logo.svg` (previously a hand-synced duplicate of the same geometry), and it emits a 48px `favicon.png`, now actually referenced via `web.favicon` in `app.config.ts` (previously stale and unreferenced). The Korean locale file also carries `NSAlarmKitUsageDescription` so the AlarmKit permission sheet is Korean on Korean devices, not just the launcher label.

Because `ios/`/`android/` are gitignored (CNG), all identity changes flow from `app.config.ts` at prebuild time — no native project edits.

## Out-of-repo checklist (user actions, in order)

1. **Back up the old project's Android keystore** before anything else: `eas credentials -p android` on the old `schedularm` project → download. (Only needed if the old APK ever needs touching again.) Note any EAS env vars/secrets/webhooks — they don't transfer.
2. **`eas init`** (logged in as kgulag98) — creates the `@kgulag98/miri` project. eas-cli **cannot write into a dynamic `app.config.ts`**, so paste the projectId it prints into `extra.eas.projectId` by hand (the comment in the config marks the spot). Build history, secrets, and update channels of the old project do not carry over (nothing critical there today).
3. **iOS credentials:** first `eas build -p ios` (or `eas credentials --platform ios`) interactively — EAS registers the new App ID `com.umean.miri` on the Developer Portal, reuses the account-level distribution cert, mints a fresh provisioning profile. Re-link the ASC API key for submit if prompted.
4. **ASC app record:** either create it on appstoreconnect.apple.com (New App: "MIRI Alarm" — must be globally unique on the App Store — bundle ID `com.umean.miri`, SKU e.g. `com.umean.miri`), or let the first **interactive** `eas submit -p ios` auto-create it (needs Apple ID login; the ASC API key alone cannot create app records, and non-interactive submit fails without `ascAppId`). Then re-pin the new numeric Apple ID as `ascAppId` in `eas.json`.
5. **TestFlight:** the new app is a separate TestFlight entry — re-invite testers. Old schedularm builds keep running until expiry but never update.
6. **Android:** next `eas build -p android` produces `com.umean.miri` with a fresh keystore. It installs **side-by-side** with the old app — tell testers to uninstall Schedularm manually and install the new APK link. Build-number counters are keyed per identifier and restart cleanly; no action.
7. **Cleanup (later):** abandon/delete the old expo.dev project and stop distributing the old TestFlight build once the new pipeline is verified.

## Testing

- `npx tsc --noEmit` (via jest ts config) and full `jest` suite — i18n key-structure typing (`ko: typeof en`) guards the string edits.
- `npx expo config --type prebuilt` resolves cleanly with new identifiers + locales.
- Visual verification of regenerated icon, adaptive fg/bg composite, monochrome composite, splash.
- Adversarial diff review before commit.
