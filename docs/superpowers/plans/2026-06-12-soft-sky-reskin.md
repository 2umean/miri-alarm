# schedularm — Plan 3: Soft Sky Re-skin + KO/EN i18n + Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved "Soft Sky" visual identity (spec: `docs/superpowers/specs/2026-06-12-soft-sky-visual-design.md`) across the whole app — design tokens, Pretendard/Nunito typography, Korean-primary KO/EN i18n, restyled RN screens, the native ring screen, and the app icon/splash — ending in one new EAS dev build.

**Architecture:** (1) A token module `src/ui/theme.ts` and an i18n layer `src/i18n/` (pure catalogs + thin expo-localization glue) become the only sources of colors/strings; every component drops inline hexes and hardcoded copy. (2) Components are restyled in place — no structural rewrites; hooks/domain/storage untouched. (3) The native ring path gains one API change (`scheduleAlarm` carries the leave-home instant) and a Soft Sky AlarmActivity with Android-resource strings (`values/`, `values-ko/`). (4) Brand assets are generated deterministically from committed SVG masters via a sharp script.

**Tech Stack:** Existing Expo SDK 56 / RN 0.85 / TS / Jest. New deps: `expo-localization`, `expo-linear-gradient`, `expo-splash-screen` (native — one rebuild at the end), `i18n-js`, `pretendard` (font files), `@expo-google-fonts/nunito`, `sharp` (devDependency, asset generation only).

**Mockups (open in browser):** `docs/superpowers/specs/2026-06-12-soft-sky-mockups/*.html`
**Device-test caveat:** after Task A1 the JS imports native modules the current dev client doesn't contain — on-device checks happen after the Phase E build. Per-task verification is `npx tsc --noEmit -p tsconfig.json` + `npm test` (node), which never need the device.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/ui/theme.ts` | Create | Color/radius/shadow/spacing/font tokens (spec §1) |
| `src/i18n/en.ts`, `src/i18n/ko.ts` | Create | Pure string catalogs (EN fallback, KO primary) |
| `src/i18n/index.ts` | Create | i18n-js instance + device-locale detection; exports `t`, `i18n` |
| `src/i18n/__tests__/catalogs.test.ts` | Create | Key-parity + non-empty-value tests |
| `test/stubs/expo-localization.js` | Create | Jest stub so node tests never load the native module |
| `package.json` | Modify | deps + jest `moduleNameMapper` |
| `src/ui/format.ts` (+ its test) | Modify | Day labels come from the catalog |
| `App.tsx` | Modify | Font loading gate + splash hold + Soft Sky loading view |
| `src/ui/components/StatusBanner.tsx` | Rewrite | Chip-style banner, i18n |
| `src/ui/components/TimeRow.tsx` | Rewrite | Bubble rows (alarm outline / amber anchor) |
| `src/ui/components/DurationPill.tsx` | Rewrite | Floating centered pill |
| `src/ui/components/DurationEditorModal.tsx` | Rewrite | Bubble stepper, i18n buttons |
| `src/ui/screens/ChainScreen.tsx` | Rewrite | Soft Sky layout, gradient, i18n |
| `src/ui/screens/OnboardingScreen.tsx` | Rewrite | Slim-done steps, amber battery step, i18n |
| `src/alarm/chainAlerts.ts` | Modify | Notification texts via catalog |
| `modules/schedularm-alarm/android/.../AlarmConstants.kt` | Modify | + `KEY_LEAVE_AT` |
| `modules/schedularm-alarm/android/.../AlarmController.kt` | Modify | Persist + expose leave instant |
| `modules/schedularm-alarm/android/.../BootReceiver.kt` | Modify | Re-arm keeps leave instant |
| `modules/schedularm-alarm/android/.../SchedularmAlarmModule.kt` | Modify | `scheduleAlarm(wake, leave)` |
| `modules/schedularm-alarm/android/src/main/res/values{,-ko}/strings.xml` | Create | Ring-screen strings (OS-localized) |
| `modules/schedularm-alarm/android/.../AlarmActivity.kt` | Rewrite | Soft Sky ring screen |
| `modules/schedularm-alarm/index.ts` | Modify | scheduleAlarm signature |
| `src/alarm/AlarmService.ts` | Modify | arm() passes leaveHome |
| `assets/brand/logo*.svg`, `scripts/generate-brand-assets.mjs` | Create | Logo masters + deterministic PNG generation |
| `assets/*.png` | Regenerate | icon / adaptive / monochrome / splash |
| `app.config.ts` | Modify | icon, adaptiveIcon, splash plugin |

> RN `gap` style is used for chain spacing (supported since RN 0.71; we're on 0.85).

---

## Phase A — Foundations (deps, tokens, i18n, fonts)

### Task A1: Install all new dependencies

**Files:**
- Modify: `package.json` (via installers)

- [ ] **Step 1: Install Expo-managed native deps (SDK-matched)**

```bash
cd /Users/umean/Documents/dev/agent/schedularm
npx expo install expo-localization expo-linear-gradient expo-splash-screen expo-font @expo-google-fonts/nunito
```
Expected: all five added to `dependencies` at SDK-56-compatible versions. (`expo-font` may already be satisfied transitively — explicit is fine.)

- [ ] **Step 2: Install plain npm deps**

```bash
npm install i18n-js pretendard
npm install --save-dev sharp
```
Expected: `i18n-js` (v4+), `pretendard`, and dev `sharp` in package.json.

- [ ] **Step 3: Verify the Pretendard static OTFs exist**

Run: `ls node_modules/pretendard/dist/public/static/ | grep -E "Regular|SemiBold|ExtraBold|Bold" | head -8`
Expected: `Pretendard-Regular.otf`, `Pretendard-SemiBold.otf`, `Pretendard-Bold.otf`, `Pretendard-ExtraBold.otf` (among others). If the package layout differs, locate the four static `.otf` files with `find node_modules/pretendard -name "*.otf"` and use those paths in Task A5 — report the substitution.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: deps for Soft Sky (i18n, gradient, splash, fonts, sharp)"
```

### Task A2: Design tokens — `src/ui/theme.ts`

**Files:**
- Create: `src/ui/theme.ts`

- [ ] **Step 1: Implement theme.ts**

```ts
/**
 * Soft Sky design tokens (spec §1, docs/superpowers/specs/2026-06-12-soft-sky-visual-design.md).
 * The ONLY place colors/radii/shadows/fonts are defined — components must not
 * carry inline hex values.
 */

export const colors = {
  skyBg: '#F2F8FF',
  skyBgTop: '#EAF4FF',
  skyBgBottom: '#F7FBFF',
  bubble: '#FFFFFF',
  sky500: '#4FA8FF',
  sky700: '#2C7BD4',
  amber: '#FFB84C',
  ink: '#1F3349',
  ink2: '#6E84A3',
  line: '#D8E9FB',
  mintBg: '#E9F9F0',
  green: '#1E9E5C',
  blushBg: '#FFECEC',
  red: '#D64545',
  blushText: '#B36B6B',
  warnBg: '#FFF6E5',
  warnText: '#9A6B1F',
  disabledBg: '#DCE7F3',
  disabledText: '#8CA0BC',
  coral: '#FF8A7A',
  white: '#FFFFFF',
} as const;

export const radii = { bubble: 20, modal: 24, pill: 999 } as const;

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24 } as const;

/** Static font families registered in App.tsx. Use fontFamily, never fontWeight. */
export const fonts = {
  regular: 'Pretendard-Regular',
  semi: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  extra: 'Pretendard-ExtraBold',
  /** Latin clock digits only (HH:MM) — Hangul never renders in Nunito. */
  clock: 'Nunito-ExtraBold',
} as const;

