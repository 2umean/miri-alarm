# Store-Review Code Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two store-review code blockers found in the 2026-07-14 audit: the Play-restricted `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission, and the missing in-app privacy policy (required by Apple 5.1.1 and Play User Data policy).

**Architecture:** Three independent slices. (1) Android battery flow: drop the restricted permission from the config plugin and swap the direct exemption dialog (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, needs the permission) for the permission-free settings list (`ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`); JS API and health model are untouched. (2) Privacy policy: bilingual static page published via GitHub Pages from an orphan `gh-pages` branch. (3) In-app link: a footer link on ChainScreen opening that URL via React Native's built-in `Linking` (no new dependency).

**Tech Stack:** Expo SDK 56 config plugin (CJS), Expo Modules Kotlin, React Native 0.85, jest + ts-jest, GitHub Pages via `gh` CLI.

**Decisions already made (user-confirmed):**
- Policy URL: `https://2umean.github.io/miri-alarm/privacy.html` (GitHub Pages, repo is public)
- Public contact: `kgulag98@gmail.com`
- Keep `SYSTEM_ALERT_WINDOW` (powers the aggressive-OEM lock-screen fallback in `AlarmForegroundService.launchFullScreenIfPermitted`)
- Keep `USE_EXACT_ALARM` + `systemExempted` FGS (verified: exempt from the Play FGS declaration; the two are coupled)

**Verification limits:** No Kotlin test harness exists — the Kotlin edit is compile-verified at the next EAS/local build and behavior-verified in on-device QA. No RN component test harness exists (jest is node-env, `.ts` only) — the ChainScreen footer is verified by `tsc` + on-device QA.

---

### Task 1: Branch

**Files:** none (git only)

- [ ] **Step 1: Create the feature branch**

```bash
cd /Users/umean/Documents/dev/agent/miri-alarm
git switch -c feat/store-compliance main
```

Expected: `Switched to a new branch 'feat/store-compliance'`

---

### Task 2: Drop `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` from the manifest (TDD)

**Files:**
- Modify: `jest.config.js` (testMatch)
- Test: `modules/schedularm-alarm/plugin/__tests__/withSchedularmAlarm.test.ts` (new)
- Modify: `modules/schedularm-alarm/plugin/withSchedularmAlarm.js:20-23`

- [ ] **Step 1: Let jest see plugin tests** — in `jest.config.js` change:

```js
  testMatch: ['**/src/**/__tests__/**/*.test.ts'],
```

to:

```js
  testMatch: ['**/src/**/__tests__/**/*.test.ts', '**/modules/**/__tests__/**/*.test.ts'],
```

- [ ] **Step 2: Write the failing regression test** — create `modules/schedularm-alarm/plugin/__tests__/withSchedularmAlarm.test.ts`:

```ts
/**
 * Regression net for the store-critical Android manifest shape. The 2026-07-14
 * store audit pinned these choices; a drive-by "fix" to any of them is a Play
 * policy regression, not a cleanup.
 */
jest.mock('@expo/config-plugins', () => ({
  // Run the plugin's action directly against a minimal manifest fixture
  // instead of Expo's mod pipeline.
  withAndroidManifest: (config: any, action: (cfg: any) => any) => action(config),
  AndroidConfig: {
    Manifest: {
      getMainApplicationOrThrow: (manifest: any) => manifest.manifest.application[0],
    },
  },
}));

// CJS on purpose — see the plugin's header comment.
const withSchedularmAlarm = require('../withSchedularmAlarm');

const runPlugin = () =>
  withSchedularmAlarm({
    modResults: { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } },
  }).modResults.manifest;

const permissionNames = (manifest: any): string[] =>
  manifest['uses-permission'].map((p: any) => p.$['android:name']);

describe('withSchedularmAlarm manifest output', () => {
  it('declares the alarm-app permission set', () => {
    expect(permissionNames(runPlugin())).toEqual(
      expect.arrayContaining([
        'android.permission.USE_EXACT_ALARM',
        'android.permission.SCHEDULE_EXACT_ALARM',
        'android.permission.USE_FULL_SCREEN_INTENT',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_SYSTEM_EXEMPTED',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.POST_NOTIFICATIONS',
      ]),
    );
  });

  it('does NOT request the Play-restricted battery-optimization exemption', () => {
    // Alarm apps are not in Play's acceptable-use table for this permission,
    // and exact alarms already bypass Doze (setAlarmClock).
    expect(permissionNames(runPlugin())).not.toContain(
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    );
  });

  it('caps SCHEDULE_EXACT_ALARM at API 32 (USE_EXACT_ALARM covers 33+)', () => {
    const entry = runPlugin()['uses-permission'].find(
      (p: any) => p.$['android:name'] === 'android.permission.SCHEDULE_EXACT_ALARM',
    );
    expect(entry.$['android:maxSdkVersion']).toBe('32');
  });

  it('keeps the ring service on the declaration-exempt systemExempted FGS type', () => {
    const service = runPlugin().application[0].service.find(
      (s: any) => s.$['android:name'] === 'expo.modules.schedularmalarm.AlarmForegroundService',
    );
    expect(service.$['android:foregroundServiceType']).toBe('systemExempted');
  });
});
```

