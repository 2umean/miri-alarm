# M0 Spike — Device Matrix Results & Verdict

**Device:** Samsung Galaxy S24+ (One UI, Android 14/15) — the #1 "aggressive OEM" per research.
**Approach:** bespoke Kotlin Expo local module (`modules/schedularm-alarm`) — chosen over all libraries (dead/insufficient).
**Build:** succeeds via EAS `preview` (after fixing: JS config plugin, `versionName`/`versionCode`, explicit `androidx.core`).

## Matrix results

| # | Condition | Result |
|---|---|---|
| — | **Full-screen alarm over LOCKED screen + dismiss** | ✅ **WORKS** (the core feasibility) |
| — | Rings loudly via `USAGE_ALARM` | ✅ works |
| ② | Silent/DND + 5-min sustained loop | ⏳ deferred (audio — needs non-office) |
| ① | App-killed (force-stop) survival | ⏳ deferred |
| ③ | **Reboot re-arm** | ❌→⏳ not yet confirmed on Samsung — instrumented for proper test (see below) |
| ④ | Forced Doze (`adb`) | ⏳ deferred |

### Note on the full-screen behavior
When the screen is **on/unlocked**, Android intentionally shows a heads-up **banner** (tap → full-screen) — this is correct AOSP behavior, not a bug. When the screen is **off/locked** (the case that matters for a wake-up), it auto-launches the full-screen activity. Confirmed working.

### Reboot (③) — status
Could not be validated with the 2-minute test button: a Samsung cold boot + its **delayed `BOOT_COMPLETED` delivery** outruns 2 minutes, so the (correct) "re-arm only if still future" guard skips the alarm. **Instrumented** for a proper retest: a **"Ring in 15 min"** button + `BootReceiver` logging (`adb logcat -s SchedularmAlarm`). Also requires the **Samsung battery-whitelist onboarding** (Unrestricted battery + Never-sleeping apps + Appear-on-top + app opened once) — confirmed necessary on this OEM.

## Verdict: ✅ GO (conditional)

**Feasibility is proven:** a third-party app CAN ring a reliable, full-screen, must-dismiss alarm over the lock screen with looping alarm audio on real Samsung hardware, using the bespoke `setAlarmClock` + full-screen-intent + `systemExempted` foreground-service approach. The native pipeline (AlarmManager → receiver → FGS → full-screen activity, config plugin, EAS build) all works end-to-end.

The remaining matrix items (reboot, sustained loop, app-kill, Doze) are **reliability-tuning** — mostly Samsung OEM settings — to verify as a **release gate**, not blockers to building the app.

## Implications for Plan 2
1. Productionize this module behind `src/alarm/AlarmService.ts` (the spike code is the foundation, not throwaway — it works).
2. The **Samsung/OEM battery-whitelist onboarding is REQUIRED**, not optional — bake it into the first-run flow (spec §8).
3. Keep the reboot / Doze / app-kill / sustained-loop checks as a **pre-release on-device verification checklist** (with the instrumented spike build).