/** Soft shadow recipes (iOS shadow* + Android elevation). */
export const shadows = {
  bubble: {
    shadowColor: '#285AA0',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  focus: {
    shadowColor: '#4FA8FF',
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 4,
  },
  button: {
    shadowColor: '#4FA8FF',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 5,
  },
} as const;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/theme.ts
git commit -m "feat(ui): Soft Sky design tokens"
```

### Task A3: i18n catalogs (TDD)

**Files:**
- Create: `src/i18n/en.ts`, `src/i18n/ko.ts`
- Test: `src/i18n/__tests__/catalogs.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { en } from '../en';
import { ko } from '../ko';

/** Flatten nested catalog into dotted key paths. */
const keysOf = (obj: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keysOf(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );

const valueAt = (obj: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], obj);

test('ko and en catalogs have identical key sets', () => {
  expect(keysOf(ko).sort()).toEqual(keysOf(en).sort());
});

test('every catalog value is a non-empty string (day.other excepted)', () => {
  for (const catalog of [en, ko]) {
    for (const key of keysOf(catalog)) {
      const v = valueAt(catalog, key);
      expect(typeof v).toBe('string');
      if (key !== 'day.other') expect((v as string).length).toBeGreaterThan(0);
    }
  }
});

test('parameterized keys carry the same placeholders in both locales', () => {
  const params = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort();
  for (const key of keysOf(en)) {
    expect(params(valueAt(ko, key) as string)).toEqual(params(valueAt(en, key) as string));
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- catalogs`
Expected: FAIL (cannot find module `../en`).

- [ ] **Step 3: Implement en.ts**

```ts
/** English catalog — the FALLBACK locale. ko.ts must mirror this key set exactly. */
export const en = {
  day: { 'same-day': 'today', 'prev-day': 'last night', 'next-day': 'tomorrow', other: '' },
  chain: {
    fallAsleep: 'Fall asleep',
    wakeUp: 'Wake up',
    leaveHome: 'Leave home',
    arriveBy: 'Arrive by',
    alarmBadge: 'ALARM',
    arm: 'Arm alarm ✈',
    disarm: 'Disarm',
    emptyTitle: 'When do you need to arrive?',
    emptySub: 'Tap to set — we’ll plan backwards',
    wordmark: 'SCHEDULARM ✈',
  },
  banner: {
    armed: '✓ Armed · Wake {{wake}} · Leave {{leave}}',
    ready: '🛏 Ready — set your arrival time',
    atRisk: '⚠ Your alarm may NOT ring — tap to fix',
  },
  reason: {
    'notifications-denied': 'Notifications are off — the alarm can’t alert you',
    'exact-alarm-denied': 'Exact alarms are blocked — your alarm may not fire on time',
    'full-screen-denied': 'Full-screen alarms are off — it won’t show over the lock screen',
    'overlay-denied': '“Appear on top” is off — the alarm shows as a banner, not full-screen',
    'battery-not-whitelisted': 'Battery optimization may kill the alarm — tap to fix',
  },
  issue: {
    infeasible: 'This timing is impossible — a step would take negative time.',
    'past-wake': 'The wake-up time has already passed.',
    'sleep-debt': 'Heads up: not much time left to sleep.',
    'chain-too-long': 'The total span is unrealistically long.',
    'out-of-range': 'The {{field}} duration is out of range.',
  },
  duration: { contingency: 'contingency', travel: 'travel', prep: 'prep', sleep: 'sleep' },
  timeField: { arrival: 'arrival', wake: 'wake-up', leaveHome: 'leave-home', fallAsleep: 'fall-asleep' },
  editor: { setTime: 'Set {{field}} time', cancel: 'Cancel', set: 'Set' },
  onboarding: {
    title: 'Let’s make sure your alarm can wake you',
    subtitle: 'schedularm is a safety alarm. These settings stop your phone from silently killing it.',
    oemWarning: 'Your phone’s brand is known to kill alarms — the battery step is required.',
    enable: 'Enable',
    required: 'REQUIRED',
    continueReady: 'Continue ✈',
    continueBlocked: 'Finish the required steps',
    recheck: 'Re-check ↻',
    notif: { title: 'Notifications & exact alarms', desc: 'So the alarm can fire on time and show up.' },
    fullScreen: { title: 'Show over the lock screen', desc: 'So the alarm takes over the screen, not just a banner.' },
    overlay: { title: 'Appear on top', desc: 'Forces full-screen on phones that suppress it.' },
    battery: { title: 'Disable battery optimization', desc: 'Otherwise your phone kills the alarm in the background.' },
  },
  alerts: {
    fallAsleep: { title: '🌙 Time to fall asleep', body: 'Sleep now to be rested for your {{wake}} wake-up.' },
    leaveHome: { title: '🚪 Leave home now', body: 'Leave by {{leave}} to arrive on time.' },
  },
};
// NOTE: deliberately NOT `as const` — ko.ts is typed `typeof en`, which must
// widen values to `string` (literal types would reject the Korean strings)
// while still enforcing the exact key structure at compile time.
```

- [ ] **Step 4: Implement ko.ts**

```ts
import type { en } from './en';

/** Korean catalog — the PRIMARY voice of the app. Mirrors en.ts exactly. */
export const ko: typeof en = {
  day: { 'same-day': '오늘', 'prev-day': '어젯밤', 'next-day': '내일', other: '' },
  chain: {
    fallAsleep: '잠들기',
    wakeUp: '기상',
    leaveHome: '집에서 출발',
    arriveBy: '도착',
    alarmBadge: '알람',
    arm: '알람 켜기 ✈',
    disarm: '알람 끄기',
    emptyTitle: '언제까지 도착해야 하나요?',
    emptySub: '탭해서 설정 — 거꾸로 계산해 드려요',
    wordmark: 'SCHEDULARM ✈',
  },
  banner: {
    armed: '✓ 알람 설정됨 · 기상 {{wake}} · 출발 {{leave}}',
    ready: '🛏 도착 시간을 설정해 주세요',
    atRisk: '⚠ 알람이 울리지 않을 수 있어요 — 눌러서 해결',
  },
  reason: {
    'notifications-denied': '알림이 꺼져 있어요 — 알람이 알려드릴 수 없어요',
    'exact-alarm-denied': '정확한 알람이 차단돼 있어요 — 제시간에 울리지 않을 수 있어요',
    'full-screen-denied': '전체 화면 알람이 꺼져 있어요 — 잠금 화면 위에 표시되지 않아요',
    'overlay-denied': '‘다른 앱 위에 표시’가 꺼져 있어요 — 전체 화면 대신 배너로만 표시돼요',
    'battery-not-whitelisted': '배터리 최적화가 알람을 종료시킬 수 있어요 — 눌러서 해결',
  },
  issue: {
    infeasible: '불가능한 일정이에요 — 음수 시간이 생겨요.',
    'past-wake': '기상 시간이 이미 지났어요.',
    'sleep-debt': '주의: 잘 시간이 얼마 안 남았어요.',
    'chain-too-long': '전체 일정이 비현실적으로 길어요.',
    'out-of-range': '{{field}} 시간이 허용 범위를 벗어났어요.',
  },
  duration: { contingency: '여유', travel: '이동', prep: '준비', sleep: '수면' },
  timeField: { arrival: '도착', wake: '기상', leaveHome: '출발', fallAsleep: '잠들기' },
  editor: { setTime: '{{field}} 시간 설정', cancel: '취소', set: '설정' },
  onboarding: {
    title: '알람이 꼭 울리도록 설정할게요',
    subtitle: 'schedularm은 안전 알람이에요. 휴대폰이 알람을 조용히 종료하지 못하도록 설정해 주세요.',
    oemWarning: '이 휴대폰 브랜드는 알람을 강제 종료하는 것으로 알려져 있어요 — 배터리 단계는 필수예요.',
    enable: '허용하기',
    required: '필수',
    continueReady: '계속하기 ✈',
    continueBlocked: '필수 단계를 완료해 주세요',
    recheck: '다시 확인 ↻',
    notif: { title: '알림 & 정확한 알람', desc: '알람이 제시간에 울리고 표시되도록 해요.' },
    fullScreen: { title: '잠금 화면 위에 표시', desc: '배너가 아니라 화면 전체를 깨워요.' },
    overlay: { title: '다른 앱 위에 표시', desc: '전체 화면을 막는 휴대폰에서 강제로 띄우는 보조 장치예요.' },
    battery: { title: '배터리 최적화 해제', desc: '해제하지 않으면 백그라운드에서 알람이 종료돼요.' },
  },
  alerts: {
    fallAsleep: { title: '🌙 잠들 시간이에요', body: '{{wake}} 기상을 위해 지금 주무세요.' },
    leaveHome: { title: '🚪 지금 출발하세요', body: '{{leave}}까지 출발해야 제시간에 도착해요.' },
  },
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- catalogs`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/en.ts src/i18n/ko.ts src/i18n/__tests__/catalogs.test.ts
git commit -m "feat(i18n): KO/EN catalogs with key-parity tests"
```

### Task A4: i18n runtime + day-label migration

**Files:**
- Create: `src/i18n/index.ts`, `test/stubs/expo-localization.js`
- Modify: `package.json` (jest moduleNameMapper), `src/ui/format.ts`, `src/ui/__tests__/format.test.ts`

- [ ] **Step 1: Create the jest stub**

`test/stubs/expo-localization.js`:
```js
// Node-test stand-in for the native expo-localization module.
module.exports = { getLocales: () => [{ languageCode: 'en' }] };
```

- [ ] **Step 2: Map the stub in jest config**

In `package.json`, find the existing `"jest"` block and add `moduleNameMapper` (keep all existing fields):
```json
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "moduleNameMapper": {
    "^expo-localization$": "<rootDir>/test/stubs/expo-localization.js"
  }
}
```
(If the existing block has other fields — e.g. `transform`, `testPathIgnorePatterns` — keep them and only ADD `moduleNameMapper`. If a `jest.config.js` exists instead, add the same key there.)

- [ ] **Step 3: Implement src/i18n/index.ts**

```ts
import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import { en } from './en';
import { ko } from './ko';

/**
 * Korean-primary, English-fallback, selected by device locale (no in-app
 * switcher — spec §3). Exported instance lets tests flip locale explicitly.
 */
export const i18n = new I18n({ en, ko });
i18n.defaultLocale = 'en';
i18n.enableFallback = true;
i18n.locale = getLocales()[0]?.languageCode ?? 'en';

export const t = i18n.t.bind(i18n);
```

- [ ] **Step 4: Migrate format.ts day labels to the catalog**

Replace `src/ui/format.ts` in full:
```ts
import { DateTime } from 'luxon';

import { relativeDayLabel, toLocalClock } from '../domain';
import { t } from '../i18n';

/** Minutes → "H:MM" (e.g. 480 → "8:00", 45 → "0:45"). */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

export type ClockWithDay = { clock: string; day: string };

/** Local clock + a localized relative-day label, relative to a reference instant. */
export function formatClockWithDay(
  instantMs: number,
  referenceMs: number,
  zone: string,
): ClockWithDay {
  return {
    clock: toLocalClock(instantMs, zone),
    day: t(`day.${relativeDayLabel(instantMs, referenceMs, zone)}`),
  };
}

/** Map a picked wall-clock HH:mm onto the same calendar day as `baseInstantMs`. */
export function pickedTimeToInstant(
  baseInstantMs: number,
  hour: number,
  minute: number,
  zone: string,
): number {
  return DateTime.fromMillis(baseInstantMs, { zone })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toMillis();
}
```

- [ ] **Step 5: Extend the format test with a Korean-locale case**

In `src/ui/__tests__/format.test.ts`, the existing assertions ('today', 'last night', 'tomorrow') still pass — the stub locale is `en`. APPEND this test at the end of the file:
```ts
test('day labels localize to Korean when the locale is ko', () => {
  const { i18n } = require('../../i18n');
  const prev = i18n.locale;
  i18n.locale = 'ko';
  try {
    const ref = at(6, 6, 0);
    expect(formatClockWithDay(at(6, 3, 45), ref, 'UTC').day).toBe('오늘');
    expect(formatClockWithDay(at(5, 19, 45), ref, 'UTC').day).toBe('어젯밤');
    expect(formatClockWithDay(at(7, 3, 0), ref, 'UTC').day).toBe('내일');
  } finally {
    i18n.locale = prev;
  }
});
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — all previous tests plus catalogs (3) and the new ko-day test. `npx tsc --noEmit -p tsconfig.json` clean.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/index.ts test/stubs/expo-localization.js package.json src/ui/format.ts src/ui/__tests__/format.test.ts
git commit -m "feat(i18n): runtime locale detection; day labels via catalog"
```

### Task A5: Fonts + App.tsx loading gate

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Rewrite App.tsx**

```tsx
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AlarmService } from './src/alarm/AlarmService';
import { isOnboarded, markOnboarded } from './src/storage/onboarding';
import { colors } from './src/ui/theme';
import { ChainScreen } from './src/ui/screens/ChainScreen';
import { OnboardingScreen } from './src/ui/screens/OnboardingScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

type Route = 'loading' | 'onboarding' | 'chain';

export default function App() {
  const [route, setRoute] = useState<Route>('loading');
  const [fontsLoaded] = useFonts({
    'Pretendard-Regular': require('pretendard/dist/public/static/Pretendard-Regular.otf'),
    'Pretendard-SemiBold': require('pretendard/dist/public/static/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('pretendard/dist/public/static/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('pretendard/dist/public/static/Pretendard-ExtraBold.otf'),
    'Nunito-ExtraBold': Nunito_800ExtraBold,
  });

  useEffect(() => {
    isOnboarded().then((done) => {
      // Re-show onboarding if the device still has a critical at-risk gate
      // (e.g. an OEM reset the battery exemption after a firmware update — spec §8).
      const reliable = AlarmService.getHealth().isArmReliable;
      setRoute(done && reliable ? 'chain' : 'onboarding');
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded && route !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, route]);

  if (!fontsLoaded || route === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.skyBg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.sky500} />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <>
      {route === 'onboarding' ? (
        <OnboardingScreen
          onDone={async () => {
            await markOnboarded();
            setRoute('chain');
          }}
        />
      ) : (
        <ChainScreen />
      )}
      <StatusBar style="dark" />
    </>
  );
}
```
> Note: metro bundles `.otf` from node_modules via `require()`. If Task A1 Step 3 found different OTF paths, substitute them here. StatusBar flips to `dark` (dark icons on light background).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: both clean/green.

- [ ] **Step 3: Commit**

```bash
git add App.tsx
git commit -m "feat(app): Pretendard/Nunito font gate + Soft Sky loading view"
```


---

## Phase B — Component re-skin (JS only; verify per task with tsc + suite)

> Every Phase B task ends with the same verification: `npx tsc --noEmit -p tsconfig.json` clean and `npm test` green (the suite count never drops). Visual checks happen on-device in Phase E.

### Task B1: StatusBanner → status chip

**Files:**
- Rewrite: `src/ui/components/StatusBanner.tsx`

- [ ] **Step 1: Replace the file in full**

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AlarmHealth } from '../../alarm/alarmHealth';
import { t } from '../../i18n';
import { colors, fonts, radii, shadows, spacing } from '../theme';

type Props = {
  health: AlarmHealth;
  armedSummary: { wake: string; leave: string } | null;
  onFixPress: () => void;
};

export function StatusBanner({ health, armedSummary, onFixPress }: Props) {
  const atRisk = !health.isArmReliable || health.reasons.length > 0;

  if (atRisk) {
    return (
      <Pressable onPress={onFixPress} style={styles.risk}>
        <Text style={styles.riskTitle}>{t('banner.atRisk')}</Text>
        {health.reasons.map((r) => (
          <Text key={r} style={styles.riskLine}>
            • {t(`reason.${r}`)}
          </Text>
        ))}
      </Pressable>
    );
  }

  return (
    <View style={[styles.chip, armedSummary ? styles.armed : styles.ready]}>
      <Text style={armedSummary ? styles.armedText : styles.readyText}>
        {armedSummary
          ? t('banner.armed', { wake: armedSummary.wake, leave: armedSummary.leave })
          : t('banner.ready')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radii.pill,
    paddingVertical: spacing.m - 2,
    paddingHorizontal: spacing.l,
    marginBottom: spacing.m,
  },
  armed: { backgroundColor: colors.mintBg },
  armedText: { color: colors.green, fontSize: 13, fontFamily: fonts.extra },
  ready: { backgroundColor: colors.bubble, ...shadows.bubble },
  readyText: { color: colors.ink2, fontSize: 13, fontFamily: fonts.bold },
  risk: {
    backgroundColor: colors.blushBg,
    borderRadius: radii.bubble - 4,
    padding: spacing.l - 2,
    marginBottom: spacing.m,
  },
  riskTitle: { color: colors.red, fontSize: 13, fontFamily: fonts.extra },
  riskLine: { color: colors.blushText, fontSize: 11, fontFamily: fonts.semi, marginTop: 3, lineHeight: 16 },
});
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit -p tsconfig.json && npm test` → clean/green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/StatusBanner.tsx
git commit -m "feat(ui): StatusBanner as Soft Sky status chip (i18n)"
```

### Task B2: TimeRow bubbles + DurationPill floats

**Files:**
- Rewrite: `src/ui/components/TimeRow.tsx`
- Rewrite: `src/ui/components/DurationPill.tsx`

- [ ] **Step 1: Replace TimeRow.tsx in full**

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, shadows, spacing } from '../theme';

type Props = {
  icon: string;
  label: string;
  clock: string;
  day: string;
  emphasis?: 'anchor' | 'alarm' | 'muted';
  badge?: string; // e.g. the localized ALARM chip text
  onPress?: () => void;
};

export function TimeRow({ icon, label, clock, day, emphasis = 'muted', badge, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        emphasis === 'alarm' && styles.alarmRow,
        emphasis === 'anchor' && styles.anchorRow,
      ]}
    >
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.labelCol}>
        <Text style={[styles.label, emphasis === 'anchor' && styles.anchorLabel]}>{label}</Text>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.timeCol}>
        <Text
          style={[
            styles.clock,
            emphasis === 'alarm' && styles.alarmClock,
            emphasis === 'anchor' && styles.anchorClock,
          ]}
        >
          {clock}
        </Text>
        {day ? <Text style={[styles.day, emphasis === 'anchor' && styles.anchorDay]}>{day}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bubble,
    borderRadius: radii.bubble,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l - 2,
    ...shadows.bubble,
  },
  alarmRow: { borderWidth: 2, borderColor: colors.sky500, ...shadows.focus },
  anchorRow: { backgroundColor: colors.amber },
  icon: { fontSize: 20, width: 32 },
  labelCol: { flex: 1, alignItems: 'flex-start' },
  label: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  anchorLabel: { fontFamily: fonts.extra },
  badge: {
    backgroundColor: colors.sky500,
    borderRadius: radii.pill,
    paddingVertical: 1,
    paddingHorizontal: 7,
    marginTop: 3,
  },
  badgeText: { color: colors.white, fontSize: 8, fontFamily: fonts.extra, letterSpacing: 0.5 },
  timeCol: { alignItems: 'flex-end' },
  clock: { color: colors.ink, fontSize: 17, fontFamily: fonts.clock },
  alarmClock: { color: colors.sky700, fontSize: 19 },
  anchorClock: { fontSize: 21 },
  day: { color: colors.ink2, fontSize: 10, fontFamily: fonts.semi },
  anchorDay: { color: colors.ink },
});
```

- [ ] **Step 2: Replace DurationPill.tsx in full**

```tsx
import { Pressable, StyleSheet, Text } from 'react-native';

