# M0 Spike — Device Matrix Results & Verdict

**Device:** Samsung Galaxy S24+ (One UI, Android 14/15) — the #1 "aggressive OEM" per research.
**Approach:** bespoke Kotlin Expo local module (`modules/schedularm-alarm`) — chosen over all libraries (dead/insufficient).
**Build:** succeeds via EAS `preview` (after fixing: JS config plugin, `versionName`/`versionCode`, explicit `androidx.core`).

## Matrix results (tested on real S24+)

| Behavior | Result |
|---|---|
| Build → schedule → fire pipeline (EAS → AlarmManager → receiver → FGS) | ✅ works end-to-end |
| Alarm **rings** (looping `USAGE_ALARM` audio) when armed | ✅ works |
| Dismiss stops the ring | ✅ works |
| Heads-up **banner** when the alarm fires | ✅ shows |
| **Auto full-screen activity over the LOCKED screen** | ❌ **does NOT auto-launch** — only a banner; full-screen appears only when the banner is tapped |
| Reboot re-arm | ⏳ unconfirmed (instrumented: "Ring in 15 min" button + `BootReceiver` logging; needs Samsung battery-whitelist + a longer window) |
| Silent/DND + 5-min sustained loop | ⏳ not tested |
| App-kill survival, forced Doze | ⏳ not tested |

## Verdict: GO on feasibility — but Samsung hardening is REQUIRED before release

**Proven:** the bespoke native pipeline builds, and the alarm **reliably fires and rings loud looping alarm audio and dismisses** on real Samsung hardware — so the core safety function (wake the user with sound) works.

**NOT yet working on the S24+ — carry into Plan 2 as explicit tasks:**
1. **Auto full-screen takeover over the lock screen.** Currently a heads-up banner (tap → full-screen) even when locked. Fix (per research): add `SYSTEM_ALERT_WINDOW` ("Appear on top") + an **overlay-gated direct `startActivity` fallback** from the foreground service — the exact-alarm receiver's background allowance covers starting a *foreground service* but not launching an *Activity* on aggressive OEMs. Verify on S24+.
2. **Reboot re-arm.** Unconfirmed; needs the **Samsung battery-whitelist onboarding** (Unrestricted + Never-sleeping + Appear-on-top + app opened once) + a realistic test window. Instrumented and ready to retest.
3. **Sustained-loop / app-kill / Doze** — verify on-device before release.

## Implications for Plan 2
1. Productionize this module behind `src/alarm/AlarmService.ts` (the spike works — it's the foundation, not throwaway).
2. Implement the **full-screen-over-lock hardening** (overlay permission + direct-activity fallback) — issue #1 above.
3. The **OEM battery-whitelist onboarding is REQUIRED** (spec §8), not optional — bake into first-run.
4. Keep reboot / Doze / app-kill / sustained-loop as an **on-device release-gate checklist** (use the instrumented spike build).

---

# Plan 2 hardening retest (2026-06-11, S24+, Plan 2 dev build)

Dev client: EAS build d1c4dacf (all Plan 2 native hardening: SYSTEM_ALERT_WINDOW + overlay-gated direct launch + battery/manufacturer checks).

| Behavior | Result |
|---|---|
| **Auto full-screen activity over the LOCKED screen** (M0 open item #1) | ✅ **WORKS** — with "Appear on top" granted, the ring screen auto-launches full-screen over the lock screen (overlay-gated `startActivity` fallback from the FGS) |
| First-run onboarding (battery step on Samsung, Continue gating) | ⏳ pending report |
| Reboot re-arm (M0 open item #2) | ⏳ pending |
| Silent/DND, app-kill, forced Doze | ⏳ pending |
| Armed-state relaunch restore, disarm, sticky presets | ⏳ pending |

**Device findings fixed during testing:**
1. Android time-picker double-dialog — the `display="spinner"` picker is itself a system dialog and stacked over the custom modal card. Fixed in `5b70125` (bare dialog on Android, commit via set/dismissed events; picker now also seeds from the edited row's current time).
2. Fall-asleep / leave-home alerts were not part of Plan 2 scope (deferred to Plans 3/4) — user pulled forward as simple push alerts; implemented in `1e5e0aa` via expo-notifications (scheduled on arm, cancelled on disarm; wake stays the full native alarm). Requires the next dev build (1e1eb947).

---

# ⏯ RESUME HERE — on-device testing checkpoint (2026-06-11)

**State:** All Plan 2 code is done, reviewed, and committed locally on `main` (NOT pushed). Two device-found fixes landed mid-testing: bare Android time-picker (5b70125) and fall-asleep/leave-home push alerts (1e5e0aa).

**Install this build** (includes the push alerts — replaces the previous one in place):
https://expo.dev/artifacts/eas/ZwZ5lUZTe0EK4q13687mPQ78PG_HZ-ihUWe6AaE1pOg.apk

**To connect the dev server** (VPN breaks LAN + ngrok tunnel):
- Home Wi-Fi, no VPN: `npx expo start --dev-client`, pick the server in the app.
- Or USB anywhere: `adb reverse tcp:8081 tcp:8081 && npx expo start --dev-client`, then in the app "Enter URL manually" → `http://localhost:8081`. (adb is installed via Homebrew.)

**Already verified PASS on S24+:**
- Auto full-screen ring over the locked screen (the M0 gate) ✅
- Time-picker fix + row-seeded picker (verify visually after reload) ✅ shipped

**Remaining checklist:**
1. First-run onboarding: clear app data → 4 steps incl. battery (Samsung), each Enable routes correctly, Continue gated.
2. Push alerts (NEW build): arm with fall-asleep/leave-home in the near future → 🌙 and 🚪 notifications fire at those instants; Disarm cancels them.
3. Armed banner survives app kill + relaunch; Disarm prevents the ring.
4. Sticky presets: change duration + arm → sticks; change without arm → doesn't.
5. Reboot re-arm: arm ~15-20 min out, reboot, leave locked → fires; `adb logcat -s SchedularmAlarm` shows `BootReceiver.reArm`.
6. App-kill survival, silent+DND ring, Doze (`adb shell dumpsys deviceidle force-idle`).

**Then:** report PASS/FAIL per item → record final acceptance here → commit → decide on pushing the ~35 local commits.
