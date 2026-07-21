# Alarm screen shows the event, not "Good morning" — design (2026-07-21)

## Problem

User complaints about the ring surfaces:

1. The title is hardcoded to `ring_greeting` ("좋은 아침!" / "Good morning!") on
   both platforms — wrong for a reverse-alarm that fires at any hour (see the
   reported iPhone lock-screen shot ringing "좋은 아침!" at 12:11).
2. The Android ring screen is morning-themed (sun emoji, sunrise gradient,
   "time to wake up") — it should read like the platform's default alarm screen.
3. The event's emoji (`EventPill.icon`) never reaches any ring surface.

## Decision

**`NativeAlarm.label` is the ring title everywhere.** The label was already
derived in JS ("{name} ends" from the nearest preceding event, or the chain
start label) and already crossed the bridge to both platforms — iOS ignored it,
Android demoted it to small secondary text.

1. **JS (`src/alarm/alarmPlan.ts`)** — the label now carries the source event's
   emoji: `"{icon} {name} ends"` (icon omitted when blank; orphan markers keep
   the plain start label). Chain rows, push titles, and the armed chip keep
   their existing formats — only the native ring label changes.
2. **iOS (`SchedularmAlarmModule.swift`)** — the AlarmKit alert is built per
   alarm; its title is the runtime label via interpolated
   `LocalizedStringResource("\(a.label)")` so the string is never parsed as a
   localization key or format string. Empty label falls back to the new
   `ring_alarm` key ("Alarm" / "알람"). `ring_greeting` is removed. Stop button
   and sky500 tint are unchanged and shared.
3. **Android**
   - `AlarmActivity` restyled like the default alarm screen: dark `#0E1116`
     background; label as the 22sp title (fallback `fallback_ring_title`);
     76sp `TextClock` that ticks by itself and honors the 12/24-hour setting
     (bare time, like the lock-screen clock); leave-home chip kept (its time now
     also honors the 12/24-hour preference); white dismiss pill kept. Sun emoji,
     greeting, and subtitle removed.
   - FGS ring notification (the heads-up surface when the phone is unlocked):
     title = label (was hardcoded "MIRI Alarm"), text and Dismiss action now
     from string resources.
   - Fallback ring notification: title = label (was a static "⏰ Alarm" title
     with the label demoted to the text row) — same convention as the FGS one.
   - `ring_greeting` / `ring_subtitle` removed; `fallback_ring_text`
     neutralized to "Tap to dismiss" / "눌러서 알람 끄기".

## Emoji verdict (asked: can the event's emoji appear on the ring screen?)

Yes, on every surface. The label crosses the Expo bridge as a plain string —
JS UTF-16 (surrogate pairs, ZWJ sequences) converts losslessly to Kotlin/Swift
strings — and all surfaces render with the system emoji font (Apple Color
Emoji / Noto Color Emoji). The iOS interpolation form passes the label through
verbatim. Tint colors never recolor emoji (fixed-color glyphs), which is fine.

## Testing

- `alarmPlan.test.ts` updated for the emoji prefix + new test covering a real
  emoji icon and a blank icon (no prefix). Full suite 282/282, `tsc` clean.
- Native changes need on-device QA (EAS dev build): Android dark ring screen
  (title, ticking clock, 12/24h, chip, dismiss), heads-up + fallback
  notification titles, iOS AlarmKit alert/Dynamic Island title with emoji.
