# App Review notes — 1.2.0 resubmission (after the 4.2 rejection of 1.0.0)

Paste into App Store Connect → version 1.2.0 → App Review Information → Notes,
and post the same text as a reply in the open App Review thread when submitting.
Attach `miri-ios-review-demo-1.2.0.mp4` (simulator capture; the physical-device
recording from the 1.0.0 review — permission prompts, ATT, AlarmKit ring — is
already in the thread and still applies). Under 4,000 characters, no placeholders.

---

Thank you for the earlier feedback on Guideline 4.2. This build (1.2.0) adds Snooze and the attached recording walks through the features a first-minute look at the app does not show.

WHAT THE APP DOES
MIRI Alarm is a reverse alarm: you enter the time you must ARRIVE somewhere plus your chain of preparation steps (sleep, shower, breakfast, commute...). The app computes every step's time backwards from the arrival time and sets real system alarms (Apple AlarmKit — hence iOS 26) at the steps you mark. Change any step or the arrival time and the whole chain recomputes. Built for airline crew and shift workers whose report time changes daily.

WHAT IS NEW IN 1.2.0
- Snooze: the AlarmKit alert now has a "Snooze 5 min" button next to the stop control; the alarm alerts again five minutes later, through Silent mode and Focus like the first ring. A pending snooze survives reopening the app; only stopping the alarm or disarming from Home cancels it.

HOW TO SEE EVERYTHING IN UNDER FIVE MINUTES (no login, no sample data needed)
1. Launch → tap "Enable" (alarm authorization) → "Continue". The example schedule is pre-filled.
2. Presets: tap the preset chip at the top (e.g. "Early pickup") → the Presets sheet lists saved routines; tap another row → "Load" swaps the whole chain and every time recomputes. "+ New preset" saves the current chain under a name; "Manage" renames or deletes. Edits on Home auto-save into the active preset.
3. Steps: tap any step to change its emoji, name or minutes; "+ Add" adds a step, an Alarm marker or a Notify marker; "Reorder" drags them.
4. Arrival: tap the amber "Arrive" row; pick the date and type the time. Inline warnings appear if every alarm would already be in the past.
5. Alarm + snooze: set the arrival so the ⏰ marker lands ~2 minutes ahead (with the example chain: arrival = now + 1 h 17 min), tap "Arm alarm", lock the device. The AlarmKit alert rings on the lock screen with "Snooze 5 min" and slide-to-stop; tap Snooze and it rings again in 5 minutes.
The attached recording shows exactly this sequence (preset switch, step edit, arm, ring, snooze, re-ring, stop).

OTHER NOTES
- Fully localized in English and Korean (follows the device language).
- Ads: a single AdMob banner on Home (ATT presented via Google UMP; EEA/UK users get the GDPR form and a persistent "Ad Privacy" option). No ad fill until the app is live, so the banner may be empty.
- Analytics/crash reporting (PostHog, Sentry — EU) are strictly opt-in, default off. All schedule data stays on the device. No accounts, purchases or user-generated content.
