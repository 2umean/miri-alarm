# Deployment & Store Submission — Reference (for later)

> Not needed until we're ready to ship. Captured now so the build phase keeps the
> store constraints in mind (a few tie directly to the alarm permissions).
> **MIRI Alarm is a personal project** (not a company app) — account-type and
> bundle-ID guidance below reflects that.

## Mental model

One loop, two storefronts:

```
code → eas build (cloud) → eas submit → store review → testing track → promote to production
```

- **EAS Build** compiles your TypeScript into native binaries **in the cloud** (`.ipa` for iOS, `.aab` for Android) — **no Mac required**, EAS even manages iOS signing certificates for you.
- **EAS Submit** uploads each binary to the store console (Apple **App Store Connect**, Google **Play Console**).
- Each store runs its own review, lands the build on a **testing track** first (Apple **TestFlight**, Google **Internal testing**), then you promote to **Production**.
- **Key rule for this app:** every fix ships as a full **build + submit + review** — `expo-updates` is NOT installed (OTA explicitly disabled on both platforms), so there is no `eas update` shortcut, even for JS-only changes. Adding OTA later is its own project (install `expo-updates` + re-check the privacy forms, since it phones home to Expo's servers).

## Costs (year one)

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | **$99 / year** | required to publish to App Store; also required for TestFlight |
| Google Play Console | **$25 one-time** | no renewal |
| Expo EAS free plan | **$0** | ~15 iOS + 15 Android cloud builds/month — enough to ship this |
| Privacy-policy hosting | $0 | static page / GitHub Pages |
| Store commission | $0 | app is free, no in-app purchases |
| **Year-one total** | **≈ $124** | then $99/yr ongoing for Apple |

## Personal-project specifics

- **Google account type / the 14-day wall:** a **personal** Play Console account created after 2023-11-13 must run a **closed test with ≥12 testers for 14 consecutive days** before it can apply to publish to Production. An *Organization* account avoids this but needs a free **D-U-N-S number** (registered to a business entity). As a personal project, plan for the **personal account + 14-day testing requirement** — start the closed test early. (Revisit if this is ever published under a company.)
- **Bundle / package IDs (pick once, never changeable):** the app's ID is `com.umean.miri`, set as `ios.bundleIdentifier` / `android.package` in `app.config.ts`. IDs really can't be renamed — the 2026-07 schedularm→MIRI rebrand had to mint a whole new app identity (new store records, new EAS project; old installs don't upgrade in place).
- **Apple account type:** **Individual** (your legal name shows as the seller; no business paperwork / D-U-N-S needed).

## One-time setup

1. **Accounts (start first — verification has delays):** Expo (free), Apple Developer Program ($99/yr, identity verification takes days), Google Play Console ($25, real card + government-ID verification).
2. **Tooling:** `npm install -g eas-cli` → `eas login` → `eas init`.
3. **Pick permanent IDs** (`ios.bundleIdentifier`, `android.package`).
4. **Native capabilities in `app.config.ts` / config plugin** (bake in at build time):
   - iOS: `ios.infoPlist.NSAlarmKitUsageDescription` (a real sentence — see gotchas), `ios.deploymentTarget = "26.0"`.
   - Android: permissions `USE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SYSTEM_EXEMPTED`; the config plugin sets `android:foregroundServiceType="systemExempted"`. (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is deliberately ABSENT — Play restricts it and alarm apps don't qualify; the battery onboarding step opens the optimization-settings list instead. The plugin's regression test locks this shape.)
5. **`eas.json` build profiles:** `development` (dev client, internal), `preview` (release build, internal/testers), `production` (store).
6. **App records:** App Store Connect → New App (note numeric App ID); Play Console → Create app (locks package name).
7. **First Android upload is manual once** (Google API limitation) — build the `.aab`, upload by hand in Play Console, accept "App signing by Google Play". Then set up a Google **service-account key** so `eas submit` automates future uploads. For iOS, create an **App Store Connect API key** for `eas submit`.
8. **Privacy/data forms** (required even with zero data): Apple App Privacy = "Data Not Collected"; Google Data Safety = "no data collected/shared"; plus age/content rating. **Privacy policy: DONE (2026-07-14)** — live at <https://2umean.github.io/miri-alarm/privacy.html> (`gh-pages` branch) and linked from inside the app (ChainScreen footer; both stores require the in-app link, not just the console URL field).

## Every-release flow

1. **Bump** `version` + `buildNumber` (iOS) / `versionCode` (Android) — every upload, or the store auto-rejects.
2. **Every change → full build** (no OTA path in this app; see "Key rule" above).
3. `eas build --platform all --profile production`
4. `eas submit --platform ios` / `--platform android`
5. **Test on real devices** (TestFlight / Internal track) — alarms behave differently than the simulator.
6. **Submit for review → release.** Apple ~1 day; Google hours–days.

## ⚠️ MIRI-specific store traps (tie to the alarm permissions)

- **iOS AlarmKit — do NOT add an "alarmkit" entitlement; it does not exist.** Apple confirmed (Developer Forums thread 797950, Aug 2025) that AI tools hallucinate `com.apple.developer.alarmkit`; adding it **breaks the build**. AlarmKit needs **only** `NSAlarmKitUsageDescription` + a runtime `requestAuthorization()` prompt.
- **You do NOT need Critical Alerts.** That entitlement needs special approval and is reserved for health/safety apps. AlarmKit already rings through Silent/Focus. Skip it.
- **A vague `NSAlarmKitUsageDescription` = rejection.** State plainly why crew need alarms.
- **Android FGS: `systemExempted` needs NO Play declaration and NO demo video** (verified 2026-07-14 against the Play FGS policy + Android FGS-type docs): the Play declaration requirement explicitly exempts `systemExempted`/`shortService`, and holding `USE_EXACT_ALARM` makes an alarm app eligible for the type. Do **not** "downgrade" to `specialUse` — THAT type requires the full declaration + demo video and bounces on vague justifications.
- **Android `USE_EXACT_ALARM` is gated at the binary level** — Play blocks publishing unless the app genuinely looks like an alarm/clock app. The **store listing + main UI must visibly be about alarms**. Use `USE_EXACT_ALARM` (auto-granted to qualifying alarm apps), not `SCHEDULE_EXACT_ALARM`.
- **Android `USE_FULL_SCREEN_INTENT` needs a Play "App content" declaration** (alarm apps allowed). Since 2025-01-22, skipping it means the permission isn't auto-granted on Android 14+ and the lock-screen alarm UI **silently won't appear**.
- **Coupling trap:** `systemExempted` eligibility comes FROM holding `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` — dropping the exact-alarm permission would make the ring service throw `ForegroundServiceTypeNotAllowedException` on Android 14+. The two must ship together (the plugin regression test locks both).
- **False privacy declarations can ban the account** — if an analytics/crash SDK is ever added, update the data forms accordingly.
- **SDK currency:** App Store Connect uploads must use the iOS 26 SDK (EAS handles this if the Expo SDK is current).
