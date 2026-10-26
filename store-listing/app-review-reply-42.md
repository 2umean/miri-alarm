# App Review reply — Guideline 4.2 Minimum Functionality (2026-08-21)

Paste the body below into the SAME App Review message thread in App Store Connect
(the one with the 2.1 reply). No new build and no new attachment needed — the
device video is already in the thread. Plain text, no placeholders to fill.
Body is under the 4,000-character ASC reply limit.

Notes:
- This is a "please reconsider" reply, not an appeal. Formal appeal (last
  resort, ~1–2 weeks, rarely overturns 4.2):
  https://developer.apple.com/contact/app-store/?topic=appeal
- Do NOT resubmit the same binary while the thread is open — same rejection,
  and repeated identical submissions read as spam.
- Every feature claim below is code-backed (AlarmKit module, chainRollover,
  chainValidation, chainPushAlerts, presets, marker pills, i18n en/ko).

---

Thank you for taking the time to review the app. We would like to respectfully ask App Review to reconsider the Guideline 4.2 assessment, because we believe MIRI Alarm does exactly what the guideline asks for: it enables people to do something they could not do before — plan backwards.

Every alarm app on the App Store, including the built-in Clock, asks one question: "When should I ring?" MIRI asks a different one: "When must you arrive?" The user enters the time they have to be somewhere plus their chain of preparation steps (sleep, shower, breakfast, walk to the station, bus...). The app computes the entire schedule backwards from the arrival time and arms real system alarms at exactly the steps the user marks. Change one step's duration or the arrival time, and every alarm in the chain is recomputed instantly. Today people do this with mental arithmetic every night ("board at 7:40, so leave at 7:20, so shower at 6:50, so wake at 6:30..."); no clock or mainstream alarm app performs backward chain planning. The app was built for airline crew and shift workers with irregular report times, where this calculation changes every single day.

A two-minute recording necessarily undersells what is underneath:

- Full adoption of AlarmKit, Apple's alarm framework introduced in iOS 26 (the reason the app requires iOS 26): every armed step rings as a first-class system alarm — through Silent mode and Focus, on the Lock Screen and in the Dynamic Island — not as a notification.
- Mixed marker types: each step can be a full alarm or a lightweight notification, combined freely in one chain.
- Arrival-date awareness: chains automatically roll to the correct day, and steps already in the past are skipped rather than fired incorrectly.
- Safety validation: the app refuses to arm a schedule whose alarms would all be in the past, with inline per-step warnings (visible in the recording while the tester picks times).
- Progress notifications as each step of the chain completes.
- Saved presets for recurring situations (for example, different report times or airports).
- Fully localized in English and Korean; all schedule data stays on the device; analytics are strictly opt-in and off by default.

We would be grateful for a re-evaluation against Guideline 4.2's own criterion — enabling people to do something they couldn't do before, or in a way they couldn't do it before — since backward planning from an arrival time is precisely that. If the review team still concludes the functionality is insufficient, we would sincerely appreciate specific guidance on what you would expect, and we would welcome a call with App Review. Separately, version 1.2 is already in development and adds a routines library, weekday-recurring schedules, and a schedule history view; we are happy to make that the release build if that is the better path.

Thank you for your time.
