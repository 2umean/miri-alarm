# iOS AlarmKit Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reverse-alarm app fire a genuinely reliable wake alarm on iOS by implementing the iOS native module against Apple's AlarmKit (iOS 26), fulfilling the existing `AlarmService` contract — reusing all RN screens, the domain engine, i18n, and theme.

**Architecture:** Approach 1 (minimal, seam-symmetric — spec `docs/superpowers/specs/2026-06-15-ios-alarmkit-design.md`). The JS seam (`AlarmService`) gains an iOS branch; a new pure `deriveIosHealth` maps AlarmKit authorization onto the existing `AlarmHealth`; `OnboardingScreen` gains a single iOS auth step; the Swift stub becomes a real AlarmKit module (auth + fixed-date schedule + cancel) with OS-localized alert strings. The safety-critical Android Kotlin path is **not touched**.

**Tech Stack:** Existing Expo SDK 56 / RN 0.85 / TS / Jest. iOS: AlarmKit (iOS 26), Expo Modules API (Swift), `expo-notifications` (already a dep, for the cross-platform companion alerts). No new JS deps.

**Device-test caveat:** the Swift/AlarmKit changes compile only in the EAS iOS build (Phase C) and are validated on a physical iPhone (iOS 26). Per-task JS verification is `npx tsc --noEmit -p tsconfig.json` + `npm test` (node), which never need a device.

**AlarmKit API note (read before Task B2):** AlarmKit is iOS 26 (WWDC 2025). The Swift in Task B2 reflects the documented API but the exact symbols must be confirmed against the Xcode 26 SDK / Apple's AlarmKit docs (https://developer.apple.com/documentation/alarmkit) — the EAS build is the compiler, exactly like the Kotlin module. Per AGENTS.md, read the versioned docs before writing the Swift.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/alarm/alarmHealth.ts` | Modify | + `'alarm-auth-denied'` reason; + pure `deriveIosHealth(state)` |
| `src/alarm/__tests__/alarmHealth.test.ts` | Modify | Tests for `deriveIosHealth` |
| `src/i18n/en.ts`, `src/i18n/ko.ts` | Modify | `reason['alarm-auth-denied']` + `onboarding.alarmAuth.{title,desc}` |
| `modules/schedularm-alarm/index.ts` | Modify | + `getAuthorizationState()` wrapper + `AuthorizationState` type |
| `src/alarm/AlarmService.ts` | Modify | iOS branch: arm/dismiss/getHealth/requestCritical/isSupported (+ best-effort notif permission) |
| `src/ui/screens/OnboardingScreen.tsx` | Modify | Single iOS auth step (platform branch) |
| `modules/schedularm-alarm/ios/SchedularmAlarmModule.swift` | Rewrite | Real AlarmKit module (auth, fixed-date schedule, cancel) |
| `modules/schedularm-alarm/ios/SchedularmAlarm.podspec` | Modify | iOS deployment min → 26.0 |
| `modules/schedularm-alarm/ios/en.lproj/Localizable.strings` | Create | `ring_greeting`, `ring_dismiss` (English/base) |
| `modules/schedularm-alarm/ios/ko.lproj/Localizable.strings` | Create | `ring_greeting`, `ring_dismiss` (Korean) |

> The Android Kotlin module, ChainScreen, editors, components, theme, format, and domain are unchanged.

---

## Phase A — Shared JS layer (TDD; tsc + jest, no device)

### Task A1: iOS health reason + `deriveIosHealth` (TDD)

**Files:**
- Modify: `src/alarm/alarmHealth.ts`
- Modify: `src/i18n/en.ts`, `src/i18n/ko.ts`
- Test: `src/alarm/__tests__/alarmHealth.test.ts`

- [ ] **Step 1: Add the catalog entries first (the `satisfies` guard will force them).**

In `src/i18n/en.ts`, add a fifth key to the `reason` block (keep the `satisfies Record<HealthReason, string>` close):
```ts
    'battery-not-whitelisted': 'Battery optimization may kill the alarm — tap to fix',
    'alarm-auth-denied': 'Alarm permission is off — turn it on so the alarm can wake you',
  } satisfies Record<HealthReason, string>,
```
In `src/i18n/ko.ts`, add the matching key to its `reason` block:
```ts
    'battery-not-whitelisted': '배터리 최적화가 알람을 종료시킬 수 있어요 — 눌러서 해결',
    'alarm-auth-denied': '알람 권한이 꺼져 있어요 — 알람이 깨울 수 있도록 허용해 주세요',
  },
```
(Caution: `en.ts`/`ko.ts` contain curly typographic characters — preserve straight ASCII delimiters; prefer adding the single line rather than rewriting the block. Verify no smart-quote corruption after editing.)

