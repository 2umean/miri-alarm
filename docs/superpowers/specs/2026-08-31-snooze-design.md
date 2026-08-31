# Snooze — design (2026-08-31)

Plain, fixed 5-minute snooze on every ⏰ alarm marker, on both platforms, with
one cross-platform invariant: a pending snooze survives the app's automatic
re-arm and is cleared only by Disarm. Part of the 1.2.0 App Store resubmission
(Guideline 4.2 rejection of 1.0.0/1.1.0); the store assets (screenshots, demo
recording) are a separate follow-up task, done after this ships so they can
show snooze and presets together.

## Decisions (user-approved, don't re-litigate)

| Question | Decision |
|---|---|
| Policy | **Plain snooze** — unlimited, no chain-derived cap (the capped snooze of the 2026-05-29 spec §7 and the buffer-budget variant were considered and rejected for now). |
| Duration | **Fixed 5 minutes**, one constant per platform (`SNOOZE_MINUTES = 5`). Not user-configurable, not stored on the pill, nothing new in presets. |
| Which markers | Every ⏰ alarm marker. 🔔 push markers are notifications — no snooze. |
| iOS route | **System snooze, spike-gated**: AlarmKit `.countdown` secondary button + `countdownDuration.postAlert`, alert-only presentation, no Live Activity / widget extension / App Intent. Task 1 of the plan is a simulator spike; a pre-agreed fallback (App-Intent reschedule) applies only if the spike fails. |
| JS layer | Untouched. No native-contract change, no new strings in `src/i18n`, no telemetry. |

## 1. Behavior

**Android** — the full-screen ring `AlarmActivity` shows a second pill above
the white "Dismiss alarm" pill: translucent white, `ring_snooze`
("Snooze 5 min" / "5분 뒤 다시 알림"). The heads-up ring notification (foreground
service) and the fallback ring notification get a matching **Snooze** action
next to **Dismiss**. Tapping any of them silences the ring; the same alarm rings
again 5 minutes later, full-screen, exactly like the first time. In between,
the status-bar alarm icon shows (a `setAlarmClock` property) — no extra
"snoozed" notification.

**iOS** — the AlarmKit alert keeps our localized Stop control and gains a
secondary **"Snooze 5 min"** button (`zzz` symbol, Soft Sky tint). Tapping it
moves the alarm into AlarmKit's countdown state; it re-alerts 5 minutes later
through Silent mode and Focus like the first ring. No countdown UI during the
5 minutes (a Live Activity would need a widget extension — deliberately out).

**Unchanged** — the chain screen, armed chip, presets, arm/disarm. The armed
chip keeps showing the *planned* instant; the snooze is a transient native
fact. **Disarm** cancels everything, pending snoozes included. Editing the chain
disarms as today.

**Copy** — key `ring_snooze`, en `Snooze 5 min`, ko `5분 뒤 다시 알림`, in
`android/src/main/res/values{,-ko}/strings.xml` and
`ios/{en,ko}.lproj/SchedularmAlarm.strings`.

## 2. Invariant: a pending snooze survives a re-arm

`scheduleAlarms` is a whole-set replace, and `useArmingChain` calls it on every
cold launch to self-heal native state. Without a rule, opening the app during
the 5 minutes would cancel the snoozed alarm: multi-alarm chains re-arm, and
the snoozed instant is already in the past so `planNativeAlarms` omits it.

- **Replace (`scheduleAlarms`) keeps pending snoozes.** Android: persisted
  entries flagged `snoozed` with `at > now` whose id is not in the incoming set
  are carried into the new set. iOS: persisted ids whose live state (via
  `AlarmManager.shared.alarms`) is not `.scheduled` — i.e. `.countdown`,
  `.paused` or `.alerting` — are not cancelled and stay in the persisted list.
  (Preserving `.alerting` is a small safety improvement in the same path: a
  self-heal re-arm must not silence an alarm that is ringing right now.)
