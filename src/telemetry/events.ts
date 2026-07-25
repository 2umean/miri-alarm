/**
 * Telemetry event catalog. Props are primitives only — alarm labels, emoji and
 * any other user content are unrepresentable by design (spec: content never
 * leaves the device). Device model/OS are NOT props: PostHog auto-attaches
 * $device_manufacturer / $os_version via expo-device.
 */
export type TelemetryEvents = {
  chain_armed: { alarmCount: number; pillCount: number; chainDurationMin: number; usedPreset: boolean };
  alarm_missed: { count: number; maxMinutesLate: number };
  alarm_health: { reasons: string; isArmReliable: boolean; isAggressiveOEM: boolean };
  preset_applied: { presetCount: number };
  preset_saved: { presetCount: number };
  onboarding_completed: { consentGranted: boolean };
  consent_changed: { granted: boolean };
};

export type TelemetryEventName = keyof TelemetryEvents;

export type TelemetryProps = Record<string, string | number | boolean>;

/** Anything longer is suspiciously like user content, not an enum. */
const MAX_STRING_PROP_LENGTH = 64;

/** Runtime belt-and-braces behind the compile-time types: strips any value a
 * cast could sneak past TS (objects, arrays, long strings). */
export function sanitizeProps(props: Record<string, unknown>): TelemetryProps {
  const out: TelemetryProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string' && value.length <= MAX_STRING_PROP_LENGTH) out[key] = value;
  }
  return out;
}
