import AlarmKit
import ExpoModulesCore
import Foundation
import SwiftUI

// iOS reverse-alarm via AlarmKit (iOS 26). Fulfils the same JS contract as the
// Android Kotlin module so src/alarm/AlarmService.ts needs no special-casing
// beyond a platform branch. AlarmKit guarantees firing through silent mode and
// Focus, presents the system alarm UI over the lock screen, supports N alarms
// natively (one per id), and survives reboot — no foreground service, boot
// receiver, Doze, or battery handling needed.

/// AlarmKit's alarm attributes are generic over a Metadata type. We carry no
/// custom data, so this is an empty conformer (Codable/Hashable/Sendable are
/// synthesized). AlarmKit provides no built-in empty-metadata type.
struct EmptyMetadata: AlarmMetadata {}

/// One alarm from JS (NativeAlarm). `label` titles the AlarmKit alert (event
/// emoji + name, already localized by JS). `leaveAt` is accepted for contract
/// parity with Android but unused on iOS (the leave-home chip is deferred).
struct NativeAlarmRecord: Record {
  @Field var id: String = ""
  @Field var at: Double = 0
  @Field var label: String = ""
  @Field var leaveAt: Double = 0
}

public class SchedularmAlarmModule: Module {
  // Persist the scheduled alarm UUIDs so dismissAll can cancel them across launches.
  private let alarmIdsKey = "schedularm.alarm.ids"
  // Legacy single-alarm key (pre-Phase-3) — cancelled too so an upgrade can't
  // leave an orphaned alarm armed.
  private let legacyAlarmIdKey = "schedularm.alarm.id"
  /// Snooze length for every alarm: AlarmKit re-alerts this long after the
  /// secondary ("Snooze") button is tapped (countdownDuration.postAlert).
  /// Mirrors AlarmConstants.SNOOZE_MINUTES on Android — change both together.
  private static let snoozeSeconds: TimeInterval = 5 * 60

  public func definition() -> ModuleDefinition {
    Name("SchedularmAlarm")

    // Arm the whole set atomically: cancel any prior alarms, then schedule one
    // AlarmKit alarm per entry and persist their UUIDs. Re-arming replaces the set.
    AsyncFunction("scheduleAlarms") { (alarms: [NativeAlarmRecord]) in
      // Cancel the previous set EXCEPT alarms the user is interacting with right
      // now (counting down after a snooze, paused, or alerting): the launch-time
      // self-heal re-arm must never drop a pending snooze. Their ids seed the
      // persisted list so a later dismissAll (Disarm) still cancels them.
      var scheduled = self.cancelPersisted(keepLive: true)

      // Buttons and tint are shared; the alert itself is per-alarm because its
      // title is that alarm's label.
      let stopButton = AlarmButton(
        text: LocalizedStringResource("ring_dismiss", table: "SchedularmAlarm"),
        textColor: .white,
        systemImageName: "alarm.fill"
      )
      // The secondary button with `.countdown` behaviour IS AlarmKit's snooze:
      // tapping it moves the alarm back into a countdown of `postAlert`, after
      // which it alerts again. No App Intent is needed for that transition.
      let snoozeButton = AlarmButton(
        text: LocalizedStringResource("ring_snooze", table: "SchedularmAlarm"),
        textColor: .white,
        systemImageName: "zzz"
      )
      let tintColor = Color(red: 0x4F / 255.0, green: 0xA8 / 255.0, blue: 0xFF / 255.0) // sky500

      for a in alarms {
        // Interpolating keeps the runtime label out of localization-key/format-
        // string parsing — text and emoji pass through verbatim.
        let title = a.label.isEmpty
          ? LocalizedStringResource("ring_alarm", table: "SchedularmAlarm")
          : LocalizedStringResource("\(a.label)")
        let attributes = AlarmAttributes<EmptyMetadata>(
          presentation: AlarmPresentation(
            alert: AlarmPresentation.Alert(
              title: title,
              stopButton: stopButton,
              secondaryButton: snoozeButton,
              secondaryButtonBehavior: .countdown
            )
          ),
          metadata: nil,
          tintColor: tintColor
        )
        let id = UUID()
        // Persist the id BEFORE scheduling: if schedule(id:) throws mid-loop, the
        // already-scheduled alarms (and this one) stay recorded, so a later
        // dismissAll / re-arm can still cancel them — no uncancellable orphans.
        scheduled.append(id.uuidString)
        UserDefaults.standard.set(scheduled, forKey: self.alarmIdsKey)
        // No preAlert (a fixed-date alarm, not a timer); postAlert is the snooze
        // length. No countdown/paused presentation is declared, so AlarmKit shows
        // nothing during the snooze — the alert simply comes back.
        let configuration = AlarmManager.AlarmConfiguration<EmptyMetadata>(
          countdownDuration: Alarm.CountdownDuration(preAlert: nil, postAlert: Self.snoozeSeconds),
          schedule: .fixed(Date(timeIntervalSince1970: a.at / 1000.0)),
          attributes: attributes,
          stopIntent: nil,
          secondaryIntent: nil,
          sound: .default
        )
        _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
      }
    }

    // Cancel every scheduled, snoozed or ringing alarm and clear persistence (Disarm).
    AsyncFunction("dismissAll") {
      _ = self.cancelPersisted(keepLive: false)
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

  /// Cancel the persisted alarm ids (current list + legacy single key). With
  /// `keepLive`, ids whose AlarmKit state is not `.scheduled` — counting down
  /// after a snooze, paused, or alerting right now — are left alone, stay
  /// persisted, and are RETURNED so the caller can extend that list. The legacy
  /// key is always cancelled. If the daemon query fails, nothing counts as live
  /// and everything is cancelled (the pre-snooze behaviour).
  private func cancelPersisted(keepLive: Bool) -> [String] {
    let live: Set<String> = keepLive ? Self.liveAlarmIds() : []
    var kept: [String] = []
    if let ids = UserDefaults.standard.array(forKey: alarmIdsKey) as? [String] {
      for s in ids where !s.isEmpty {
        if live.contains(s) {
          kept.append(s)
          NSLog("[SchedularmAlarm] keeping live alarm %@ across re-arm", s)
        } else if let id = UUID(uuidString: s) {
          try? AlarmManager.shared.cancel(id: id)
        }
      }
    }
    if let s = UserDefaults.standard.string(forKey: legacyAlarmIdKey), let id = UUID(uuidString: s) {
      try? AlarmManager.shared.cancel(id: id)
    }
    UserDefaults.standard.removeObject(forKey: legacyAlarmIdKey)
    if kept.isEmpty {
      UserDefaults.standard.removeObject(forKey: alarmIdsKey)
    } else {
      UserDefaults.standard.set(kept, forKey: alarmIdsKey)
    }
    return kept
  }

  /// UUID strings of this app's alarms that are NOT merely scheduled (the
  /// daemon only holds this client's alarms). Empty when the query throws.
  private static func liveAlarmIds() -> Set<String> {
    let alarms = (try? AlarmManager.shared.alarms) ?? []
    return Set(alarms.filter { $0.state != .scheduled }.map { $0.id.uuidString })
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
