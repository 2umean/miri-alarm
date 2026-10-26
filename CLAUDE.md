# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> The app is on **Expo SDK 57** (see `package.json`). Expo's APIs change between SDKs, so check the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo code.

## What this is

MIRI Alarm (미리) is a "reverse alarm" app for airline crew, built with React Native and Expo. The user sets an arrival time and an ordered list of pills (sleep, shower, commute…). The app works backwards from the arrival to find when each pill starts, then fires OS-guaranteed alarms and push alerts at the marker pills. It ships to the App Store and Google Play as `com.umean.miri`. Korean is the primary language and English is the fallback.

## Commands

```sh
npm test                                            # jest, all suites (~5 s)
npx jest src/domain/__tests__/chainEngine.test.ts   # one file
npx jest -t 'rolls forward'                         # tests whose name matches
npx tsc --noEmit                                    # typecheck (no linter is configured)

npx expo run:ios | npx expo run:android   # build + install a dev client (prebuilds ios/ + android/)
npx expo start                            # Metro for an already-installed dev client
npx expo prebuild --clean                 # regenerate native dirs after app.config.ts / config-plugin changes
```

- Expo Go can't run the app because it has a custom native module. Use a dev client (`expo-dev-client`).
- `docs/deployment.md` covers one-time account and credential setup, store-policy traps and Xcode 27 troubleshooting. Read it before touching builds, permissions or store submission.

## Releasing

Every release is built locally with EAS and uploaded to both stores. Local builds don't use EAS cloud build quota, and `eas submit` is a separate free service. EAS builds from the **committed** tree, so commit everything before building.

1. **Bump the version** on `main` after the feature branch is merged. Use PATCH for a fix and MINOR for a feature:
   ```sh
   npm version patch --no-git-tag-version   # package.json is the single source; app.config.ts reads it
   git commit -am "1.2.4"                   # bare x.y.z subject
   git tag v1.2.4                           # lightweight tag
   ```
   Never set the iOS buildNumber or the Android versionCode by hand. EAS increments both remotely (`appVersionSource: remote` + `autoIncrement`), including during `--local` builds.

2. **Build locally**, one platform per command:
   ```sh
   eas build -p ios --profile production --local --non-interactive       # → build-<ts>.ipa in repo root
   eas build -p android --profile production --local --non-interactive   # → build-<ts>.aab in repo root
   ```
   - Rename the outputs to `miri-vX.Y.Z.ipa` and `miri-vX.Y.Z.aab`. Both stay in the repo root, which gitignores them.
   - Signing credentials and `SENTRY_AUTH_TOKEN` come from EAS automatically when logged in as `kgulag98` (`eas whoami`).
   - iOS local builds need fastlane on `PATH` (`/opt/homebrew/bin`).
   - An iOS build that fails at PREPARE_CREDENTIALS with "Distribution certificate … hasn't been imported successfully" means the Mac is missing Apple's current WWDR G3 intermediate certificate. Install it once with `curl -fsSL -o /tmp/g3.cer https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer && security import /tmp/g3.cer -k ~/Library/Keychains/login.keychain-db`.
   - A local release build outside EAS (`expo run:* --variant release`) has no Sentry token and fails at the source-map upload step. Set `SENTRY_DISABLE_AUTO_UPLOAD=true` for those.
   - For a quick Android tester APK, use `--profile preview` instead; it outputs `build-<ts>.apk`.

3. **Upload to each store:**
   ```sh
   eas submit -p ios --profile production --path miri-vX.Y.Z.ipa --non-interactive       # → App Store Connect / TestFlight
   eas submit -p android --profile production --path miri-vX.Y.Z.aab --non-interactive   # → Play internal track, as a draft
   ```
   - iOS uses an EAS-managed App Store Connect API key. `eas.json` holds only `ascAppId`, and no env vars are needed.
   - Android uses `credentials/play-service-account.json`, which is local-only and gitignored.
   - The Play service account has testing-track permissions only, so the `play-production` profile fails. Production goes through the Play Console.

4. **Push** `main` and the new tag to origin. Keep tags pushed, because `git fetch --prune-tags` deletes tags that exist only locally.

