import ExpoModulesCore

// iOS stub. The M0 spike is Android-only; the iOS ring path (AlarmKit) is a
// separate milestone. These no-ops keep `requireNativeModule('SchedularmAlarm')`
// resolving on iOS so shared JS doesn't crash.
public class SchedularmAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SchedularmAlarm")

    Function("scheduleAlarm") { (_ epochMs: Double) in
      // no-op (iOS ring path not implemented in M0)
    }

    Function("dismiss") {
      // no-op
    }

    Function("canScheduleExactAlarms") { () -> Bool in true }

    Function("canUseFullScreenIntent") { () -> Bool in true }

    Function("canPostNotifications") { () -> Bool in true }

    Function("getPermissionsStatus") { () -> [String: Bool] in
      [
        "canScheduleExactAlarms": true,
        "canUseFullScreenIntent": true,
        "canPostNotifications": true,
      ]
    }

    AsyncFunction("requestPermissions") { () -> [String: Bool] in
      [
        "canScheduleExactAlarms": true,
        "canUseFullScreenIntent": true,
        "canPostNotifications": true,
      ]
    }
  }
}