- [ ] **Step 3: Run the test — expect exactly one failure**

Run: `npx jest modules --no-coverage`
Expected: 3 pass, 1 FAIL — "does NOT request the Play-restricted battery-optimization exemption" (the permission is still in the plugin).

- [ ] **Step 4: Remove the permission** — in `modules/schedularm-alarm/plugin/withSchedularmAlarm.js`, delete these two lines from `PERMISSIONS` (keep the `SYSTEM_ALERT_WINDOW` lines above them):

```js
  // Lets the app request the battery-optimization exemption dialog (spec §8).
  { name: 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS' },
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all suites pass, including the 4 new plugin tests.

- [ ] **Step 6: Commit**

```bash
git add jest.config.js modules/schedularm-alarm/plugin
git commit -m "fix(android): drop Play-restricted REQUEST_IGNORE_BATTERY_OPTIMIZATIONS

Alarm apps are not an acceptable use case for the direct battery-exemption
permission (Play Device & Network Abuse policy), and exact alarms already
bypass Doze. Adds a manifest-shape regression test for the audited
permission set."
```

---

### Task 3: Route the battery step to the settings list

**Files:**
- Modify: `modules/schedularm-alarm/android/src/main/java/expo/modules/schedularmalarm/SchedularmAlarmModule.kt:126-134`
- Modify: `src/alarm/AlarmService.ts:92`
- Modify: `src/i18n/en.ts` (banner.missedBody, onboarding.battery.desc)
- Modify: `src/i18n/ko.ts` (same keys)

- [ ] **Step 1: Swap the intent in Kotlin** — replace this block in `SchedularmAlarmModule.kt` (the `@SuppressLint` annotation goes away; it existed for the direct-request action):

```kotlin
  @android.annotation.SuppressLint("BatteryLife")
  private fun requestIgnoreBatteryOptimization() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
      data = Uri.parse("package:${context.packageName}")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    (appContext.currentActivity ?: context).startActivity(intent)
  }
```

with:

```kotlin
  private fun requestIgnoreBatteryOptimization() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    // Play restricts the direct-grant dialog (ACTION_REQUEST_IGNORE_BATTERY_
    // OPTIMIZATIONS + its permission) to app classes that don't include alarm
    // apps. Open the optimization LIST instead — the user picks MIRI there.
    // The list action takes no package data URI.
    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    (appContext.currentActivity ?: context).startActivity(intent)
  }
```

Note: `Uri` stays imported — `openSettings()` still uses it.

- [ ] **Step 2: Fix the stale JS-side comment** — in `src/alarm/AlarmService.ts` change:

```ts
  /** Android only: battery-optimization-exemption dialog (aggressive-OEM onboarding). */
```

to:

```ts
  /** Android only: open the battery-optimization settings list (aggressive-OEM onboarding). */
```

- [ ] **Step 3: Update the copy that described the old dialog flow.** The user now lands on a system LIST and must find MIRI in it — the strings must say so.

In `src/i18n/en.ts`:

```ts
    missedBody: 'Your phone likely stopped MIRI in the background. Tap to allow background use so this can’t happen again.',
```
→
```ts
    missedBody: 'Your phone likely stopped MIRI in the background. Tap, find MIRI in the list, and pick “Don’t optimize” so this can’t happen again.',
```

```ts
    battery: { title: 'Disable battery optimization', desc: 'Otherwise your phone kills the alarm in the background.' },
```
→
```ts
    battery: { title: 'Disable battery optimization', desc: 'Otherwise your phone kills the alarm in the background. Find MIRI in the list and pick “Don’t optimize”.' },
