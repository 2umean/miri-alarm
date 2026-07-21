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

  public func definition() -> ModuleDefinition {
    Name("SchedularmAlarm")

    // Arm the whole set atomically: cancel any prior alarms, then schedule one
    // AlarmKit alarm per entry and persist their UUIDs. Re-arming replaces the set.
    AsyncFunction("scheduleAlarms") { (alarms: [NativeAlarmRecord]) in
      self.cancelPersisted()

      // Stop button and tint are shared; the alert itself is per-alarm because
      // its title is that alarm's label.
      let stopButton = AlarmButton(
        text: LocalizedStringResource("ring_dismiss", table: "SchedularmAlarm"),
        textColor: .white,
        systemImageName: "alarm.fill"
      )
      let tintColor = Color(red: 0x4F / 255.0, green: 0xA8 / 255.0, blue: 0xFF / 255.0) // sky500

      var scheduled: [String] = []
      for a in alarms {
        // Interpolating keeps the runtime label out of localization-key/format-
        // string parsing — text and emoji pass through verbatim.
        let title = a.label.isEmpty
          ? LocalizedStringResource("ring_alarm", table: "SchedularmAlarm")
          : LocalizedStringResource("\(a.label)")
        let attributes = AlarmAttributes<EmptyMetadata>(
          presentation: AlarmPresentation(
            alert: AlarmPresentation.Alert(title: title, stopButton: stopButton)
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
        let configuration = AlarmManager.AlarmConfiguration.alarm(
          schedule: .fixed(Date(timeIntervalSince1970: a.at / 1000.0)),
          attributes: attributes,
          sound: .default
        )
        _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
      }
    }

    // Cancel every scheduled (or ringing) alarm and clear persistence.
    AsyncFunction("dismissAll") {
      self.cancelPersisted()
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

  /// Cancel all persisted alarm ids (current list + legacy single key) and clear them.
  private func cancelPersisted() {
    if let ids = UserDefaults.standard.array(forKey: alarmIdsKey) as? [String] {
      for s in ids where !s.isEmpty {
        if let id = UUID(uuidString: s) { try? AlarmManager.shared.cancel(id: id) }
      }
    }
    if let s = UserDefaults.standard.string(forKey: legacyAlarmIdKey), let id = UUID(uuidString: s) {
      try? AlarmManager.shared.cancel(id: id)
    }
    UserDefaults.standard.removeObject(forKey: alarmIdsKey)
    UserDefaults.standard.removeObject(forKey: legacyAlarmIdKey)
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