- [ ] **Step 2: Write the failing test**

In `src/alarm/__tests__/alarmHealth.test.ts`, append:
```ts
import { deriveIosHealth } from '../alarmHealth';

test('iOS authorized → reliable, no reasons, never aggressive-OEM', () => {
  const h = deriveIosHealth('authorized');
  expect(h.isArmReliable).toBe(true);
  expect(h.reasons).toEqual([]);
  expect(h.isAggressiveOEM).toBe(false);
});

test('iOS denied → not reliable, alarm-auth-denied reason', () => {
  const h = deriveIosHealth('denied');
  expect(h.isArmReliable).toBe(false);
  expect(h.reasons).toEqual(['alarm-auth-denied']);
});

test('iOS notDetermined → not reliable, alarm-auth-denied reason', () => {
  const h = deriveIosHealth('notDetermined');
  expect(h.isArmReliable).toBe(false);
  expect(h.reasons).toEqual(['alarm-auth-denied']);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- alarmHealth`
Expected: FAIL (`deriveIosHealth` is not exported).

- [ ] **Step 4: Implement.** In `src/alarm/alarmHealth.ts`:

Add `'alarm-auth-denied'` to the `HealthReason` union:
```ts
export type HealthReason =
  | 'notifications-denied'
  | 'exact-alarm-denied'
  | 'full-screen-denied'
  | 'overlay-denied'
  | 'battery-not-whitelisted'
  | 'alarm-auth-denied';
```
Add the iOS authorization type + pure mapper at the end of the file:
```ts
/** AlarmKit authorization state, surfaced by the iOS native module. */
export type IosAuthorizationState = 'authorized' | 'denied' | 'notDetermined';

/**
 * Map AlarmKit authorization onto the shared health model. iOS has no
 * Android-style gates (exact-alarm/full-screen/overlay/battery/OEM) — once
 * AlarmKit is authorized the OS guarantees the ring, so the only risk is
 * missing authorization.
 */
export function deriveIosHealth(state: IosAuthorizationState): AlarmHealth {
  const authorized = state === 'authorized';
  return {
    reasons: authorized ? [] : ['alarm-auth-denied'],
    isArmReliable: authorized,
    isAggressiveOEM: false,
  };
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test` then `npx tsc --noEmit -p tsconfig.json`
Expected: all green (the 3 new alarmHealth cases + catalog parity auto-covers `alarm-auth-denied`); tsc clean.

- [ ] **Step 6: Commit**
```bash
git add src/alarm/alarmHealth.ts src/alarm/__tests__/alarmHealth.test.ts src/i18n/en.ts src/i18n/ko.ts
git commit -m "feat(ios): alarm-auth-denied health reason + deriveIosHealth"
```

### Task A2: native `getAuthorizationState` wrapper + `AlarmService` iOS branch

**Files:**
- Modify: `modules/schedularm-alarm/index.ts`
- Modify: `src/alarm/AlarmService.ts`

- [ ] **Step 1: Add the JS wrapper for the new native function.**

In `modules/schedularm-alarm/index.ts`, add a local type + export (the underlying native function is implemented for iOS in Task B2; it is only ever called on iOS). Define the union **locally** here — do NOT import it from app `src/` (that would be a backwards module→app dependency); it is structurally identical to `IosAuthorizationState` in `alarmHealth.ts`, so TS accepts passing one to the other:
```ts
/** AlarmKit authorization state (iOS only; never called on Android). */
export type AuthorizationState = 'authorized' | 'denied' | 'notDetermined';

export function getAuthorizationState(): AuthorizationState {
  return SchedularmAlarm.getAuthorizationState();
}
```
(Place the function with the other exports. `requireNativeModule` is untyped, so this type-checks without the native side present.)