```

In `src/i18n/ko.ts`:

```ts
    missedBody: '휴대폰이 백그라운드에서 MIRI를 중지한 것 같아요. 눌러서 백그라운드 사용을 허용하면 재발을 막을 수 있어요.',
```
→
```ts
    missedBody: '휴대폰이 백그라운드에서 MIRI를 중지한 것 같아요. 눌러서 목록에서 MIRI를 찾아 ‘최적화 안 함’을 선택하면 재발을 막을 수 있어요.',
```

```ts
    battery: { title: '배터리 최적화 해제', desc: '해제하지 않으면 백그라운드에서 알람이 종료돼요.' },
```
→
```ts
    battery: { title: '배터리 최적화 해제', desc: '해제하지 않으면 백그라운드에서 알람이 종료돼요. 목록에서 MIRI를 찾아 ‘최적화 안 함’을 선택해 주세요.' },
```

- [ ] **Step 4: Verify types + suite**

Run: `npx tsc --noEmit && npm test`
Expected: no TS errors; all tests pass. (Kotlin compiles at the next native build — no local harness.)

- [ ] **Step 5: Commit**

```bash
git add modules/schedularm-alarm/android src/alarm/AlarmService.ts src/i18n
git commit -m "fix(android): open battery-optimization list instead of exemption dialog

ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS needs no restricted permission.
Onboarding/missed-banner copy now walks the user through the list."
```

---

### Task 4: Publish the privacy policy (GitHub Pages)

**Files (on a new orphan `gh-pages` branch, built in a temp worktree):**
- Create: `privacy.html`, `index.html`, `.nojekyll`

- [ ] **Step 1: Create the orphan branch in a throwaway worktree**

```bash
SCRATCH=/private/tmp/claude-501/-Users-umean-Documents-dev-agent-miri-alarm/457e1537-e08f-41cc-b011-97d9cb298e0e/scratchpad
git worktree add "$SCRATCH/gh-pages-wt" --detach
cd "$SCRATCH/gh-pages-wt" && git switch --orphan gh-pages
```

- [ ] **Step 2: Write `privacy.html`** (bilingual, self-contained, dark-mode aware):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MIRI Alarm — Privacy Policy</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
         max-width: 42rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; line-height: 1.65;
         color: #1c2733; background: #ffffff; }
  h1 { font-size: 1.6rem; margin-bottom: .25rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; }
  .meta { color: #5b6b7b; font-size: .9rem; }
  .lang { color: #5b6b7b; font-size: .9rem; margin: 1rem 0 2rem; }
  hr { border: none; border-top: 1px solid #d8e1ea; margin: 3rem 0; }
  @media (prefers-color-scheme: dark) {
    body { color: #e6edf3; background: #10161d; }
    .meta, .lang { color: #97a5b3; }
    hr { border-top-color: #2b3947; }
  }
</style>
</head>
<body>

<h1>MIRI Alarm — Privacy Policy</h1>
<p class="meta">Effective date: July 14, 2026</p>
<p class="lang"><a href="#ko">한국어 안내는 아래에 있습니다 ↓</a></p>

<p>MIRI Alarm (“the app”) is developed and published by Yoomin Lee (“we”, “us”), an independent developer. This policy explains what data the app handles. The short version: <strong>the app collects no data at all.</strong></p>

<h2>Data we collect</h2>
<p>None. The app has no user accounts, no analytics, no advertising, no crash reporting, and no backend server. The app makes no network requests. Nothing you enter in the app is ever transmitted to us or to anyone else.</p>

<h2>Data stored on your device</h2>
<p>Everything you create in the app — alarm schedules, arrival times, event names and emoji, saved presets, and a flag noting that you completed onboarding — is stored only on your device. We cannot see, access, or recover this data.</p>

<h2>Device backups</h2>
<p>Your device's operating system may include the app's local data in its own backups (Android Auto Backup, iOS device backup). Those backups are managed entirely by your OS vendor account settings, not by us.</p>

<h2>Permissions the app uses</h2>
<p>The app requests only the permissions needed for a reliable wake-up alarm: notifications, exact alarms, full-screen alarm display, and (on some Android devices) the “appear on top” and battery-settings screens — on iOS, alarm authorization (AlarmKit). These permissions are used solely to ring alarms you set. They do not give the app access to your personal data.</p>

<h2>Third parties</h2>
<p>We share no data with third parties, because we hold no data. The app embeds no third-party analytics, advertising, or tracking SDKs.</p>

<h2>Children</h2>
<p>The app collects no data from anyone, including children.</p>

<h2>Data retention and deletion</h2>
<p>All app data lives on your device. Deleting the app deletes all of it. To remove app data from OS-managed backups, use your device's backup settings. Since we hold no data about you, there is nothing for us to retain, and no deletion request is necessary — but you can always contact us with questions.</p>

<h2>Changes to this policy</h2>
<p>If the app's data practices ever change, we will update this page and note the new effective date above.</p>

<h2>Contact</h2>
<p>Email: <a href="mailto:kgulag98@gmail.com">kgulag98@gmail.com</a></p>

<hr id="ko">

<h1>MIRI 알람 — 개인정보 처리방침</h1>
<p class="meta">시행일: 2026년 7월 14일</p>

<p>MIRI 알람(“앱”)은 개인 개발자 이유민(“개발자”)이 개발·배포합니다. 이 문서는 앱이 다루는 데이터를 설명합니다. 요약: <strong>앱은 어떠한 데이터도 수집하지 않습니다.</strong></p>

<h2>수집하는 데이터</h2>
<p>없습니다. 앱에는 계정, 분석 도구, 광고, 오류 보고, 서버가 없으며 네트워크 요청 자체를 하지 않습니다. 앱에 입력한 내용은 개발자를 포함한 누구에게도 전송되지 않습니다.</p>

<h2>기기에 저장되는 데이터</h2>
<p>알람 일정, 도착 시각, 일정 이름과 이모지, 저장한 프리셋, 온보딩 완료 여부 등 앱에서 만든 모든 데이터는 사용자의 기기에만 저장됩니다. 개발자는 이 데이터를 보거나 접근하거나 복구할 수 없습니다.</p>

<h2>기기 백업</h2>
<p>운영체제가 자체 백업(Android 자동 백업, iOS 기기 백업)에 앱의 로컬 데이터를 포함할 수 있습니다. 이 백업은 개발자가 아닌 OS 계정 설정에서 관리됩니다.</p>

<h2>앱이 사용하는 권한</h2>
<p>앱은 확실한 기상 알람에 필요한 권한만 요청합니다: 알림, 정확한 알람, 전체 화면 알람 표시, (일부 Android 기기에서) ‘다른 앱 위에 표시’ 및 배터리 설정 화면, iOS에서는 알람 권한(AlarmKit). 이 권한들은 오직 사용자가 설정한 알람을 울리는 데에만 사용되며, 개인정보에 접근하지 않습니다.</p>

<h2>제3자 제공</h2>
<p>보유한 데이터가 없으므로 제3자에게 제공하는 데이터도 없습니다. 앱에는 제3자 분석·광고·추적 SDK가 포함되어 있지 않습니다.</p>

<h2>아동</h2>
<p>앱은 아동을 포함한 그 누구의 데이터도 수집하지 않습니다.</p>

<h2>보관 및 삭제</h2>
<p>모든 데이터는 기기에만 존재하며, 앱을 삭제하면 함께 삭제됩니다. OS 백업에서의 삭제는 기기의 백업 설정을 이용해 주세요. 개발자가 보유한 데이터가 없으므로 별도의 삭제 요청은 필요 없지만, 궁금한 점은 언제든 문의해 주세요.</p>

<h2>방침 변경</h2>
<p>앱의 데이터 처리 방식이 바뀌면 이 페이지를 갱신하고 상단의 시행일을 수정합니다.</p>

<h2>문의</h2>
<p>이메일: <a href="mailto:kgulag98@gmail.com">kgulag98@gmail.com</a></p>

</body>
</html>
```