5. **Console steps** (done by hand in each console):
   - **App Store Connect:** create version X.Y.Z, paste each language's App Store text into that localization's "What's New" box, attach the uploaded build, submit for review, then release.
   - **Play Console:** roll out the internal-track draft, then promote it to Production with the release notes.

### Release notes

Write `store-listing/release-notes/X.Y.Z.md` for every release; earlier versions are in the same folder. `store-listing/` is local and not committed. The two stores take different text, so each file carries the same notes in two formats:

- **Google Play:** one fenced block with `<ko-KR>…</ko-KR>` and `<en-US>…</en-US>`, pasted as-is into Release → Release notes. The Korean section opens with `이번 업데이트` and the English with `What's new`, followed by `• ` bullets. Emoji are fine here (⏰ alarm, 🔔 notification, 📍 arrival). Google Play caps release notes at 500 characters per language.
- **App Store Connect:** a separate fenced block for each language (Korean, English), because each localization has its own "What's New in This Version" box. It accepts neither bullets nor emoji, so write plain sentences and spell the emoji out as words (알람 / 알림 / 도착 시각, alarm / notification / arrival time). TestFlight's "What to Test" uses this text too.

For both formats:

- Start the file with `# Release notes — X.Y.Z`, then a line naming the platforms.
- Describe what changed for the user in plain, friendly language, using 해요체 in Korean.
- Leave internal or build-only changes out of the paste blocks; note them under a "Not user-facing:" line at the end.
- For a single-platform release, say so in the header line. For example, 1.2.2 was iOS-only and also carried the text for an expedited-review request.

## Architecture

Layers, from pure to native: `src/domain` → `src/state` → `src/storage` → `src/hooks` → `src/ui`. `src/alarm` is the bridge to the native module.

**Domain model (`src/domain`).** `Chain = { arrival, zone, pills }` in `pill.ts` is the only source of truth. Every clock time is derived from it by `computeChain`, which reverse-calculates from the arrival anchor using elapsed-ms offsets, so DST is handled by construction. There are two kinds of pill:
- an `EventPill` (`type: 'none'`), which has a duration
- a `MarkerPill` (`'push' | 'alarm'`), which takes zero time and fires where the previous item ends. Its label comes from the preceding event (`markerLabel.ts`).

`src/domain` and `src/state` are pure. They import only `luxon`, never React Native. They contain no UI strings: seed pills carry i18n keys, which `state/chainHydrate.ts` turns into names. They never call `Date.now` or `Math.random`: `now`, the name resolver and the id factory are injected. `chainReducer` only changes structure; validation (`chainValidation.ts`) is the gate.

**Persistence (`src/storage`).** The editable draft (`draftChain.ts`, saved on every change) and the armed snapshot (`armedChain.ts`, which exists only while armed) are kept separate. Both parse through `chainSanitize.ts`. AsyncStorage keys are versioned `schedularm.<thing>.vN`; the prefix is older than the MIRI rebrand. To change a format, never rename a key: add a new version plus a migration, like `legacyV2.ts` does. Loads share one in-flight promise so concurrent reads can't race a migration.

**Hooks.**
- `useChain` owns the draft lifecycle, a 60 s `now` tick and rolling the chain forward once its arrival has passed.
- `useArmingChain` owns the armed snapshot, alarm health and missed-alarm reporting. A chain stays armed until its **last** alert, not its first.

**AlarmService (`src/alarm/AlarmService.ts`) is the safety-critical seam.** UI and hooks call only this object. They never call `modules/schedularm-alarm` directly; type-only imports are fine. `armChain` routes alarm markers to the native module (`alarmPlan.ts`) and push markers to `expo-notifications` (`chainPushAlerts.ts`, imported dynamically, best-effort). It rules:
- It awaits native scheduling and **throws** when nothing would fire. Callers must mark a chain armed only after it resolves.
- Past instants must never be scheduled, because `setAlarmClock` fires them immediately.
- `scheduleAlarms` replaces the whole alarm set.

