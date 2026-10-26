# 1.2.0 App Store resubmission — console checklist (2026-08-31)

Code: `main` @ `6545061` (snooze merged `f6991c2`, version `1.2.0` tag `v1.2.0`,
iOS module localization fix `6545061`). Not pushed to origin yet — push when ready.

## Files produced

| What | Where |
|---|---|
| Screenshots, Korean (7 × 1320×2868 JPEG) | `store-listing/ios/01.jpg … 07.jpg` |
| Screenshots, English (7) | `store-listing/ios-en/01.jpg … 07.jpg` |
| Raw simulator captures | `store-listing/ios-raw/`, `store-listing/ios-raw-en/` (06 = preset Load, 07 = lock-screen alert with Snooze) |
| Review demo video (English UI, sim) | `store-listing/miri-ios-review-demo-1.2.0.mp4` |
| Release notes (ko/en, also TestFlight "What to Test") | `store-listing/release-notes/1.2.0.md` |
| App Review notes + thread reply | `store-listing/app-review-notes-1.2.0.md` |
| TestFlight build | `miri-v1.2.0.ipa` in the repo root — **version 1.2.0, build 11**, min iOS 26.0; built 2026-08-31 18:11 from `main` @ `6545061` (includes the localization fix — both `.lproj` tables verified inside the archive); uploaded with `eas submit` |

Regenerate screenshots any time: `python3 store-listing/work/compose_ios.py ko` and `… en`
(reads the raws, writes the JPEGs; captions live at the top of the script).

## App Store Connect

1. **TestFlight** → wait for build 1.2.0 (N) to finish processing; add the release
   notes text as "What to Test"; optionally install on the friend's iPhone via the
   existing TestFlight group for a real-device sanity pass of Snooze.
2. **App Store → 1.2.0** (create the version if ASC still shows 1.0.0 as the one in
   review — the rejected 1.0.0 version is edited in place; bump its version string
   to 1.2.0 or create 1.2.0 and select the new build).
3. **Screenshots (6.9")** — Korean localization: delete the six old shots, upload
   `store-listing/ios/01–07.jpg` in order; English localization: `store-listing/ios-en/01–07.jpg`.
4. **What's New** — paste the ko and en blocks from `release-notes/1.2.0.md`.
5. **App Review Information → Notes** — paste `app-review-notes-1.2.0.md`; attach
   `miri-ios-review-demo-1.2.0.mp4`.
6. **Build** — select 1.2.0 (N). Release: Manual (first release).
7. **Reply in the open App Review thread** with the same notes text, mention that
   1.2.0 adds Snooze and that the attached recording shows presets + snooze in use.
8. **Submit for review.**

## After approval (unchanged from the 1.0.0 plan)

Link the AdMob app to the live listing, `app-ads.txt` "Check for updates", register
test devices in AdMob before installing release builds.

## Android — 1.2.0 (versionCode 9) is uploaded to the INTERNAL track as a draft

`miri-v1.2.0.aab` (68 MB, versionCode 9, built 2026-09-01 09:12 from `main` @ `a7415b2`)
was uploaded with `eas submit … --profile production` (EAS submission `319040e3-…`).
A direct production upload (`--profile play-production`) was refused: the Play
service account only has the testing-track permissions from setup.

**Play Console steps**
1. Testing → Internal testing → the draft release 1.2.0 (9): paste the release
   notes (`release-notes/1.2.0.md` block), Save → Review → Start rollout (internal).
2. Promote release → Production → choose rollout percentage (staged or 100 %),
   confirm the same release notes → Start rollout. Google reviews it; existing
   users receive it through Play auto-update once it is live.
3. Country list: production keeps its own list (all except EU-27 per plan).

**To let EAS upload straight to production next time:** Play Console → Users and
permissions → the service-account user → App permissions → enable
"Release apps to production, exclude devices, and use Play App Signing" (and keep
the testing-track ones), then `eas submit -p android --profile play-production
--path <aab> --non-interactive` creates a production DRAFT you finish in the console.
