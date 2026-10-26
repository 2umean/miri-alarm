# App Review reply — Guideline 2.1 Information Needed (v1.0.0)

Paste this into the App Review message thread reply in App Store Connect, and also
into App Review Information → Notes. Attach the physical-device recording
`mirialarm.mp4` (2:08, verified 2026-08-20: launch → ATT → AlarmKit prompt →
analytics opt-in → step edit → arrival → arm + notification prompt → AlarmKit
ring on camera at 17:13). Device: iPhone 14 Pro, iOS 26.3.1. Body kept under the
4,000-character ASC reply limit. Ready to paste and send.

---

Thank you for the review. Responses to each item:

1. SCREEN RECORDING
Attached is a screen recording captured on a physical iPhone 14 Pro (iOS 26.3.1),
one continuous take from launch on a fresh install: the App Tracking Transparency
prompt (presented at first launch via Google's UMP consent flow), the AlarmKit
alarm-authorization prompt during onboarding, the optional analytics opt-in toggle
(default OFF; the tester opts in), renaming a preparation step, setting the
arrival date and time (the app refuses to arm while every alarm would already be
in the past — hence the inline warnings while the tester picks a time), arming the
chain (the notification-permission prompt appears at first arm), and the scheduled
alarm firing about a minute later through Apple's AlarmKit system alert — shown
over the app because the device stays unlocked while screen recording; on a locked
device the same alarm rings full-screen on the lock screen.
Notes: the UI appears in Korean (the app follows device language; English is fully
supported too). No banner ad appears because the AdMob app is not yet linked to a
live listing, so there is no ad fill; after release a single banner shows on the
main screen.
The app has no account registration or login, no paid content, purchases, or
subscriptions, and no user-generated content, so no such flows exist to record.

2. DEVICES AND OS TESTED
- iPhone 14 Pro, iOS 26.3.1 (physical device; used for the attached recording)
- iPhone 15 Pro, iOS 26.6 (physical device)
- iPhone 17 Pro / 17 Pro Max simulators, iOS 26.5 (development QA)

3. APP DESCRIPTION AND TARGET AUDIENCE
MIRI Alarm is a "reverse alarm": the user enters the time they must ARRIVE
somewhere plus their chain of preparation steps (sleep, shower, breakfast,
commute...). The app computes each step's start time backwards from the arrival
time and sets system alarms at the points the user marks. Built for airline crew
and shift workers with irregular, early report times — and anyone who thinks "I
must be there at 9:00; when do I actually have to wake up?" Alarms use Apple's
AlarmKit (why the app requires iOS 26), so they ring through Silent mode and
Focus. Free, ad-supported (a single banner), rated 4+.

4. SETUP AND ACCESS INSTRUCTIONS
No login credentials or sample files are needed — the app works immediately after
install with a pre-filled example schedule.
- Launch, tap "Enable" to grant alarm authorization, then "Continue".
- Tap the amber "Arrive" row to set the arrival date and time.
- Tap any step card to edit its emoji, name, or duration; "+ Add" adds steps;
  steps can be converted to Alarm or Notify markers.
- Tap "Arm alarm" to schedule. To see an alarm fire quickly, set the arrival time
  so an alarm lands a few minutes ahead, arm, and lock the device.

5. EXTERNAL SERVICES
- Google AdMob + User Messaging Platform (UMP): one banner ad on the main screen;
  consent-gated, ATT presented through UMP.
- Sentry (EU ingest): crash reporting only; initialized only if the user opts in
  via the in-app analytics toggle (default off).
- PostHog (EU): anonymous product analytics from a sanitized event allowlist;
  same opt-in toggle.
No authentication services, payment processors, AI services, or first-party
backend. All schedule/alarm data stays on the device and is never uploaded.

6. REGIONAL DIFFERENCES
The app functions identically in all regions. UI is localized in English and
Korean (follows device language). The only regional variation is legally
required: EEA/UK users see Google's GDPR ads-consent form and a persistent "Ad
Privacy" option, per Google UMP requirements.

7. REGULATED INDUSTRY / PROTECTED MATERIAL
Not applicable — the app is not in a regulated industry and contains no
third-party protected material. All content is original.