- [ ] **Step 2: Replace `src/alarm/AlarmService.ts` in full** with the platform-aware seam:
```ts
import { Platform } from 'react-native';

import * as native from '../../modules/schedularm-alarm';
import { Schedule, reverseCalc } from '../domain';
import { AlarmHealth, deriveHealth, deriveIosHealth } from './alarmHealth';
import { cancelChainAlerts, scheduleChainAlerts } from './chainAlerts';

const isAndroid = Platform.OS === 'android';
const isIos = Platform.OS === 'ios';

/** Best-effort: ensure local-notification permission so the companion
 * fall-asleep/leave-home alerts can fire on iOS. Never blocks the AlarmKit
 * wake alarm; failures are swallowed. */
function ensureIosNotificationPermission(): void {
  void (async () => {
    try {
      const Notifications = await import('expo-notifications');
      await Notifications.requestPermissionsAsync();
    } catch {
      // expo-notifications unavailable — companion alerts simply won't fire.
    }
  })();
}

/**
 * The safety-critical seam. UI and hooks talk ONLY to this object, never to the
 * native module directly. Android: bespoke Kotlin (AlarmManager.setAlarmClock +
 * full-screen Activity). iOS: AlarmKit (OS-guaranteed ring through silent/Focus).
 */
export const AlarmService = {
  isSupported: isAndroid || isIos,

  /** Arm the wake-up alarm for a schedule (fires at its derived wake instant). */
  arm(schedule: Schedule): void {
    if (!isAndroid && !isIos) return;
    const d = reverseCalc(schedule);
    native.scheduleAlarm(d.wake, d.leaveHome);
    // Companion fall-asleep/leave-home push alerts — best-effort, never allowed
    // to affect the alarm itself (fire-and-forget, errors swallowed).
    if (isIos) ensureIosNotificationPermission();
    void scheduleChainAlerts(schedule);
  },

  /** Cancel any ringing + scheduled alarm (also clears native boot re-arm on Android). */
  dismiss(): void {
    if (!isAndroid && !isIos) return;
    native.dismiss();
    void cancelChainAlerts();
  },

  /** Current health snapshot. */
  getHealth(): AlarmHealth {
    if (isIos) return deriveIosHealth(native.getAuthorizationState());
    if (isAndroid) return deriveHealth(native.getPermissionsStatus(), native.getManufacturer());
    return { reasons: [], isArmReliable: false, isAggressiveOEM: false };
  },

  /** Route the user to grant the critical permission (Android gates / iOS AlarmKit auth). */
  async requestCritical(): Promise<void> {
    if (!isAndroid && !isIos) return;
    await native.requestPermissions();
  },

  /** Android only: "Appear on top" settings (overlay → full-screen-over-lock fallback). */
  async requestOverlay(): Promise<void> {
    if (!isAndroid) return;
    await native.requestOverlayPermission();
  },

  /** Android only: battery-optimization-exemption dialog (aggressive-OEM onboarding). */
  async requestBattery(): Promise<void> {
    if (!isAndroid) return;
    await native.requestDisableBatteryOptimization();
  },
};
```
> iOS `arm` calls the same `native.scheduleAlarm(d.wake, d.leaveHome)` — the iOS module ignores `leaveEpochMs` (leave-home Live Activity deferred). The chain alerts now run on iOS too (the previously-skipped path). `requestPermissions` on iOS triggers AlarmKit `requestAuthorization` (Task B2).

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json && npm test` → clean / green (count unchanged from A1).

- [ ] **Step 4: Commit**
```bash
git add modules/schedularm-alarm/index.ts src/alarm/AlarmService.ts
git commit -m "feat(ios): AlarmService iOS branch (AlarmKit arm/dismiss/health) + chain-alerts fix"
```

### Task A3: OnboardingScreen iOS auth step

**Files:**
- Modify: `src/ui/screens/OnboardingScreen.tsx`
- Modify: `src/i18n/en.ts`, `src/i18n/ko.ts`

- [ ] **Step 1: Add the onboarding strings.**

In `src/i18n/en.ts`, inside the `onboarding` block, add (next to the other step objects like `notif`/`battery`):
```ts
    alarmAuth: { title: 'Allow alarms', desc: 'schedularm needs permission to set alarms that wake you through silent mode and Focus.' },
```
In `src/i18n/ko.ts`, the matching entry:
```ts
    alarmAuth: { title: '알람 허용', desc: '무음·집중 모드에서도 깨울 수 있도록 알람 권한이 필요해요.' },
```
(Key parity test enforces both; preserve straight ASCII delimiters.)

- [ ] **Step 2: Branch the steps in OnboardingScreen for iOS.**

In `src/ui/screens/OnboardingScreen.tsx`:
1. Add `Platform` to the existing `react-native` import:
```ts
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
```
2. Inside `OnboardingScreen`, after `const has = ...`, add:
```ts
  const isIos = Platform.OS === 'ios';