- [ ] **Step 3: Write `index.html`** (redirect so the bare site URL isn't a 404):

```html
<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=privacy.html">
<title>MIRI Alarm</title></head>
<body><a href="privacy.html">MIRI Alarm — Privacy Policy</a></body></html>
```

- [ ] **Step 4: Write `.nojekyll`** (empty file — skip Jekyll processing).

- [ ] **Step 5: Commit and push the branch, clean up the worktree**

```bash
git add privacy.html index.html .nojekyll
git commit -m "docs(legal): publish privacy policy page (en/ko)"
git push -u origin gh-pages
cd /Users/umean/Documents/dev/agent/miri-alarm
git worktree remove "$SCRATCH/gh-pages-wt"
```

- [ ] **Step 6: Enable GitHub Pages**

```bash
gh api -X POST repos/2umean/miri-alarm/pages \
  -f "source[branch]=gh-pages" -f "source[path]=/"
```

Expected: HTTP 201 with the site JSON (`"html_url": "https://2umean.github.io/miri-alarm/"`). If it returns 409 (already enabled), update instead: `gh api -X PUT repos/2umean/miri-alarm/pages -f "source[branch]=gh-pages" -f "source[path]=/"`.

- [ ] **Step 7: Verify the page is live** (first deploy takes ~1–2 min)

```bash
curl -sI https://2umean.github.io/miri-alarm/privacy.html | head -1
```

Expected: `HTTP/2 200`. Poll `gh api repos/2umean/miri-alarm/pages/builds/latest -q .status` (→ `built`) if it 404s at first.

---

### Task 5: In-app privacy policy link

**Files:**
- Modify: `src/i18n/en.ts` (new `legal` section)
- Modify: `src/i18n/ko.ts` (mirror)
- Modify: `src/ui/screens/ChainScreen.tsx` (footer link + styles)

- [ ] **Step 1: Add the strings.** In `src/i18n/en.ts`, after the `editor` line:

```ts
  editor: { cancel: 'Cancel', set: 'Set' },
  legal: { privacyPolicy: 'Privacy Policy' },
```

In `src/i18n/ko.ts`, mirror at the same position:

```ts
  legal: { privacyPolicy: '개인정보 처리방침' },
```

(ko is typed `typeof en` — forgetting the ko key is a compile error, which is the test.)

- [ ] **Step 2: Add the footer link to ChainScreen.**

Import `Linking` (extend the existing react-native import):

```ts
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
```

Module-level constant next to `DEFAULT_NEW_PILL`:

```ts
// Also registered as the privacy-policy URL in both store consoles — the
// stores additionally require it to be reachable from INSIDE the app
// (Apple 5.1.1(i), Play User Data policy).
const PRIVACY_POLICY_URL = 'https://2umean.github.io/miri-alarm/privacy.html';
```

Unconditional last child of the `<ScrollView>` (after the arm-button block's closing `: null}`):

```tsx
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          style={styles.privacyLink}
        >
          <Text style={styles.privacyLinkText}>{t('legal.privacyPolicy')}</Text>
        </Pressable>
```

Styles (append after `armTextDisabled`):

```ts
  privacyLink: { alignSelf: 'center', marginTop: spacing.xl, padding: spacing.m },
  privacyLinkText: { color: colors.faint, fontSize: 11, fontFamily: fonts.bold },
```

- [ ] **Step 3: Verify types + suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/i18n src/ui/screens/ChainScreen.tsx
git commit -m "feat(ui): in-app privacy policy link (store requirement)

Apple 5.1.1(i) and Play User Data policy both require the policy to be
reachable from inside the app, not only from the store listing."
```

---

### Task 6: Final verification & merge

- [ ] **Step 1: Full suite one more time**

Run: `npx tsc --noEmit && npm test`
Expected: clean. Also `git status` — no stray files.

- [ ] **Step 2: Merge to main** (repo convention: merge feature branch into main)

```bash
git switch main
git merge --no-ff feat/store-compliance -m "Merge branch 'feat/store-compliance'"
```

- [ ] **Step 3: Record remaining on-device QA** (not executable here): battery step on an aggressive-OEM device lands on the optimization list and MIRI appears in it; missed-alarm banner tap ditto; privacy link opens the live page from the app; Kotlin compiles in the next EAS build.

---

## Out of scope (tracked separately)

- Store listing assets, console declarations, closed-test setup (no code).
- `docs/deployment.md` corrections (stale `specialUse`/demo-video advice, phantom OTA path) — offered to the user as a follow-up.
- `aps-environment` verification in the production archive (EAS-side check at next build).

## Self-review notes

- Spec coverage: both audit blockers with code impact (restricted permission, in-app policy) have tasks; the settings-list swap keeps the JS API (`requestBattery`/`requestDisableBatteryOptimization`) and both call sites (OnboardingScreen battery card, ChainScreen missed banner) working unchanged — verified against the current sources.
- The `banner.atRisk` / `reason.battery-not-whitelisted` tap path goes through `requestCritical`, which never touched battery — unaffected.
- Type consistency: new i18n key `legal.privacyPolicy` used exactly once in ChainScreen; ko mirrors en (compile-enforced).
- `expo-linking` deliberately NOT added (RN core `Linking` suffices for an external https URL — checked against Expo SDK 56 docs).
