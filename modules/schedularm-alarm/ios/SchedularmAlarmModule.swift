import AlarmKit
import ExpoModulesCore
import Foundation
import SwiftUI

// iOS reverse-alarm via AlarmKit (iOS 26). Fulfils the same JS contract as the
// Android Kotlin module so src/alarm/AlarmService.ts needs no special-casing
// beyond a platform branch. AlarmKit guarantees firing through silent mode and
// Focus, presents the system alarm UI over the lock screen, and survives reboot
// — no foreground service, boot receiver, Doze, or battery handling needed.

/// AlarmKit's alarm attributes are generic over a Metadata type. We carry no
/// custom data, so this is an empty conformer (Codable/Hashable/Sendable are
/// synthesized). AlarmKit provides no built-in empty-metadata type.
struct EmptyMetadata: AlarmMetadata {}

public class SchedularmAlarmModule: Module {
  // Persist the scheduled alarm id so dismiss() can cancel it across launches.
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
        metadata: nil,
        tintColor: Color(red: 0x4F / 255.0, green: 0xA8 / 255.0, blue: 0xFF / 255.0) // sky500
      )
      let id = UUID()
      let configuration = AlarmManager.AlarmConfiguration.alarm(
        schedule: .fixed(fireDate),
        attributes: attributes,
        sound: .default
      )
      _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
      UserDefaults.standard.set(id.uuidString, forKey: self.alarmIdKey)
    }

    // Cancel the scheduled (or ringing) alarm and clear the persisted id.
    // cancel(id:) removes the alarm in any state and is synchronous (no await).
    AsyncFunction("dismiss") {
      if let s = UserDefaults.standard.string(forKey: self.alarmIdKey), let id = UUID(uuidString: s) {
        try? AlarmManager.shared.cancel(id: id)
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