```
3. Replace the block of four `<Step .../>` elements (the notif / fullScreen / overlay / battery steps) with a platform branch — iOS renders a single AlarmKit step, Android keeps the existing four:
```tsx
      {isIos ? (
        <Step
          title={t('onboarding.alarmAuth.title')}
          desc={t('onboarding.alarmAuth.desc')}
          done={has('alarm-auth-denied')}
          onFix={async () => {
            await AlarmService.requestCritical();
            refresh();
          }}
        />
      ) : (
        <>
          <Step
            title={t('onboarding.notif.title')}
            desc={t('onboarding.notif.desc')}
            done={has('notifications-denied') && has('exact-alarm-denied')}
            onFix={async () => {
              await AlarmService.requestCritical();
              refresh();
            }}
          />
          <Step
            title={t('onboarding.fullScreen.title')}
            desc={t('onboarding.fullScreen.desc')}
            done={has('full-screen-denied')}
            onFix={async () => {
              await AlarmService.requestCritical();
              refresh();
            }}
          />
          <Step
            title={t('onboarding.overlay.title')}
            desc={t('onboarding.overlay.desc')}
            done={has('overlay-denied')}
            onFix={async () => {
              await AlarmService.requestOverlay();
              refresh();
            }}
          />
          {health.isAggressiveOEM ? (
            <Step
              title={t('onboarding.battery.title')}
              desc={t('onboarding.battery.desc')}
              done={has('battery-not-whitelisted')}
              accent="amber"
              required
              onFix={async () => {
                await AlarmService.requestBattery();
                refresh();
              }}
            />
          ) : null}
        </>
      )}
```
(The `has` helper signature already accepts any `HealthReason`; `'alarm-auth-denied'` is now in that union from Task A1. Continue/recheck and the `isArmReliable` gate stay shared and unchanged — on iOS, Continue unlocks once AlarmKit is authorized.)

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json && npm test` → clean / green.

- [ ] **Step 4: Commit**
```bash
git add src/ui/screens/OnboardingScreen.tsx src/i18n/en.ts src/i18n/ko.ts
git commit -m "feat(ios): single AlarmKit authorization step in onboarding"
```

---

## Phase B — iOS native module (Swift/AlarmKit; compile gate = EAS build)

> No local Swift compile. Verify by careful reading (imports, brace balance, symbol references); the EAS iOS build in Phase C is the compiler.

### Task B1: iOS ring-screen strings (en + ko)

**Files:**
- Create: `modules/schedularm-alarm/ios/en.lproj/Localizable.strings`
- Create: `modules/schedularm-alarm/ios/ko.lproj/Localizable.strings`

- [ ] **Step 1: Create `ios/en.lproj/Localizable.strings`:**
```
"ring_greeting" = "Good morning!";
"ring_dismiss" = "Dismiss alarm";
```

- [ ] **Step 2: Create `ios/ko.lproj/Localizable.strings`:**
```
"ring_greeting" = "좋은 아침!";
"ring_dismiss" = "알람 끄기";
```
(UTF-8; the OS resolves the file by system language, mirroring Android's `res/values{,-ko}/strings.xml`. AlarmKit's alert has a single title slot, so there is no `ring_subtitle` on iOS.)

- [ ] **Step 3: Confirm the podspec ships these.** The podspec's `source_files` covers code only; resources must be bundled. In `SchedularmAlarm.podspec`, ensure a resources line exists (added in Task B2 Step 1) — for now just create the files.

- [ ] **Step 4: Commit**
```bash
git add modules/schedularm-alarm/ios/en.lproj/Localizable.strings modules/schedularm-alarm/ios/ko.lproj/Localizable.strings
git commit -m "feat(ios): AlarmKit alert strings (en/ko)"
```

### Task B2: AlarmKit native module + podspec

**Files:**
- Modify: `modules/schedularm-alarm/ios/SchedularmAlarm.podspec`
- Rewrite: `modules/schedularm-alarm/ios/SchedularmAlarmModule.swift`

**Read first (AGENTS.md + AlarmKit note above):** confirm against https://developer.apple.com/documentation/alarmkit and Xcode 26 — the exact `AlarmConfiguration` factory (`.alarm(schedule:attributes:)` vs `AlarmConfiguration(schedule:attributes:)`), the `Alarm.Schedule.fixed` shape, and `stop(id:)` vs `cancel(id:)`. The code below reflects the documented API.

- [ ] **Step 1: Bump the podspec to iOS 26 and bundle the strings.**