- **`dismissAll` clears everything**, snoozes included.
- **Accepted limitation:** if the snoozed alarm was the chain's *last* ⏰, a
  cold launch shows the chain as expired (no armed chip, arm button back) while
  the snooze still rings natively. Nothing is lost; it is not displayed.

## 3. Android (`modules/schedularm-alarm/android/…`)

- `AlarmConstants`: `ACTION_ALARM_SNOOZE`, `SNOOZE_MINUTES = 5`, request codes
  `REQ_SNOOZE` and `REQ_SNOOZE_FALLBACK` (distinct for the same reason the two
  dismiss codes are: the FGS and fallback notifications can coexist, and a
  shared code would rewrite the other's target alarm id).
- `AlarmEntry` gains `snoozed: Boolean = false`, encoded in the JSON and read
  with `optBoolean` so previously persisted sets still decode.
- `AlarmController.snooze(context, id: String?)` — single source of truth,
  mirroring `dismissFired`: `stopRinging`; null/unknown id → silence only and
  never touch the set; known id → the entry becomes
  `copy(at = now + SNOOZE_MINUTES min, fired = false, snoozed = true)`, is
  persisted, and re-armed with `setAlarmClock` under its existing `reqCode`
  (the fired PendingIntent is spent, so re-creating it is safe).
- `AlarmController.scheduleAlarms` (the replace): cancel the previous set's
  PendingIntents as today, then
  `all = incoming + persisted.filter { it.snoozed && it.at > now && it.id !in incomingIds }`,
  renumber `reqCode = REQ_FIRE_BASE + index` over `all`, persist and schedule
  everything. One deterministic numbering; no collision handling.
- `AlarmReceiver`: `ACTION_ALARM_SNOOZE → AlarmController.snooze(context, id)`.
- `AlarmActivity`: snooze pill above the dismiss pill, built only when
  `firingId != null`; tap → `snooze` then `finish()`. Back stays a no-op.
- `AlarmForegroundService.buildNotification` and
  `AlarmNotifications.notifyFallbackRing`: add the Snooze action (broadcast
  PendingIntent) when the alarm id is known.
- No change to `BootReceiver` / `consumeMissedAlarms`: a snoozed entry is a
  normal future entry, so it is re-armed after reboot and reported as *missed*
  if the OS killed it before it rang.

## 4. iOS (`modules/schedularm-alarm/ios/SchedularmAlarmModule.swift`)

- Presentation:
  `AlarmPresentation.Alert(title:, stopButton:, secondaryButton: snoozeButton, secondaryButtonBehavior: .countdown)`
  — keeps the custom localized Stop label (the 4-argument init is deprecated in
  the 26.1 SDK but compiles, same status as the 2-argument init used today).
  `snoozeButton = AlarmButton(text: ring_snooze, textColor: .white, systemImageName: "zzz")`.
- Configuration: replace the `.alarm(schedule:attributes:sound:)` factory with
  `AlarmManager.AlarmConfiguration(countdownDuration: Alarm.CountdownDuration(preAlert: nil, postAlert: 300), schedule: .fixed(date), attributes:, stopIntent: nil, secondaryIntent: nil, sound: .default)`.
  Verified against the AlarmKit docs (2026-08-31): `.countdown` = "a Repeat
  action which re-triggers the alarm after the interval in `postAlert`";
  `postAlert` = "the duration applied after the alarm has alerted at least once
  and moves back to the countdown state". The community `expo-alarm-kit`
  module ships exactly this shape (alert-only presentation, no extension).
- `cancelPersisted(keepLive: Bool)`: `scheduleAlarms` passes `true` — read
  `try? AlarmManager.shared.alarms`, collect ids whose `state != .scheduled`,
  skip cancelling those and seed the new persisted id list with them.
  `dismissAll` passes `false` (cancel unconditionally). If the `alarms` getter
  throws, fall back to today's behavior (cancel all). Stale ids are harmless
  (`try? cancel`).
- **Spike (plan Task 1, 30–45 min, `postAlert` temporarily 60 s, iPhone 17
  Pro Max sim, iOS 26.5):** arm → lock → alert shows the Snooze button → tap →
  terminate the app → alert re-fires after 60 s → in between, `alarms` reports
  `.countdown` → a cold-launch re-arm keeps it. The result is recorded in the
  plan before any further iOS task runs. Apple's caveat that motivates the
  spike: "AlarmKit expects a widget extension if an app supports a countdown
  presentation. Otherwise, the system may unexpectedly dismiss alarms and fail
  to alert." — we declare no countdown *presentation*, only the behavior, and
  the spike proves whether that re-alerts.
- **Pre-agreed fallback, only if the spike fails:** `secondaryButtonBehavior:
  .custom` + a `LiveActivityIntent` (`openAppWhenRun = false`) declared in the
  module whose `perform()` calls `AlarmManager.shared.stop(id:)` and schedules
  a fresh fixed-date alarm at now + 5 min with the same attributes, appending
  its UUID to the persisted list. This never enters the countdown state, so
  the widget-extension caveat cannot apply. If App Intent discovery inside the
  pod fails on the sim, the intent file moves into the app target through the
  existing config plugin (`withSchedularmAlarm`, `withXcodeProject` +
  `addSourceFile`).

## 5. JS layer

No change. `AlarmService`, `alarmPlan`, `useArmingChain`, i18n catalogs and
storage are untouched; the native contract (`scheduleAlarms` / `dismissAll`)
keeps its signature and its replace semantics from JS's point of view.

## 6. Edge cases

- **Second alarm fires during a snooze** (two ⏰ markers < 5 min apart):
  Android's `onStartCommand` re-entry already handles overlapping rings; the
  ring surface shows the latest firing id. iOS: independent AlarmKit alarms.
- **Snooze after arrival / repeatedly:** allowed — plain snooze by decision.
- **Snooze then Disarm:** silence, nothing rings later (both platforms).
- **Snooze then reboot (Android):** the snoozed entry is a future persisted
  entry → re-armed by `BootReceiver`; if its time passed while off → missed
  notice, like any alarm. iOS: AlarmKit alarms survive reboot natively.
- **Snooze then chain edit:** the edit disarms (`disarmForEdit` → `dismissAll`)
  → snooze cleared, user re-arms deliberately. Intended.
- **Time zone change during a snooze:** entries are epoch ms; unaffected.
- **Unknown id at snooze time (redelivered null-intent restart):** silence
  only, set untouched — the same scope rule as `dismissFired`.

## 7. Testing and QA

- **Automated gate:** the native module has no Kotlin/Swift test harness
  (jest covers JS only) and JS does not change, so the gate is the existing
  jest suite + `npx tsc --noEmit` staying green, `npx expo prebuild` clean,
  and an iOS Release simulator build compiling the module with 0 warnings.
- **Manual QA matrix** (steps + results recorded in the plan, as for previous
  milestones):
  - Android (emulator or device): ring → Snooze from the activity / the
    notification action / the fallback notification → re-ring at +5 →
    Dismiss. Snooze → cold-launch the app (multi-alarm chain) → re-ring
    survives. Snooze → Disarm → silence. Snooze → reboot → re-ring.
  - iOS simulator: the spike matrix above, plus Silent switch on, plus the
    Stop button still working, plus `dismissAll` clearing a countdown alarm.

## 8. Out of scope

Chain-aware snooze cap, per-marker snooze setting, snooze for 🔔 markers, a
countdown Live Activity / widget extension, any in-app "snoozed until" state or
chip, snooze telemetry, and the store assets / release copy (follow-up task:
demo recording with presets + snooze, refreshed screenshots incl. a snooze
scene, `store-listing/release-notes/1.2.0.md`, version bump to 1.2.0 — the
resubmission notes must describe 1.2.0 as it actually is, not the
routines/recurrence/history list quoted in the 4.2 reply).