**Native module (`modules/schedularm-alarm`).** This is a local Expo module; its name is older than the rebrand.
- **Android (Kotlin).** `AlarmController` is the single source of truth for the persisted alarm set: JSON entries with a per-alarm `reqCode` and `fired`/`snoozed` flags. The ring path is `setAlarmClock` → `AlarmReceiver` → `AlarmForegroundService` (a `systemExempted` FGS that loops the sound at `USAGE_ALARM`) → `AlarmActivity` (full-screen over the lock screen, layout built in code). If an OEM rejects the FGS start, it falls back to an insistent notification. `BootReceiver` re-arms future alarms after a reboot or update and reports the ones that passed. Debug with `adb logcat -s SchedularmAlarm`.
- **iOS (Swift).** Uses AlarmKit. **No AlarmKit entitlement exists.** Adding `com.apple.developer.alarmkit` breaks the build. Only `NSAlarmKitUsageDescription` and runtime authorization are needed.
- **Config plugin.** `plugin/withSchedularmAlarm.js` injects every Android permission and component. It must stay CommonJS because eas-cli doesn't transpile TS plugins. Its test locks the manifest shape.
- **Native strings.** Ring-screen strings are localized outside the JS catalogs, in `android/src/main/res/values{,-ko}/strings.xml` and `ios/{en,ko}.lproj`.

**App shell.** `App.tsx` is a state router (`loading` → `onboarding` → `chain`) with no navigation library. Onboarding shows again whenever `AlarmService.getHealth().isArmReliable` is false, for example after an OEM resets the battery exemption.

**Telemetry and ads.**
- Telemetry (`src/telemetry`) is opt-in. Sentry and PostHog start only after consent is `'granted'`; the default `'unset'` shows `ConsentSheet`. Event properties go through `sanitizeProps` in `events.ts`.
- Any change to what gets collected must also update the store privacy forms (`docs/store-privacy-answers.md`). False declarations can get the account banned.
- Ads (`src/ads`) are an AdMob banner. `mobileAds().initialize()` runs only after UMP reports `canRequestAds`.

**i18n.** The catalogs are `src/i18n/{en,ko}.ts`, chosen by device locale with no in-app switcher. A test enforces that both catalogs have identical key sets.

## Native projects and store constraints

- `ios/` and `android/` are gitignored and generated by prebuild, so edits made there are lost. Make native changes through `app.config.ts`, the config plugins (`modules/schedularm-alarm/plugin/`, `plugins/`) or the module's own source.
- `expo-updates` is not installed, so there is no OTA path. Every change, even a JS-only one, ships as a full store build.
- Keep the `expo-build-properties` iOS flags `enableSceneSupport` and `usePrecompiledModules: false`, and keep `plugins/withResourceBundleDeploymentTarget.js`. They are Xcode 27 fixes, and their comments say when each can be dropped. `plugins/__tests__/iosSceneLifecycle.test.ts` guards the UIScene requirement by running `npx expo config --type introspect`. Without UIScene, 1.2.1 crashed at launch on every iOS 27 device.
- `react-native-google-mobile-ads` is exact-pinned to `16.3.4` because 16.4.0 breaks the Kotlin build. Never `npx expo install` it.
- Three Android permission rules for the alarm path:
  - Never add `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
  - Never drop `USE_EXACT_ALARM`; eligibility for the `systemExempted` FGS type depends on it.
  - Never switch the FGS type to `specialUse`.

## Tests

- Jest runs ts-jest in a plain node environment, with no jest-expo or babel.
- `react-native` and `expo-localization` are mapped to hand-written stubs in `test/stubs/`. A component test that uses an RN API missing from `test/stubs/react-native.js` needs that stub extended.
- Tests live in `__tests__/` next to the code they cover, under `src/`, `modules/` and `plugins/` (see `testMatch` in `jest.config.js`).

## Design docs and conventions

- Each feature has a dated design spec in `docs/superpowers/specs/` and an implementation plan in `docs/superpowers/plans/`. Code comments cite them ("spec §8", "design 2A"), so read the matching spec before changing behavior it defines. `spike/` holds the original Android alarm-reliability research.
- Commits use conventional style with a scope (`fix(ios): …`, `docs(plan): …`). Feature branches are merged with a merge commit titled `Merge branch '<branch>' — <summary>`. Version bumps are bare `x.y.z` commits (see Releasing).