import { formatDuration } from '../format';
import { colors, fonts, radii } from '../theme';

type Props = {
  icon: string;
  minutes: number;
  onPress: () => void;
};

export function DurationPill({ icon, minutes, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.pill}>
      <Text style={styles.text}>
        {icon} {formatDuration(minutes)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 12,
  },
  text: { color: colors.ink2, fontSize: 12, fontFamily: fonts.bold },
});
```
(The pill is now self-centered — the old `marginLeft: 32` indent is gone by design, spec §2.1.)

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json && npm test` → clean/green.

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/TimeRow.tsx src/ui/components/DurationPill.tsx
git commit -m "feat(ui): bubble TimeRow + floating DurationPill"
```

### Task B3: Editor dialogs — bubble stepper + token pass on TimeEditorModal

**Files:**
- Rewrite: `src/ui/components/DurationEditorModal.tsx`
- Modify: `src/ui/components/TimeEditorModal.tsx` (iOS card only — tokens + i18n; the Android bare-dialog branch is untouched)

- [ ] **Step 1: Replace DurationEditorModal.tsx in full**

```tsx
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../../i18n';
import { formatDuration } from '../format';
import { colors, fonts, radii, spacing } from '../theme';

const STEP = 5; // minutes

type Props = {
  visible: boolean;
  title: string;
  initialMinutes: number;
  max: number;
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
};

