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
7. **Android submit automation = a Google service-account key** (set up 2026-07-15, verified against current docs — the old Play Console "API access" linking page was REMOVED in 2024; guides mentioning it are stale):
   1. Google Cloud Console → create/pick a project → **IAM & Admin → Service Accounts → Create Service Account** (name only, **no GCP IAM roles needed**) → done.
   2. On the new account: **Manage keys → Add key → Create new key → JSON** → download; save as `credentials/play-service-account.json` (gitignored via `/credentials/`).
   3. Still in Cloud Console: enable the **Google Play Android Developer API** (`console.cloud.google.com/apis/library/androidpublisher.googleapis.com`) in that same project.
   4. Play Console → **Users and permissions → Invite new users** → the service account's email → **App permissions** tab → select MIRI → grant **"Release apps to testing tracks"** + **"Manage testing tracks and edit tester lists"** (+ "View app information" comes as the read-only base) → Invite. Production releases would additionally need "Release to production" — deliberately NOT granted.
   5. Gotcha: a 403 "The caller does not have permission" right after setup usually means **propagation lag (up to 24–48 h)**, not misconfiguration. Wait and retry before debugging.
   6. The app record itself + the FIRST release rollout must still happen in the Play Console UI (no API exists for app creation, and the first release needs Google's first review). But the first `.aab` **upload** can go through `eas submit` with `releaseStatus: "draft"` — a never-published app only accepts draft releases via API ("Only releases with status draft may be created on draft app" otherwise). After the app is first published, flip `releaseStatus` to `"completed"` (or delete the line) in `eas.json`.
   For iOS, create an **App Store Connect API key** for `eas submit` (done — `credentials/AuthKey.p8`).
8. **Privacy/data forms** (required even with zero data): Apple App Privacy = "Data Not Collected"; Google Data Safety = "no data collected/shared"; plus age/content rating. **Privacy policy: DONE (2026-07-14)** — live at <https://2umean.github.io/miri-alarm/privacy.html> (`gh-pages` branch) and linked from inside the app (ChainScreen footer; both stores require the in-app link, not just the console URL field).

## Every-release flow

1. **Bump** `version` + `buildNumber` (iOS) / `versionCode` (Android) — every upload, or the store auto-rejects.
2. **Every change → full build** (no OTA path in this app; see "Key rule" above).
3. `eas build --platform all --profile production`
4. `eas submit --platform ios` / `--platform android`
5. **Test on real devices** (TestFlight / Internal track) — alarms behave differently than the simulator.
6. **Submit for review → release.** Apple ~1 day; Google hours–days.

## Android → Google Play recipe (local build, as practiced)

Mirrors the iOS TestFlight flow. Local builds don't consume EAS build quota; `eas submit`
is a separate free hosted service (the `.aab` is uploaded to EAS and submitted from their servers).

```sh
eas build -p android --profile production --local --non-interactive   # → build-<ts>.aab in repo root
# Production-track upload as a DRAFT (roll out manually in Play Console; use once the app is live):
# eas submit -p android --profile play-production --path build-<ts>.aab --non-interactive
eas submit -p android --profile production --path build-*.aab --non-interactive
```

- Credentials: `submit.production.android` in `eas.json` points at `credentials/play-service-account.json`
  (local-only, gitignored). versionCode auto-increments remotely (`appVersionSource: remote` + `autoIncrement`).
- **Tracks** (`track` in `eas.json`): `internal` = Internal testing (≤100 testers, live in minutes,
  no store listing/review needed; new apps show a temporary listing for up to 48 h; testers join via
  the opt-in link `play.google.com/apps/testing/com.umean.miri`). `alpha` = the default Closed testing
  track — needs the FULL console setup (store listing, content rating, data safety…) + review, and is
  the ONLY track that counts toward the personal-account 12-testers×14-days production requirement.
  Internal-track engagement does NOT count.
- **Until first publish:** keep `releaseStatus: "draft"` — drafts land in the Console, where you finish
  the rollout by hand. Signing: first upload auto-enrolls Play App Signing; the EAS keystore becomes the
  upload key (nothing to configure, but back the keystore up).

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
- **Release builds now need `SENTRY_AUTH_TOKEN`:** release builds run Sentry's source-map upload; without `SENTRY_AUTH_TOKEN` a local release build (`expo run:android --variant release`, or `eas build --local` without the env delivered) FAILS at the upload step. EAS cloud builds get the token from the project's env vars automatically. Escape hatches for tokenless local release builds: `SENTRY_DISABLE_AUTO_UPLOAD=true` (both platforms) or `SENTRY_ALLOW_FAILURE=true` (iOS). Debug/dev builds are unaffected.

## iOS local-build troubleshooting

- **Xcode 27 (2026-10):** two hard errors, both fixed in the repo — keep them when upgrading.
  (1) `expo-modules-jsi` ≤ 56.0.12 fails Swift 6.4 at `JavaScriptRuntime.swift:219` ("a C function
  pointer can only be formed from a reference to a 'func' or a literal closure") — fixed upstream in
  56.0.13; the lockfile pins 56.0.14 (`npm update expo-modules-jsi`; it's transitive via
  expo-modules-core `~56.0.x`). (2) Pods' resource-bundle targets keep their podspec's iOS 11.0–13.4
  deployment target, which Xcode 27 rejects (supported range 15.0+); `react_native_post_install` only
  raises main pod targets, so `plugins/withResourceBundleDeploymentTarget.js` adds a Podfile
  `post_install` step raising the bundles to 15.1. Verified with `prebuild --clean` + Release builds
  for device and simulator (the simulator build launched fine).
  (3) `archive` (what `eas build` runs) still failed: Swift 6.4's new foreign-reference ownership
  warnings on `RuntimeScheduler`'s constructors make the inner `Build ExpoModulesJSI xcframework`
  phase print a bogus `error: … failed with exit code 0`, and Xcode 27 fails any script phase that
  emits errors ("Command PhaseScriptExecution emitted errors but did not return a nonzero exit
  code"). A plain `build` only warns, so this shows up at archive time. Fixed upstream in
  expo-modules-jsi 57.0.5 (#49120); SDK 57 includes it (the SDK 56 patch-package backport was
  removed with the SDK 57 upgrade).
  (4) **iOS 27 SDK builds MUST adopt the UIScene lifecycle — 1.2.1 (build 13, the first Xcode 27
  build) crashed at launch on every iOS 27 device** (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`
  → SIGTRAP; iOS 26 ran it fine, which is why sim QA on the 26.5 runtime missed it). UIKit gates
  this on the SDK the app links against, so an Xcode 26 build is unaffected. Fixed by SDK 57 +
  `expo-build-properties` `ios.enableSceneSupport: true` (app.config.ts) — React Native now starts
  from Expo's `EXExpoAppSceneDelegate`. **Always QA iOS on an iOS 27 simulator runtime**
  (`xcodebuild -downloadPlatform iOS`), and confirm the built `Info.plist` has a
  `UIApplicationSceneManifest`. Drop the property on SDK 58+ (template adopts scenes).
  (5) **Xcode 27.1 (Swift 6.4) can't import Expo 57's precompiled module xcframeworks** (built with
  Swift 6.3.1): `failed to build module 'ExpoModulesCore'; this SDK is not supported by the compiler`.
  Fixed by `expo-build-properties` `ios.usePrecompiledModules: false` (app.config.ts), which builds
  the Expo modules from source. For an in-place `ios/` dir, also rebuild the locally cached
  `ExpoModulesJSI` slice if you see `cannot find type '__ObjC::expo' in scope`:
  `PODS_ROOT=$PWD/ios/Pods PLATFORM_NAME=iphonesimulator node_modules/expo-modules-jsi/apple/scripts/build-xcframework.sh --clean`
  (the build phase kept a stale Swift 6.3.1 slice). Fresh EAS local builds don't hit this.

- **Debug link fails with ~25 undefined `facebook::react::…getDebug…`/`Sealable`/`RCTPackagerConnection` arm64 symbols** (an `ld: cannot link directly with 'SwiftUICore'` *warning* appears alongside — it's a red herring, not the fatal error): the prebuilt RN core at `ios/Pods/React-Core-prebuilt/React.xcframework` is stuck on the **Release** flavor, which lacks those debug-only symbols. RN 0.85 swaps the framework Debug↔Release with a before-compile script (`react-native/scripts/replace-rncore-version.js`) keyed on `ios/Pods/React-Core-prebuilt/.last_build_configuration`; if that marker file is lost (e.g. an interrupted build after an in-place Release build), the script assumes the pristine Debug install from `pod install` and never swaps back — and `pod install` won't fix it because the pod itself is unchanged. **Diagnose:** `stat -f%z ios/Pods/React-Core-prebuilt/React.xcframework/ios-arm64_x86_64-simulator/React.framework/React` — Release ≈ 24 MB, Debug ≈ 132 MB (RN 0.85.3). **Repair:** `printf 'Release' > ios/Pods/React-Core-prebuilt/.last_build_configuration` then rebuild (the script re-extracts the Debug flavor from `ios/Pods/ReactNativeCore-artifacts/`), or the sledgehammer `npx expo prebuild -p ios --clean`. Hermes uses the same mechanism (`ios/Pods/hermes-engine/.last_build_configuration`) and can wedge the same way. Fixed this way 2026-07-27 on the admob branch.

## Ads (AdMob)

- **`react-native-google-mobile-ads` is exact-pinned to 16.3.4** (no `^`): 16.4.0 bundles Android GMA SDK 25.4.0, whose Kotlin 2.3.0 metadata fails to compile against RN 0.85/0.86's Kotlin 2.1.20 (invertase/react-native-google-mobile-ads#863). Before ANY upgrade, check that invertase PR #866 (or a release containing it) has shipped.
- **Never `npx expo install` this package** — it is not in the Expo SDK's `bundledNativeModules`, so `expo install` resolves the broken latest instead of respecting the pin.
- **Adding this native module invalidated all previous dev clients** — builds made before the ads release lack the native code; build fresh dev clients.
- **Dev builds serve Google test ads** (`TestIds.ADAPTIVE_BANNER`); release builds serve the live units. Register physical QA devices in AdMob (**Settings → Test devices**) BEFORE running release builds on them.