In `modules/schedularm-alarm/ios/SchedularmAlarm.podspec`, set the platform min to 26.0 (AlarmKit floor; the app's deployment target is already 26.0) and add a resources line. Replace the `s.platforms` block and add resources:
```ruby
  s.platforms = {
    :ios => '26.0'
  }
```
Add after `s.source_files = ...`:
```ruby
  s.resources = "**/*.lproj/*.strings"
```
(Dropping the `:tvos` line: AlarmKit is iOS-only and the app has no tvOS target.)

- [ ] **Step 2: Replace `SchedularmAlarmModule.swift` in full:**
```swift
import AlarmKit
import ExpoModulesCore
import Foundation
import SwiftUI

// iOS reverse-alarm via AlarmKit (iOS 26). Fulfils the same JS contract as the
// Android Kotlin module so src/alarm/AlarmService.ts needs no special-casing
// beyond a platform branch. AlarmKit guarantees firing through silent mode and
// Focus, presents the system alarm UI over the lock screen, and survives reboot
// — no foreground service, boot receiver, Doze, or battery handling needed.
public class SchedularmAlarmModule: Module {
  // Persist the scheduled alarm id so dismiss() can stop it across launches.
  private let alarmIdKey = "schedularm.alarm.id"

  public func definition() -> ModuleDefinition {
    Name("SchedularmAlarm")

    // Schedule the wake alarm at an absolute instant (epoch ms). leaveEpochMs is
    // accepted for contract parity with Android but unused on iOS (leave-home
    // Live Activity deferred).
    AsyncFunction("scheduleAlarm") { (epochMs: Double, _ leaveEpochMs: Double) in
      let fireDate = Date(timeIntervalSince1970: epochMs / 1000.0)

      let alert = AlarmPresentation.Alert(
        title: LocalizedStringResource("ring_greeting"),
        stopButton: AlarmButton(
          text: LocalizedStringResource("ring_dismiss"),
          textColor: .white,
          systemImageName: "alarm.fill"
        )
      )
      let attributes = AlarmAttributes<EmptyMetadata>(
        presentation: AlarmPresentation(alert: alert),
        tintColor: Color(red: 0x4F / 255, green: 0xA8 / 255, blue: 0xFF / 255) // sky500
      )
      let id = UUID()
      let configuration = AlarmManager.AlarmConfiguration(
        schedule: .fixed(fireDate),
        attributes: attributes
      )
      _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
      UserDefaults.standard.set(id.uuidString, forKey: self.alarmIdKey)
    }

    // Stop the scheduled/ringing alarm and clear the persisted id.
    AsyncFunction("dismiss") {
      if let s = UserDefaults.standard.string(forKey: self.alarmIdKey), let id = UUID(uuidString: s) {
        try? await AlarmManager.shared.stop(id: id)
        UserDefaults.standard.removeObject(forKey: self.alarmIdKey)
      }
    }

    // AlarmKit authorization, requested lazily. Returns the resulting state.
    AsyncFunction("requestPermissions") { () -> String in
      let state = try await AlarmManager.shared.requestAuthorization()
      return Self.stateString(state)
    }

    // Current AlarmKit authorization, read by AlarmService.getHealth on iOS.
    Function("getAuthorizationState") { () -> String in
      Self.stateString(AlarmManager.shared.authorizationState)
    }

    // --- Android-only gates: iOS-safe constants so any incidental JS call resolves
    // (AlarmService never calls these on iOS). ---
    Function("canScheduleExactAlarms") { () -> Bool in true }
    Function("canUseFullScreenIntent") { () -> Bool in true }
    Function("canPostNotifications") { () -> Bool in true }
    Function("canDrawOverlays") { () -> Bool in true }
    Function("isBatteryOptimizationIgnored") { () -> Bool in true }
    Function("getManufacturer") { () -> String in "Apple" }
    Function("getPermissionsStatus") { () -> [String: Bool] in
      [
        "canScheduleExactAlarms": true,
        "canUseFullScreenIntent": true,
        "canPostNotifications": true,
        "canDrawOverlays": true,
        "isBatteryOptimizationIgnored": true,
      ]
    }
    AsyncFunction("requestOverlayPermission") { () -> [String: Bool] in [:] }
    AsyncFunction("requestDisableBatteryOptimization") { () -> [String: Bool] in [:] }
  }

  private static func stateString(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "notDetermined"
    }
  }
}
```
> `EmptyMetadata` is AlarmKit's no-custom-metadata type; if the SDK names it differently, define a trivial `struct EmptyMetadata: AlarmMetadata {}` and use it. `scheduleAlarm`/`dismiss`/`requestPermissions` are `AsyncFunction` (AlarmKit calls are `async throws`) — this matches the JS wrappers (`scheduleAlarm`/`dismiss` are sync in JS but Expo allows calling an AsyncFunction without awaiting; `requestPermissions` is already `async` in JS). `getAuthorizationState` is a sync `Function`.

- [ ] **Step 3: Re-read the whole file** — verify: `import AlarmKit`; brace/paren balance; the four `Localizable.strings` keys referenced (`ring_greeting`, `ring_dismiss`) exist from Task B1; `getAuthorizationState` matches the JS wrapper name from Task A2; the `AuthorizationState` switch is exhaustive (`@unknown default`). Confirm the JS contract names line up with `modules/schedularm-alarm/index.ts` (`scheduleAlarm`, `dismiss`, `requestPermissions`, `getAuthorizationState`).

- [ ] **Step 4: No-regression JS check** — `npx tsc --noEmit -p tsconfig.json && npm test` → clean / green (Swift isn't covered, but confirms nothing JS broke).

- [ ] **Step 5: Commit**
```bash
git add modules/schedularm-alarm/ios/SchedularmAlarm.podspec modules/schedularm-alarm/ios/SchedularmAlarmModule.swift
git commit -m "feat(ios): AlarmKit native module (auth, fixed-date schedule, stop)"
```

---

## Phase C — Gates + build + on-device acceptance

### Task C1: Full suite + typecheck gate

- [ ] **Step 1:** `npm test` → all suites green (Android 64 + the 3 new `deriveIosHealth` cases = 67; exact count may vary, nothing may FAIL).
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json` → clean.
- [ ] **Step 3:** `git status --short` → clean tree (commit any stragglers with `chore: ios alarmkit cleanup`).

### Task C2: EAS iOS build + on-device acceptance (USER + DEVICE)

- [ ] **Step 1: Build.**

Run: `eas build --profile development --platform ios`
First run sets up Apple credentials (distribution cert + provisioning profile via the paid Developer account — EAS manages interactively). The build must use an **Xcode 26 / iOS 26 SDK** image — if EAS errors that AlarmKit/iOS 26 is unavailable, that's the blocker to resolve before proceeding (check `eas build` image options / pin the image). Install the resulting build on the iPhone (iOS 26) via the QR/TestFlight.

- [ ] **Step 2: On-device acceptance (device language Korean):**
1. First launch → onboarding shows ONE step ("알람 허용") → tap Enable → grant AlarmKit authorization → Continue unlocks (gray→sky).
2. Set an arrival so the wake instant is a few minutes out; arm. **Lock the phone, switch to silent, enable a Focus mode.**
3. At the wake instant: the alarm fires through silent + Focus with the Soft Sky-tinted system alarm UI, Korean title (좋은 아침!), and a Stop button (알람 끄기); Stop dismisses it.
4. Fall-asleep / leave-home **push notifications** fire with Korean text (the chain-alerts-on-iOS fix; grant the notification prompt on first arm).
5. Disarm before the wake → the alarm does not fire.
With device language **English**: spot-check the onboarding step + alarm alert fall back to English.

- [ ] **Step 3: Record + commit.**

Append PASS/FAIL notes to `spike/RESULTS.md` under a "iOS AlarmKit acceptance" heading; commit:
```bash
git add spike/RESULTS.md && git commit -m "test: iOS AlarmKit on-device acceptance"
```

---

## Done-when

- `npm test` green (incl. `deriveIosHealth` + catalog parity for `alarm-auth-denied`); `npx tsc --noEmit` clean.
- iOS Swift module implements AlarmKit auth / fixed-date schedule / stop / `getAuthorizationState`; `AlarmService` drives iOS arm/dismiss/health and wires the companion chain alerts into the iOS path; `AlarmService` remains the only native-module caller.
- EAS iOS build succeeds; on the iPhone (iOS 26, Korean): one-step authorization, the alarm fires through silent + Focus with the localized Soft Sky alert and dismisses, push alerts fire; English falls back cleanly.
- Android behavior unchanged (the Kotlin module and Android onboarding path are untouched).

## Explicitly out of scope

Leave-home Live Activity / Dynamic Island countdown, custom (non-system) iOS ring UI, snooze, and any refactor of the Android seam into a cross-platform strategy abstraction (spec §"Out of scope").