export function DurationEditorModal({
  visible,
  title,
  initialMinutes,
  max,
  onCancel,
  onConfirm,
}: Props) {
  const [minutes, setMinutes] = useState(initialMinutes);

  const adjust = (delta: number) =>
    setMinutes((m) => Math.min(max, Math.max(0, m + delta)));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.stepper}>
            <Pressable onPress={() => adjust(-STEP)} style={[styles.step, styles.minus]}>
              <Text style={[styles.stepText, styles.minusText]}>−</Text>
            </Pressable>
            <Text style={styles.value}>{formatDuration(minutes)}</Text>
            <Pressable onPress={() => adjust(STEP)} style={[styles.step, styles.plus]}>
              <Text style={[styles.stepText, styles.plusText]}>＋</Text>
            </Pressable>
          </View>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.ghost}>
              <Text style={styles.ghostText}>{t('editor.cancel')}</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(minutes)} style={styles.primary}>
              <Text style={styles.primaryText}>{t('editor.set')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,51,73,0.35)',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  card: { backgroundColor: colors.bubble, borderRadius: radii.modal, padding: spacing.xl },
  title: { color: colors.ink, fontSize: 16, fontFamily: fonts.extra, marginBottom: spacing.l },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  step: {
    borderRadius: radii.pill,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minus: { backgroundColor: colors.skyBgTop },
  plus: { backgroundColor: colors.sky500 },
  stepText: { fontSize: 26, fontFamily: fonts.extra },
  minusText: { color: colors.sky700 },
  plusText: { color: colors.white },
  value: { color: colors.ink, fontSize: 28, fontFamily: fonts.clock },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.m,
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  ghost: { paddingVertical: spacing.s, paddingHorizontal: spacing.s },
  ghostText: { color: colors.ink2, fontSize: 14, fontFamily: fonts.bold },
  primary: {
    backgroundColor: colors.sky500,
    borderRadius: radii.pill,
    paddingVertical: spacing.s + 2,
    paddingHorizontal: spacing.xl,
  },
  primaryText: { color: colors.white, fontSize: 14, fontFamily: fonts.extra },
});
```

- [ ] **Step 2: Token + i18n pass on TimeEditorModal's iOS card**

In `src/ui/components/TimeEditorModal.tsx` (keep the Android bare-dialog branch exactly as-is):

1. Add imports:
```ts
import { t } from '../../i18n';
import { colors, fonts, radii, spacing } from '../theme';
```
2. Replace the two button label texts in the iOS branch: `<Text style={styles.ghostText}>Cancel</Text>` → `{t('editor.cancel')}` and `<Text style={styles.primaryText}>Set</Text>` → `{t('editor.set')}`.
3. Replace the whole `StyleSheet.create` block (same keys, token values):
```ts
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(31,51,73,0.35)',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  card: { backgroundColor: colors.bubble, borderRadius: radii.modal, padding: spacing.xl },
  title: { color: colors.ink, fontSize: 16, fontFamily: fonts.extra, marginBottom: spacing.s },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.m, marginTop: spacing.m },
  btn: { borderRadius: radii.pill, paddingVertical: spacing.s + 2, paddingHorizontal: spacing.xl },
  ghost: { backgroundColor: 'transparent' },
  ghostText: { color: colors.ink2, fontSize: 14, fontFamily: fonts.bold },
  primary: { backgroundColor: colors.sky500 },
  primaryText: { color: colors.white, fontSize: 14, fontFamily: fonts.extra },
});
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p tsconfig.json && npm test` → clean/green.

- [ ] **Step 4: Commit**

```bash
git add src/ui/components/DurationEditorModal.tsx src/ui/components/TimeEditorModal.tsx
git commit -m "feat(ui): Soft Sky editor dialogs (i18n)"
```

### Task B4: ChainScreen re-skin

**Files:**
- Rewrite: `src/ui/screens/ChainScreen.tsx`

Functional logic (hooks, editor flow, arm-first ordering, picker seeding) is preserved exactly — only presentation and strings change.

- [ ] **Step 1: Replace the file in full**

```tsx
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AlarmService } from '../../alarm/AlarmService';
import { BOUNDS, resolveArrivalInstant, reverseCalc, ValidationIssue } from '../../domain';
import { useArming } from '../../hooks/useArming';
import { useSchedule } from '../../hooks/useSchedule';
import { t } from '../../i18n';
import { DurationEditorModal } from '../components/DurationEditorModal';
import { DurationPill } from '../components/DurationPill';
import { StatusBanner } from '../components/StatusBanner';
import { TimeEditorModal } from '../components/TimeEditorModal';
import { TimeRow } from '../components/TimeRow';
import { formatClockWithDay, pickedTimeToInstant } from '../format';
import { colors, fonts, radii, shadows, spacing } from '../theme';

type DurationField = 'contingency' | 'travel' | 'prep' | 'sleep';
type TimeField = 'arrival' | 'wake' | 'leaveHome' | 'fallAsleep';

const DURATION_EMOJI: Record<DurationField, string> = {
  contingency: '🛟',
  travel: '🚕',
  prep: '🚿',
  sleep: '😴',
};

const issueText = (i: ValidationIssue): string =>
  i.kind === 'out-of-range'
    ? t('issue.out-of-range', { field: t(`duration.${i.field}`) })
    : t(`issue.${i.kind}`);

export function ChainScreen() {
  const { state, zone, schedule, derived, issues, armable, nowMs, dispatch, persistPresets } =
    useSchedule();
  const { armed, health, arm, disarm, refreshHealth } = useArming();

  const [timeEditor, setTimeEditor] = useState<TimeField | null>(null);
  const [durationEditor, setDurationEditor] = useState<DurationField | null>(null);

  const ref = schedule?.arrival ?? nowMs;
  const fmt = (ms: number) => formatClockWithDay(ms, ref, zone);

  const armedSummary = (() => {
    if (armed == null) return null;
    const d = reverseCalc(armed);
    return {
      wake: formatClockWithDay(d.wake, ref, zone).clock,
      leave: formatClockWithDay(d.leaveHome, ref, zone).clock,
    };
  })();

  const onArm = async () => {
    if (!schedule || !armable) return;
    await arm(schedule);
    // Sticky-on-arm (spec §9) — but presets are a convenience; never let their write block the alarm.
    await persistPresets().catch(() => {});
  };

  const openTime = (field: TimeField) => setTimeEditor(field);

  /** Seed the picker with the field's current value so editing starts from it. */
  const timeEditorInitial = (): Date => {
    if (timeEditor === 'arrival' && schedule) return new Date(schedule.arrival);
    if (timeEditor && timeEditor !== 'arrival' && derived) {
      const base =
        timeEditor === 'wake'
          ? derived.wake
          : timeEditor === 'leaveHome'
            ? derived.leaveHome
            : derived.fallAsleep;
      return new Date(base);
    }
    return new Date();
  };

  const confirmTime = (hour: number, minute: number) => {
    if (!timeEditor) return;
    if (timeEditor === 'arrival') {
      const instant = schedule
        ? pickedTimeToInstant(schedule.arrival, hour, minute, zone)
        : resolveArrivalInstant(hour, minute, zone, nowMs);
      dispatch({ type: schedule ? 'edit-arrival' : 'set-arrival', instant, zone });
    } else if (derived) {
      const base =
        timeEditor === 'wake'
          ? derived.wake
          : timeEditor === 'leaveHome'
            ? derived.leaveHome
            : derived.fallAsleep;
      const instant = pickedTimeToInstant(base, hour, minute, zone);
      dispatch({
        type:
          timeEditor === 'wake'
            ? 'edit-wake'
            : timeEditor === 'leaveHome'
              ? 'edit-leave-home'
              : 'edit-fall-asleep',
        instant,
      });
    }
    setTimeEditor(null);
  };

  const confirmDuration = (minutes: number) => {
    if (!durationEditor) return;
    dispatch({ type: 'set-duration', field: durationEditor, minutes });
    setDurationEditor(null);
  };

  return (
    <LinearGradient colors={[colors.skyBgTop, colors.skyBgBottom]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.wordmark}>{t('chain.wordmark')}</Text>

        <StatusBanner
          health={health}
          armedSummary={armedSummary}
          onFixPress={async () => {
            await AlarmService.requestCritical();
            refreshHealth();
          }}
        />

        {issues.map((i, idx) => (
          <Text key={idx} style={styles.issue}>
            ⚠ {issueText(i)}
          </Text>
        ))}

        {schedule && derived ? (
          <View style={styles.chain}>
            <TimeRow
              icon="🌙"
              label={t('chain.fallAsleep')}
              {...fmt(derived.fallAsleep)}
              onPress={() => openTime('fallAsleep')}
            />
            <DurationPill icon="😴" minutes={state.sleep} onPress={() => setDurationEditor('sleep')} />

            <TimeRow
              icon="⏰"
              label={t('chain.wakeUp')}
              badge={t('chain.alarmBadge')}
              emphasis="alarm"
              {...fmt(derived.wake)}
              onPress={() => openTime('wake')}
            />
            <DurationPill icon="🚿" minutes={state.prep} onPress={() => setDurationEditor('prep')} />

            <TimeRow
              icon="🚪"
              label={t('chain.leaveHome')}
              {...fmt(derived.leaveHome)}
              onPress={() => openTime('leaveHome')}
            />
            <View style={styles.pillRow}>
              <DurationPill icon="🚕" minutes={state.travel} onPress={() => setDurationEditor('travel')} />
              <DurationPill
                icon="🛟"
                minutes={state.contingency}
                onPress={() => setDurationEditor('contingency')}
              />
            </View>

            <TimeRow
              icon="📍"
              label={t('chain.arriveBy')}
              emphasis="anchor"
              {...fmt(derived.arrival)}
              onPress={() => openTime('arrival')}
            />
          </View>
        ) : (
          <Pressable style={styles.empty} onPress={() => openTime('arrival')}>
            <Text style={styles.emptyIcon}>🛬</Text>
            <Text style={styles.emptyTitle}>{t('chain.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('chain.emptySub')}</Text>
          </Pressable>
        )}

        {schedule ? (
          <Pressable
            onPress={armed ? disarm : onArm}
            disabled={!armed && !armable}
            style={styles.armWrap}
          >
            {armed ? (
              <View style={[styles.armInner, styles.disarm]}>
                <Text style={styles.armText}>{t('chain.disarm')}</Text>
              </View>
            ) : armable ? (
              <LinearGradient
                colors={[colors.sky500, colors.sky700]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.armInner}
              >
                <Text style={styles.armText}>{t('chain.arm')}</Text>
              </LinearGradient>
            ) : (
              <View style={[styles.armInner, styles.armDisabled]}>
                <Text style={[styles.armText, styles.armTextDisabled]}>{t('chain.arm')}</Text>
              </View>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      {timeEditor ? (
        <TimeEditorModal
          visible
          title={t('editor.setTime', { field: t(`timeField.${timeEditor}`) })}
          initial={timeEditorInitial()}
          onCancel={() => setTimeEditor(null)}
          onConfirm={confirmTime}
        />
      ) : null}

      {durationEditor ? (
        <DurationEditorModal
          visible
          title={`${DURATION_EMOJI[durationEditor]} ${t(`duration.${durationEditor}`)}`}
          initialMinutes={state[durationEditor]}
          max={BOUNDS[durationEditor][1]}
          onCancel={() => setDurationEditor(null)}
          onConfirm={confirmDuration}
        />
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: spacing.xl, paddingTop: 56 },
  wordmark: {
    color: colors.ink2,
    fontSize: 11,
    fontFamily: fonts.extra,
    letterSpacing: 1.5,
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  issue: {
    backgroundColor: colors.warnBg,
    color: colors.warnText,
    fontSize: 12,
    fontFamily: fonts.bold,
    borderRadius: radii.bubble - 4,
    paddingVertical: spacing.s + 1,
    paddingHorizontal: spacing.l - 2,
    marginBottom: spacing.s - 2,
    overflow: 'hidden',
  },
  chain: { gap: spacing.xs + 2 },
  pillRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.s },
  empty: {
    borderWidth: 2,
    borderColor: '#A9CFF5',
    borderStyle: 'dashed',
    borderRadius: radii.bubble,
    padding: spacing.xxl + 8,
    alignItems: 'center',
    backgroundColor: colors.skyBgBottom,
  },
  emptyIcon: { fontSize: 30 },
  emptyTitle: { color: colors.sky700, fontSize: 15, fontFamily: fonts.extra, marginTop: spacing.s },
  emptySub: { color: colors.ink2, fontSize: 11, fontFamily: fonts.semi, marginTop: 3 },
  armWrap: { marginTop: spacing.xxl, ...shadows.button },
  armInner: {
    borderRadius: radii.pill,
    paddingVertical: spacing.l + 1,
    alignItems: 'center',
  },
  disarm: { backgroundColor: colors.coral },
  armDisabled: { backgroundColor: colors.disabledBg },
  armText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
  armTextDisabled: { color: colors.disabledText },
});
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit -p tsconfig.json && npm test` → clean/green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/ChainScreen.tsx
git commit -m "feat(ui): Soft Sky ChainScreen (gradient, bubbles, KO/EN)"
```

### Task B5: OnboardingScreen re-skin

**Files:**
- Rewrite: `src/ui/screens/OnboardingScreen.tsx`

- [ ] **Step 1: Replace the file in full**

```tsx
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AlarmService } from '../../alarm/AlarmService';
import { AlarmHealth } from '../../alarm/alarmHealth';
import { t } from '../../i18n';
import { colors, fonts, radii, shadows, spacing } from '../theme';

type Props = { onDone: () => void };

type StepProps = {
  title: string;
  desc: string;
  done: boolean;
  /** 'amber' marks the OEM-required battery step; others use sky. */
  accent?: 'sky' | 'amber';
  required?: boolean;
  onFix: () => void;
};

function Step({ title, desc, done, accent = 'sky', required = false, onFix }: StepProps) {
  if (done) {
    return (
      <View style={[styles.step, styles.stepDone]}>
        <Text style={styles.stepDoneTitle}>✓ {title}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.step, accent === 'amber' ? styles.stepAmber : styles.stepSky]}>
      <View style={styles.stepTitleRow}>
        <Text style={styles.stepTitle}>○ {title}</Text>
        {required ? (
          <View style={styles.requiredChip}>
            <Text style={styles.requiredText}>{t('onboarding.required')}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.stepDesc}>{desc}</Text>
      <Pressable onPress={onFix} style={[styles.fix, accent === 'amber' && styles.fixAmber]}>
        <Text style={[styles.fixText, accent === 'amber' && styles.fixTextAmber]}>
          {t('onboarding.enable')}
        </Text>
      </Pressable>
    </View>
  );
}

export function OnboardingScreen({ onDone }: Props) {
  const [health, setHealth] = useState<AlarmHealth>(() => AlarmService.getHealth());
  const refresh = () => setHealth(AlarmService.getHealth());

  const has = (r: AlarmHealth['reasons'][number]) => !health.reasons.includes(r);

  return (
    <ScrollView style={styles.screenWrap} contentContainerStyle={styles.screen}>
      <Text style={styles.hero}>🛫</Text>
      <Text style={styles.title}>{t('onboarding.title')}</Text>
      <Text style={styles.subtitle}>
        {t('onboarding.subtitle')}
        {health.isAggressiveOEM ? ` ${t('onboarding.oemWarning')}` : ''}
      </Text>

      <Step
        title={t('onboarding.notif.title')}
        desc={t('onboarding.notif.desc')}
        done={has('notifications-denied') && has('exact-alarm-denied')}
        onFix={async () => {
          await AlarmService.requestCritical();
          refresh();
        }}
      />
      <Step
        title={t('onboarding.fullScreen.title')}
        desc={t('onboarding.fullScreen.desc')}
        done={has('full-screen-denied')}
        onFix={async () => {
          await AlarmService.requestCritical();
          refresh();
        }}
      />
      <Step
        title={t('onboarding.overlay.title')}
        desc={t('onboarding.overlay.desc')}
        done={has('overlay-denied')}
        onFix={async () => {
          await AlarmService.requestOverlay();
          refresh();
        }}
      />
      {health.isAggressiveOEM ? (
        <Step
          title={t('onboarding.battery.title')}
          desc={t('onboarding.battery.desc')}
          done={has('battery-not-whitelisted')}
          accent="amber"
          required
          onFix={async () => {
            await AlarmService.requestBattery();
            refresh();
          }}
        />
      ) : null}

      <Pressable
        onPress={onDone}
        disabled={!health.isArmReliable}
        style={[styles.continue, health.isArmReliable ? styles.continueOn : styles.continueOff]}
      >
        <Text
          style={[
            styles.continueText,
            health.isArmReliable ? styles.continueTextOn : styles.continueTextOff,
          ]}
        >
          {health.isArmReliable ? t('onboarding.continueReady') : t('onboarding.continueBlocked')}
        </Text>
      </Pressable>
      <Pressable onPress={refresh}>
        <Text style={styles.recheck}>{t('onboarding.recheck')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenWrap: { flex: 1, backgroundColor: colors.skyBg },
  screen: { padding: spacing.xxl, paddingTop: 64, gap: spacing.s },
  hero: { fontSize: 34 },
  title: { color: colors.ink, fontSize: 21, fontFamily: fonts.extra, lineHeight: 28 },
  subtitle: {
    color: colors.ink2,
    fontSize: 12,
    fontFamily: fonts.semi,
    lineHeight: 18,
    marginBottom: spacing.s,
  },
  step: {
    backgroundColor: colors.bubble,
    borderRadius: radii.bubble - 2,
    padding: spacing.l - 2,
    ...shadows.bubble,
  },
  stepDone: { paddingVertical: spacing.m - 2 },
  stepDoneTitle: { color: colors.green, fontSize: 13, fontFamily: fonts.extra },
  stepSky: { borderWidth: 2, borderColor: colors.sky500 },
  stepAmber: { borderWidth: 2, borderColor: colors.amber },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  stepTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.extra },
  requiredChip: {
    backgroundColor: colors.warnBg,
    borderRadius: radii.pill,
    paddingVertical: 1,
    paddingHorizontal: 7,
  },
  requiredText: { color: colors.warnText, fontSize: 9, fontFamily: fonts.extra },
  stepDesc: { color: colors.ink2, fontSize: 12, fontFamily: fonts.semi, lineHeight: 17, marginTop: 3 },
  fix: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sky500,
    borderRadius: radii.pill,
    paddingVertical: spacing.s - 1,
    paddingHorizontal: spacing.xl - 2,
    marginTop: spacing.s + 1,
  },
  fixAmber: { backgroundColor: colors.amber },
  fixText: { color: colors.white, fontSize: 12, fontFamily: fonts.extra },
  fixTextAmber: { color: colors.ink },
  continue: {
    borderRadius: radii.pill,
    paddingVertical: spacing.l + 1,
    alignItems: 'center',
    marginTop: spacing.l,
  },
  continueOn: { backgroundColor: colors.sky500, ...shadows.button },
  continueOff: { backgroundColor: colors.disabledBg },
  continueText: { fontSize: 15, fontFamily: fonts.extra },
  continueTextOn: { color: colors.white },
  continueTextOff: { color: colors.disabledText },
  recheck: { color: colors.sky500, textAlign: 'center', padding: spacing.m, fontSize: 12, fontFamily: fonts.bold },
});
```
> Note: `Step` is now a module-level component (not recreated per render — fixes the inline-component nit from Plan 2 review). Continue uses solid `sky500` (the gradient version needs LinearGradient inside a Pressable; solid keeps onboarding simple — deliberate simplification, the mockup's gradient is reserved for ChainScreen's arm button).

- [ ] **Step 2: Verify** — `npx tsc --noEmit -p tsconfig.json && npm test` → clean/green.

- [ ] **Step 3: Commit**

```bash
git add src/ui/screens/OnboardingScreen.tsx
git commit -m "feat(ui): Soft Sky onboarding (slim done-steps, amber battery, KO/EN)"
```

### Task B6: chainAlerts notification texts via catalog

**Files:**
- Modify: `src/alarm/chainAlerts.ts`

- [ ] **Step 1: Replace the `alerts` array construction**

In `src/alarm/chainAlerts.ts`, add the import at the top with the other imports:
```ts
import { t } from '../i18n';
```
Then replace the existing `const alerts = [ ... ];` block (the two hardcoded English objects) with:
```ts
    const alerts = [
      {
        at: d.fallAsleep,
        title: t('alerts.fallAsleep.title'),
        body: t('alerts.fallAsleep.body', { wake: toLocalClock(d.wake, schedule.zone) }),
      },
      {
        at: d.leaveHome,
        title: t('alerts.leaveHome.title'),
        body: t('alerts.leaveHome.body', { leave: toLocalClock(d.leaveHome, schedule.zone) }),
      },
    ];
```
Everything else in the file stays as-is.

- [ ] **Step 2: Verify** — `npx tsc --noEmit -p tsconfig.json && npm test` → clean/green.

- [ ] **Step 3: Commit**

```bash
git add src/alarm/chainAlerts.ts
git commit -m "feat(alerts): localized push-alert texts"
```


---

## Phase C — Native ring screen (Kotlin; compile gate = Phase E build)

> No local Kotlin compile exists. Implementers must verify by careful reading (imports, brace balance, resource references); the EAS build in Task E2 is the compiler.

### Task C1: Ring-screen string resources (EN + KO)

**Files:**
- Create: `modules/schedularm-alarm/android/src/main/res/values/strings.xml`
- Create: `modules/schedularm-alarm/android/src/main/res/values-ko/strings.xml`

- [ ] **Step 1: Create values/strings.xml (English default)**

```xml
<resources>
    <string name="ring_greeting">Good morning!</string>
    <string name="ring_subtitle">Time to wake up</string>
    <string name="ring_leave_chip">🚪 %2$d min until %1$s departure</string>
    <string name="ring_dismiss">Dismiss alarm</string>
</resources>
```

- [ ] **Step 2: Create values-ko/strings.xml**

```xml
<resources>
    <string name="ring_greeting">좋은 아침!</string>
    <string name="ring_subtitle">이제 일어날 시간이에요</string>
    <string name="ring_leave_chip">🚪 %1$s 출발까지 %2$d분</string>
    <string name="ring_dismiss">알람 끄기</string>
</resources>
```
(Positional args: `%1$s` = leave clock "07:15", `%2$d` = minutes remaining. The OS picks the file by system language — no JS involvement.)

- [ ] **Step 3: Commit**

```bash
git add modules/schedularm-alarm/android/src/main/res
git commit -m "feat(alarm-native): ring-screen strings (en/ko)"
```

### Task C2: Carry the leave-home instant through the native pipeline

**Files:**
- Modify: `modules/schedularm-alarm/android/src/main/java/expo/modules/schedularmalarm/AlarmConstants.kt`
- Modify: `modules/schedularm-alarm/android/src/main/java/expo/modules/schedularmalarm/AlarmController.kt`
- Modify: `modules/schedularm-alarm/android/src/main/java/expo/modules/schedularmalarm/BootReceiver.kt`
- Modify: `modules/schedularm-alarm/android/src/main/java/expo/modules/schedularmalarm/SchedularmAlarmModule.kt`
- Modify: `modules/schedularm-alarm/index.ts`
- Modify: `src/alarm/AlarmService.ts`

- [ ] **Step 1: AlarmConstants — add the key**

After the existing `const val KEY_ALARM_AT = "alarm_at_epoch_ms"` line add:
```kotlin
  const val KEY_LEAVE_AT = "leave_at_epoch_ms"
```

- [ ] **Step 2: AlarmController — persist and expose the leave instant**

Replace the `scheduleAlarm`, `persistedAlarmAt`, `persist`, and `clear` functions with (the rest of the file is untouched):
```kotlin
  /** Arm the exact, Doze-exempt alarm and persist it (with the leave-home instant) for boot re-arm. */
  fun scheduleAlarm(context: Context, epochMs: Long, leaveEpochMs: Long) {
    persist(context, epochMs, leaveEpochMs)
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val info = AlarmManager.AlarmClockInfo(epochMs, showPendingIntent(context))
    // setAlarmClock is the only API that is BOTH exact AND Doze-exempt.
    alarmManager.setAlarmClock(info, firePendingIntent(context))
  }

  fun persistedAlarmAt(context: Context): Long =
    prefs(context).getLong(AlarmConstants.KEY_ALARM_AT, 0L)

  /** Leave-home instant for the ring screen's countdown chip (0 = unknown). */
  fun persistedLeaveAt(context: Context): Long =
    prefs(context).getLong(AlarmConstants.KEY_LEAVE_AT, 0L)

  private fun persist(context: Context, epochMs: Long, leaveEpochMs: Long) =
    prefs(context).edit()
      .putLong(AlarmConstants.KEY_ALARM_AT, epochMs)
      .putLong(AlarmConstants.KEY_LEAVE_AT, leaveEpochMs)
      .apply()

  private fun clear(context: Context) =
    prefs(context).edit()
      .remove(AlarmConstants.KEY_ALARM_AT)
      .remove(AlarmConstants.KEY_LEAVE_AT)
      .apply()
```

- [ ] **Step 3: BootReceiver — re-arm with the persisted leave instant**

In `reArm`, replace the line `AlarmController.scheduleAlarm(context, epochMs)` with:
```kotlin
      AlarmController.scheduleAlarm(context, epochMs, AlarmController.persistedLeaveAt(context))
```

- [ ] **Step 4: SchedularmAlarmModule — widen the JS-facing function**

Replace the existing `Function("scheduleAlarm") { epochMs: Double -> ... }` registration with:
```kotlin
    Function("scheduleAlarm") { epochMs: Double, leaveEpochMs: Double ->
      AlarmController.scheduleAlarm(context, epochMs.toLong(), leaveEpochMs.toLong())
    }
```

- [ ] **Step 5: index.ts — widen the wrapper**

Replace the existing `scheduleAlarm` export in `modules/schedularm-alarm/index.ts` with:
```ts
/**
 * Arm the single active alarm to fire at an absolute instant (epoch ms).
 * Persists for boot re-arm and uses AlarmManager.setAlarmClock (exact + Doze-exempt).
 * `leaveEpochMs` rides along so the ring screen can show the leave-home countdown.
 */
export function scheduleAlarm(epochMs: number, leaveEpochMs: number): void {
  SchedularmAlarm.scheduleAlarm(epochMs, leaveEpochMs);
}
```

- [ ] **Step 6: AlarmService.arm — pass both instants**

In `src/alarm/AlarmService.ts`, replace the `arm` method body:
```ts
  /** Arm the wake-up alarm for a schedule (fires at its derived wake instant). */
  arm(schedule: Schedule): void {
    if (!isAndroid) return;
    const d = reverseCalc(schedule);
    native.scheduleAlarm(d.wake, d.leaveHome);
    // Companion fall-asleep/leave-home push alerts — best-effort, never
    // allowed to affect the alarm itself (fire-and-forget, errors swallowed).
    void scheduleChainAlerts(schedule);
  },
```

- [ ] **Step 7: Verify** — `npx tsc --noEmit -p tsconfig.json && npm test` → clean/green. Re-read all four Kotlin files top-to-bottom for syntax balance.

- [ ] **Step 8: Commit**

```bash
git add modules/schedularm-alarm/android modules/schedularm-alarm/index.ts src/alarm/AlarmService.ts
git commit -m "feat(alarm-native): leave-home instant rides with the alarm"
```

### Task C3: Soft Sky AlarmActivity

**Files:**
- Rewrite: `modules/schedularm-alarm/android/src/main/java/expo/modules/schedularmalarm/AlarmActivity.kt`

- [ ] **Step 1: Replace the file in full**

```kotlin
package expo.modules.schedularmalarm

import android.app.Activity
import android.app.KeyguardManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Full-screen, must-dismiss alarm UI shown over the lock screen ("Soft Sky":
 * night-to-sunrise gradient — spec 2026-06-12-soft-sky-visual-design §2.4).
 * Layout is built in code so the module needs no bundled drawable/layout assets;
 * strings come from res/values{,-ko}/strings.xml so the OS localizes them.
 */
class AlarmActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    setContentView(buildView())
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      (getSystemService(KEYGUARD_SERVICE) as KeyguardManager)
        .requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun buildView(): LinearLayout {
    val match = ViewGroup.LayoutParams.MATCH_PARENT
    val clockFmt = SimpleDateFormat("HH:mm", Locale.getDefault())

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      layoutParams = ViewGroup.LayoutParams(match, match)
      setPadding(48, 160, 48, 64)
      background = GradientDrawable(
        GradientDrawable.Orientation.TL_BR,
        intArrayOf(0xFF2C7BD4.toInt(), 0xFF4FA8FF.toInt(), 0xFFFFB84C.toInt())
      )
    }

    val sun = TextView(this).apply {
      text = "☀️"
      textSize = 34f
      gravity = Gravity.CENTER
    }
    val greeting = TextView(this).apply {
      text = getString(R.string.ring_greeting)
      textSize = 22f
      setTextColor(Color.WHITE)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, 12, 0, 0)
    }
    val subtitle = TextView(this).apply {
      text = getString(R.string.ring_subtitle)
      textSize = 14f
      setTextColor(Color.parseColor("#EAF4FF"))
      gravity = Gravity.CENTER
      setPadding(0, 4, 0, 0)
    }
    val clock = TextView(this).apply {
      text = clockFmt.format(Date())
      textSize = 64f
      setTextColor(Color.WHITE)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, 24, 0, 0)
    }

    root.addView(sun)
    root.addView(greeting)
    root.addView(subtitle)
    root.addView(clock)

    // Leave-home countdown chip — only when a future leave instant is known.
    val leaveAt = AlarmController.persistedLeaveAt(applicationContext)
    val now = System.currentTimeMillis()
    if (leaveAt > now) {
      val minutesLeft = ((leaveAt - now) / 60000L).toInt()
      val chip = TextView(this).apply {
        text = getString(R.string.ring_leave_chip, clockFmt.format(Date(leaveAt)), minutesLeft)
        textSize = 13f
        setTextColor(Color.WHITE)
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(40, 14, 40, 14)
        background = GradientDrawable().apply {
          cornerRadius = 999f
          setColor(0x2EFFFFFF)
        }
      }
      val chipParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply { topMargin = 28 }
      root.addView(chip, chipParams)
    }

    // Spacer pushes the dismiss pill to the bottom.
    val spacer = android.view.View(this)
    root.addView(spacer, LinearLayout.LayoutParams(0, 0, 1f))

    val dismiss = TextView(this).apply {
      text = getString(R.string.ring_dismiss)
      textSize = 17f
      setTextColor(Color.parseColor("#2C7BD4"))
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, 44, 0, 44)
      background = GradientDrawable().apply {
        cornerRadius = 999f
        setColor(Color.WHITE)
      }
      setOnClickListener { dismissAlarm() }
    }
    root.addView(dismiss, LinearLayout.LayoutParams(match, ViewGroup.LayoutParams.WRAP_CONTENT))

    return root
  }

  private fun dismissAlarm() {
    AlarmController.dismiss(applicationContext)
    finish()
  }

  // Must-dismiss: ignore Back so the alarm can't be swiped/backed away.
  @Suppress("OVERRIDE_DEPRECATION", "MissingSuperCall")
  override fun onBackPressed() {
    // no-op
  }
}
```
> `R` here is the module's own resource class (`expo.modules.schedularmalarm.R`, same package — no import needed). The Button is replaced by a styled TextView with a click listener (full-round white pill, sky700 text).

- [ ] **Step 2: Re-read the full file** — verify brace balance, all referenced resources exist in Task C1's strings.xml (ring_greeting, ring_subtitle, ring_leave_chip, ring_dismiss), and `AlarmController.persistedLeaveAt` exists (Task C2).

- [ ] **Step 3: Commit**

```bash
git add modules/schedularm-alarm/android/src/main/java/expo/modules/schedularmalarm/AlarmActivity.kt
git commit -m "feat(alarm-native): Soft Sky ring screen with leave countdown"
```

---

## Phase D — Brand assets (icon, splash)

### Task D1: Logo masters + asset generation

**Files:**
- Create: `assets/brand/logo.svg`, `scripts/generate-brand-assets.mjs`
- Regenerate: `assets/icon.png`, `assets/android-icon-foreground.png`, `assets/android-icon-background.png`, `assets/android-icon-monochrome.png`, `assets/splash-icon.png`

- [ ] **Step 1: Create assets/brand/logo.svg (the "Reverse clock" master, full tile)**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4FA8FF"/>
      <stop offset="1" stop-color="#2C7BD4"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="240" fill="url(#bg)"/>
  <circle cx="512" cy="546" r="222" fill="none" stroke="#FFFFFF" stroke-width="60"/>
  <line x1="512" y1="546" x2="512" y2="410" stroke="#FFFFFF" stroke-width="60" stroke-linecap="round"/>
  <line x1="512" y1="546" x2="418" y2="606" stroke="#FFFFFF" stroke-width="60" stroke-linecap="round"/>
  <path d="M 751 308 A 325 325 0 0 0 324 222" fill="none" stroke="#FFB84C" stroke-width="68" stroke-linecap="round"/>
  <polygon points="256,120 222,290 376,238" fill="#FFB84C"/>
</svg>
```

- [ ] **Step 2: Create scripts/generate-brand-assets.mjs**

```js
// Deterministic brand-asset generation from the SVG masters (run: node scripts/generate-brand-assets.mjs)
import sharp from 'sharp';

const CLOCK = `
  <circle cx="512" cy="546" r="222" fill="none" stroke="{COLOR}" stroke-width="60"/>
  <line x1="512" y1="546" x2="512" y2="410" stroke="{COLOR}" stroke-width="60" stroke-linecap="round"/>
  <line x1="512" y1="546" x2="418" y2="606" stroke="{COLOR}" stroke-width="60" stroke-linecap="round"/>
  <path d="M 751 308 A 325 325 0 0 0 324 222" fill="none" stroke="{ARROW}" stroke-width="68" stroke-linecap="round"/>
  <polygon points="256,120 222,290 376,238" fill="{ARROW}"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${body}</svg>`;

const GRADIENT = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#4FA8FF"/><stop offset="1" stop-color="#2C7BD4"/>
</linearGradient></defs>`;

// Full tile (rounded square + mark) — the iOS/store icon and splash image.
const tile = svg(`${GRADIENT}<rect width="1024" height="1024" rx="240" fill="url(#bg)"/>
  ${CLOCK.replaceAll('{COLOR}', '#FFFFFF').replaceAll('{ARROW}', '#FFB84C')}`);

// Adaptive foreground: mark only, scaled into the ~66% safe zone, transparent bg.
const foreground = svg(`<g transform="translate(512 512) scale(0.62) translate(-512 -512)">
  ${CLOCK.replaceAll('{COLOR}', '#FFFFFF').replaceAll('{ARROW}', '#FFB84C')}</g>`);

// Adaptive background: the gradient, full bleed (no rounding — the launcher masks it).
const background = svg(`${GRADIENT}<rect width="1024" height="1024" fill="url(#bg)"/>`);

// Monochrome (themed icons): white-only mark, transparent bg.
const monochrome = svg(`<g transform="translate(512 512) scale(0.62) translate(-512 -512)">
  ${CLOCK.replaceAll('{COLOR}', '#FFFFFF').replaceAll('{ARROW}', '#FFFFFF')}</g>`);

const out = async (svgStr, size, file) =>
  sharp(Buffer.from(svgStr)).resize(size, size).png().toFile(file);

await out(tile, 1024, 'assets/icon.png');
await out(foreground, 1024, 'assets/android-icon-foreground.png');
await out(background, 1024, 'assets/android-icon-background.png');
await out(monochrome, 1024, 'assets/android-icon-monochrome.png');
await out(tile, 512, 'assets/splash-icon.png');
console.log('brand assets generated');
```

- [ ] **Step 3: Run it**

Run: `node scripts/generate-brand-assets.mjs`
Expected: `brand assets generated`; the five PNGs in `assets/` are replaced (verify with `git status` — five modified PNGs).

- [ ] **Step 4: Commit**

```bash
git add assets/brand/logo.svg scripts/generate-brand-assets.mjs assets/icon.png assets/android-icon-foreground.png assets/android-icon-background.png assets/android-icon-monochrome.png assets/splash-icon.png
git commit -m "feat(brand): Reverse-clock logo + generated icon/splash assets"
```

### Task D2: Wire icon + splash in app.config.ts

**Files:**
- Modify: `app.config.ts`

- [ ] **Step 1: Add icon/adaptiveIcon/splash to the config**

In `app.config.ts`, add `icon` at the top level (after `orientation`), add `adaptiveIcon` inside the existing `android` block, and add the `expo-splash-screen` plugin entry to the existing `plugins` array:
```ts
  icon: './assets/icon.png',
```
```ts
  android: {
    package: 'com.umean.schedularm',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Alarm permissions (incl. SCHEDULE_EXACT_ALARM maxSdkVersion + the
    // service/activity/receiver components) are injected by the config plugin
    // below — single source of truth in modules/schedularm-alarm/plugin.
  },
```
```ts
  plugins: [
    './modules/schedularm-alarm/plugin/withSchedularmAlarm',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#F2F8FF',
      },
    ],
  ],
```

- [ ] **Step 2: Verify the config parses**

Run: `npx expo config --type public > /dev/null && echo "config ok"`
Expected: `config ok`.

- [ ] **Step 3: Commit**

```bash
git add app.config.ts
git commit -m "feat(brand): wire icon, adaptive icon and Soft Sky splash"
```

---

## Phase E — Gates + build + on-device acceptance

### Task E1: Full suite + typecheck

- [ ] **Step 1:** Run `npm test` → expected: all suites green (Plan 2's 60 + catalogs 3 + ko-day 1 = 64; exact count may vary if earlier tasks added asserts — nothing may FAIL).
- [ ] **Step 2:** Run `npx tsc --noEmit -p tsconfig.json` → expected: clean.
- [ ] **Step 3:** `git status --short` → expected: clean tree (commit any stragglers with `chore: plan-3 cleanup`).

### Task E2: EAS build + on-device visual acceptance (USER + DEVICE)

- [ ] **Step 1: Build**

Run: `eas build --profile development --platform android --non-interactive --no-wait`
Then poll `eas build:view <id>` until FINISHED; install the APK on the S24+.

- [ ] **Step 2: Visual acceptance checklist (compare against `docs/superpowers/specs/2026-06-12-soft-sky-mockups/`)**

With the device language set to **Korean**:
1. New launcher icon (Reverse clock) + Soft Sky splash appear.
2. Onboarding shows Korean copy, slim ✓ steps, amber battery step with 필수 chip, gray→sky Continue.
3. ChainScreen: pale-sky gradient, white bubbles, outlined wake row + 알람 chip, amber 도착 anchor, centered pills, Korean labels + 오늘/내일 day chips, Pretendard everywhere (no system-font fallback look), Nunito digits.
4. Editors: duration stepper matches mockup; time picker is the system dialog in Korean.
5. Arm → mint armed chip; ring at wake → **Soft Sky ring screen**: gradient, 좋은 아침!, big clock, 출발까지 N분 chip, white 알람 끄기 pill; dismiss works.
6. Push alerts fire with Korean texts at fall-asleep/leave-home times.
With the device language set to **English**: spot-check ChainScreen + onboarding + ring screen fall back to English.

- [ ] **Step 3: Record + commit**

Append PASS/FAIL notes to `spike/RESULTS.md` under a "Plan 3 Soft Sky acceptance" heading; commit:
```bash
git add spike/RESULTS.md && git commit -m "test: Plan 3 Soft Sky on-device acceptance"
```

---

## Done-when

- `npm test` green (incl. catalog parity + ko day-label tests); `npx tsc --noEmit` clean.
- All UI copy flows from `src/i18n` (no hardcoded user-facing strings in components); all colors/fonts flow from `src/ui/theme.ts`.
- On the S24+ (Korean locale): Soft Sky everywhere per the committed mockups, Korean copy throughout, ring screen shows the leave countdown and dismisses; English locale falls back cleanly.
- New launcher icon + splash visible; `AlarmService` is still the only native-module caller.

## Explicitly out of scope (unchanged from spec §5)

Accessibility pass, in-app language switcher, dark theme, iOS visuals, animations/haptics, Settings screen, notification-channel renaming.
