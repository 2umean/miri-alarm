# Monitoring Telemetry (v0.6.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in Sentry crash reporting + PostHog analytics behind a single consent gate, per `docs/superpowers/specs/2026-07-23-monitoring-release-design.md`.

**Architecture:** A thin `src/telemetry/` facade is the only code importing vendor SDKs. Neither SDK is constructed/initialized until stored consent is `granted`. Consent UI: an onboarding card (new users), a one-time `ConsentSheet` (existing users), and a permanent footer entry. Events are typed; props are primitives only.

**Tech Stack:** Expo SDK 56 / RN 0.85, `@sentry/react-native` 8.20.x, `posthog-react-native` 4.60.x (NO PostHog Expo config plugin — it is error-tracking build tooling only, not needed for events), ts-jest.

**Verified vendor facts this plan relies on (docs agent, 2026-07-25):**
- Sentry Expo plugin: `withSentry(config, { url, project, organization })` from `@sentry/react-native/expo` (option name is `organization`, not `org`). Source maps upload automatically on EAS builds using `SENTRY_AUTH_TOKEN` (already set in EAS, sensitive). No postPublish hooks, no sentry.properties needed.
- Sentry needs `metro.config.js` using `getSentryExpoConfig` (project has no metro.config.js yet — the new file is the whole content).
- `Sentry.close()` takes no args, returns `Promise<void>`; re-`init()` after close is how re-grant works. `sendDefaultPii` defaults to `false` (omit it). `enableAutoSessionTracking` defaults to `true` — must set `false` (crashes only, no release-health sessions). Omitting `tracesSampleRate` disables tracing. Session replay is opt-in via options we simply omit.
- PostHog install set for Expo: `posthog-react-native expo-file-system expo-application expo-device expo-localization` (last one already installed).
- PostHog: `captureAppLifecycleEvents` **defaults to true since 4.39** — must pass `false`. `enableSessionReplay` defaults false (pass explicitly to document intent). With a bare `new PostHog(...)` client and no `PostHogProvider`, there is no touch/screen autocapture at all. `optOut()` persists and **drops** (not queues) events. `capture(name, props)` is the API.

---

## File structure

| File | Responsibility |
| --- | --- |
| Create `src/telemetry/events.ts` | Typed event catalog + runtime prop sanitizer |
| Create `src/telemetry/consent.ts` | AsyncStorage read/write of `schedularm.telemetryConsent.v1` |
| Create `src/telemetry/sentryClient.ts` | Only file importing `@sentry/react-native`; start/stop |
| Create `src/telemetry/posthogClient.ts` | Only file importing `posthog-react-native`; start/stop/capture |
| Create `src/telemetry/index.ts` | Facade: `initTelemetry`, `getConsent`, `setConsent`, `track` |
| Create `src/telemetry/__tests__/{events,consent,telemetry}.test.ts` | Unit tests |
| Create `src/ui/components/ConsentSheet.tsx` + test | Bottom-sheet consent editor |
| Modify `src/i18n/en.ts`, `src/i18n/ko.ts` | `consent.*` strings |
| Modify `src/ui/screens/OnboardingScreen.tsx` | Consent card above Continue |
| Modify `src/ui/screens/ChainScreen.tsx` | Migration sheet, footer link, preset/arm tracking |
| Modify `src/hooks/useArmingChain.ts` | `arm` returns success bool; missed/health tracking |
| Modify `App.tsx` | `initTelemetry()` on mount |
| Modify `app.config.ts` | `withSentry` wrapper |
| Create `metro.config.js` | `getSentryExpoConfig` |
| Create `docs/store-privacy-answers.md` | Exact store-form answers |
| Modify `privacy.html` (branch `gh-pages`) | Analytics/crash section, ko+en |

**Four deliberate deviations from the spec table** (record in the final commit message): (1) `alarm_health` drops `manufacturer`/`osVersion` props — PostHog auto-attaches `$device_manufacturer`/`$os_version` via expo-device, so sending them again is duplication; (2) `chain_armed` gains `pillCount` and is tracked from ChainScreen (not the hook) because `usedPreset` is only known there; (3) `chain_armed` also drops `hasArrivalDate` — degenerate at the only call site (arm button renders only when an arrival exists); (4) installed `@sentry/react-native` is `~7.11.0` (the `npx expo install` SDK-56-compatible resolution), not the ~8.20 the vendor-facts section assumed — plugin/metro/API surface verified equivalent on 7.11.

---

### Task 1: Branch + dependencies

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Create the branch**

```bash
git checkout -b 2umean/telemetry
```

- [ ] **Step 2: Install dependencies with Expo's version resolver**

```bash
npx expo install @sentry/react-native posthog-react-native expo-file-system expo-application expo-device
```

Expected: package.json gains all five (expo-* pinned to SDK-56-compatible versions, `@sentry/react-native` ^8.20, `posthog-react-native` ^4.60). `expo-localization` is already installed — do NOT reinstall or bump it.

- [ ] **Step 3: Sanity-check the tree still typechecks and tests pass**

```bash
npx tsc --noEmit && npx jest
```

Expected: PASS (no source changes yet).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add sentry + posthog SDKs for opt-in telemetry"
```

---

### Task 2: Event catalog + prop sanitizer

**Files:**
- Create: `src/telemetry/events.ts`
- Test: `src/telemetry/__tests__/events.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/telemetry/__tests__/events.test.ts
import { sanitizeProps } from '../events';

test('keeps numbers, booleans and short strings', () => {
  expect(sanitizeProps({ a: 3, b: true, c: 'none' })).toEqual({ a: 3, b: true, c: 'none' });
});

test('drops objects, arrays, undefined, null and functions', () => {
  expect(
    sanitizeProps({ o: { x: 1 }, arr: [1], u: undefined, n: null, f: () => 1, keep: 1 }),
  ).toEqual({ keep: 1 });
});

test('drops strings longer than 64 chars (free-text guard)', () => {
  expect(sanitizeProps({ label: 'x'.repeat(65), ok: 'x'.repeat(64) })).toEqual({
    ok: 'x'.repeat(64),
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/telemetry --verbose
```

Expected: FAIL — cannot find module `../events`.

- [ ] **Step 3: Implement**

```typescript
// src/telemetry/events.ts

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
```

- [ ] **Step 4: Run tests — PASS. Commit**

```bash
npx jest src/telemetry --verbose
git add src/telemetry
git commit -m "feat(telemetry): typed event catalog + prop sanitizer"
```

---

### Task 3: Consent storage

**Files:**
- Create: `src/telemetry/consent.ts`
- Test: `src/telemetry/__tests__/consent.test.ts`

- [ ] **Step 1: Write the failing test** (same AsyncStorage mock recipe as `src/storage/__tests__/presets.test.ts`)

```typescript
// src/telemetry/__tests__/consent.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadConsent, saveConsent } from '../consent';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('unset when nothing stored', async () => {
  expect(await loadConsent()).toBe('unset');
});

test('round-trips granted and denied', async () => {
  await saveConsent('granted');
  expect(await loadConsent()).toBe('granted');
  await saveConsent('denied');
  expect(await loadConsent()).toBe('denied');
});

test('garbage value degrades to unset', async () => {
  await AsyncStorage.setItem('schedularm.telemetryConsent.v1', 'maybe');
  expect(await loadConsent()).toBe('unset');
});
```

- [ ] **Step 2: Run — FAIL (module not found). Implement**

```typescript
// src/telemetry/consent.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'schedularm.telemetryConsent.v1';

/** 'unset' = never asked → the one-time ConsentSheet must be shown. */
export type ConsentState = 'granted' | 'denied' | 'unset';

export async function loadConsent(): Promise<ConsentState> {
  try {
    const raw = await AsyncStorage.getItem(CONSENT_KEY);
    return raw === 'granted' || raw === 'denied' ? raw : 'unset';
  } catch {
    return 'unset'; // storage failure must never block the app — fail closed (no collection)
  }
}

export async function saveConsent(state: 'granted' | 'denied'): Promise<void> {
  try {
    await AsyncStorage.setItem(CONSENT_KEY, state);
  } catch {
    // Best-effort: an unpersisted choice re-prompts next launch, which is safe.
  }
}
```

- [ ] **Step 3: Run tests — PASS. Commit**

```bash
npx jest src/telemetry --verbose
git add src/telemetry
git commit -m "feat(telemetry): consent storage (schedularm.telemetryConsent.v1)"
```

---

### Task 4: Vendor client wrappers

**Files:**
- Create: `src/telemetry/sentryClient.ts`
- Create: `src/telemetry/posthogClient.ts`

No dedicated unit tests: these are thin vendor shims with no logic to assert; they are jest-mocked by the facade test (Task 5), which pins their call contract.

- [ ] **Step 1: Write `sentryClient.ts`**

```typescript
// src/telemetry/sentryClient.ts
import * as Sentry from '@sentry/react-native';

const SENTRY_DSN =
  'https://a08534baf94f16a2c9c825c52301e319@o4511783754727424.ingest.de.sentry.io/4511783770521680'; // EU ingest

let isStarted = false;

/** Idempotent. Called only after consent — Sentry.init installs the global
 * crash handlers, so before this runs nothing is captured or sent. */
export function startSentry(): void {
  if (isStarted) return;
  isStarted = true;
  Sentry.init({
    dsn: SENTRY_DSN,
    // Crashes + unhandled JS errors only: tracesSampleRate omitted (no tracing),
    // replay options omitted (no replay), sendDefaultPii omitted (defaults false).
    enableAutoSessionTracking: false, // no release-health session pings
  });
}

/** Stops capture AND transport (revocation). Re-grant calls startSentry again. */
export function stopSentry(): void {
  if (!isStarted) return;
  isStarted = false;
  void Sentry.close(); // no args; Promise<void> — fire-and-forget by design
}
```

- [ ] **Step 2: Write `posthogClient.ts`**

```typescript
// src/telemetry/posthogClient.ts
import PostHog from 'posthog-react-native';

import type { TelemetryProps } from './events';

const POSTHOG_API_KEY = 'phc_ugpiArFE7jNDcXcx6vtyrsHXEog8MnygXyN72jkHQgF9';
const POSTHOG_HOST = 'https://eu.i.posthog.com'; // EU project — PIPA cross-border posture

let client: PostHog | null = null;

/** Construct-on-grant: no client object exists (and nothing can touch the
 * network) until consent. optIn() clears a persisted opt-out from an earlier
 * revoke — PostHog persists that flag across launches. */
export function startPosthog(): void {
  if (!client) {
    client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      captureAppLifecycleEvents: false, // default TRUE since 4.39 — explicit off
      enableSessionReplay: false, // default, restated to document intent
      preloadFeatureFlags: false, // we use no flags; skip the startup fetch
    });
  }
  void client.optIn();
}

/** PostHog drops (not queues) events while opted out — verified against @posthog/core. */
export function stopPosthog(): void {
  if (client) void client.optOut();
}

export function capturePosthog(event: string, props: TelemetryProps): void {
  client?.capture(event, props);
}
```

- [ ] **Step 3: Typecheck. Commit**

```bash
npx tsc --noEmit
git add src/telemetry
git commit -m "feat(telemetry): sentry + posthog client wrappers (EU, lazy, opt-in only)"
```

---

### Task 5: Facade

**Files:**
- Create: `src/telemetry/index.ts`
- Test: `src/telemetry/__tests__/telemetry.test.ts`

- [ ] **Step 1: Write the failing test.** The facade holds module state, so each test re-imports it fresh via `jest.resetModules()` + `require`.

```typescript
// src/telemetry/__tests__/telemetry.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../sentryClient', () => ({ startSentry: jest.fn(), stopSentry: jest.fn() }));
jest.mock('../posthogClient', () => ({
  startPosthog: jest.fn(),
  stopPosthog: jest.fn(),
  capturePosthog: jest.fn(),
}));

const KEY = 'schedularm.telemetryConsent.v1';

/** Fresh facade + fresh mocks per test (facade caches consent in module scope). */
const freshFacade = () => {
  jest.resetModules();
  const facade = require('../index') as typeof import('../index');
  const sentry = require('../sentryClient');
  const posthog = require('../posthogClient');
  return { facade, sentry, posthog };
};

// track() is fire-and-forget; give its internal await chain a tick to settle.
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('track before any consent choice is dropped and starts nothing', async () => {
  const { facade, sentry, posthog } = freshFacade();
  facade.track('preset_saved', { presetCount: 1 });
  await settle();
  expect(posthog.capturePosthog).not.toHaveBeenCalled();
  expect(sentry.startSentry).not.toHaveBeenCalled();
});

test('stored granted consent starts both SDKs on init and forwards events', async () => {
  await AsyncStorage.setItem(KEY, 'granted');
  const { facade, sentry, posthog } = freshFacade();
  await facade.initTelemetry();
  expect(sentry.startSentry).toHaveBeenCalled();
  expect(posthog.startPosthog).toHaveBeenCalled();
  facade.track('preset_saved', { presetCount: 2 });
  await settle();
  expect(posthog.capturePosthog).toHaveBeenCalledWith('preset_saved', { presetCount: 2 });
});

test('granting from unset starts SDKs, persists, and sends NO consent_changed', async () => {
  const { facade, sentry, posthog } = freshFacade();
  await facade.setConsent(true);
  expect(sentry.startSentry).toHaveBeenCalled();
  expect(await AsyncStorage.getItem(KEY)).toBe('granted');
  await settle();
  expect(posthog.capturePosthog).not.toHaveBeenCalledWith('consent_changed', expect.anything());
});

test('revoking stops both SDKs, persists, and later tracks are dropped', async () => {
  await AsyncStorage.setItem(KEY, 'granted');
  const { facade, sentry, posthog } = freshFacade();
  await facade.initTelemetry();
  await facade.setConsent(false);
  expect(sentry.stopSentry).toHaveBeenCalled();
  expect(posthog.stopPosthog).toHaveBeenCalled();
  expect(await AsyncStorage.getItem(KEY)).toBe('denied');
  facade.track('preset_saved', { presetCount: 3 });
  await settle();
  expect(posthog.capturePosthog).not.toHaveBeenCalled();
});

test('re-granting after an earlier denial sends consent_changed', async () => {
  await AsyncStorage.setItem(KEY, 'denied');
  const { facade, posthog } = freshFacade();
  await facade.setConsent(true);
  await settle();
  expect(posthog.capturePosthog).toHaveBeenCalledWith('consent_changed', { granted: true });
});

test('getConsent reflects stored state', async () => {
  await AsyncStorage.setItem(KEY, 'denied');
  const { facade } = freshFacade();
  expect(await facade.getConsent()).toBe('denied');
});
```

- [ ] **Step 2: Run — FAIL (module not found). Implement**

```typescript
// src/telemetry/index.ts
import { ConsentState, loadConsent, saveConsent } from './consent';
import { sanitizeProps, TelemetryEventName, TelemetryEvents } from './events';
import { capturePosthog, startPosthog, stopPosthog } from './posthogClient';
import { startSentry, stopSentry } from './sentryClient';

export type { ConsentState } from './consent';

let consent: ConsentState = 'unset';
let ready: Promise<void> | null = null;

/**
 * Idempotent; App.tsx calls it once on mount, and every other entry point
 * awaits it internally — so callers never race the stored-consent read.
 * Starts the SDKs iff a previous session granted consent.
 */
export function initTelemetry(): Promise<void> {
  if (!ready) {
    ready = loadConsent()
      .then((stored) => {
        consent = stored;
        if (stored === 'granted') {
          startSentry();
          startPosthog();
        }
      })
      .catch(() => {}); // telemetry must never break startup
  }
  return ready;
}

export async function getConsent(): Promise<ConsentState> {
  await initTelemetry();
  return consent;
}

/** Persist a choice and start/stop collection immediately (no restart needed). */
export async function setConsent(granted: boolean): Promise<void> {
  await initTelemetry();
  const next = granted ? 'granted' : 'denied';
  if (consent === next) return;
  const previous = consent;
  consent = next;
  await saveConsent(next);
  if (granted) {
    startSentry();
    startPosthog();
    // Only a CHANGE after an initial choice is an event; the initial choice is
    // carried by onboarding_completed. Revocation sends nothing — no byte may
    // leave the device after withdrawal.
    if (previous === 'denied') track('consent_changed', { granted: true });
  } else {
    stopPosthog();
    stopSentry();
  }
}

/** Fire-and-forget; drops silently unless consent is granted. Never throws. */
export function track<E extends TelemetryEventName>(event: E, props: TelemetryEvents[E]): void {
  void (async () => {
    try {
      await initTelemetry();
      if (consent !== 'granted') return;
      capturePosthog(event, sanitizeProps(props));
    } catch {
      // deliberately swallowed — see spec: telemetry never crashes the app
    }
  })();
}
```

- [ ] **Step 3: Run all telemetry tests — PASS. Full suite + typecheck. Commit**

```bash
npx jest src/telemetry --verbose && npx tsc --noEmit
git add src/telemetry
git commit -m "feat(telemetry): consent-gated facade (init/track/setConsent)"
```

---

### Task 6: i18n strings

**Files:**
- Modify: `src/i18n/en.ts` (after the `legal:` line)
- Modify: `src/i18n/ko.ts` (same position; ko mirrors `typeof en` so a missing key is a compile error)

- [ ] **Step 1: Add to `en.ts`**

```typescript
  consent: {
    onboardingTitle: 'Help improve MIRI?',
    title: 'Anonymous usage & crash reports',
    body: 'Share anonymous usage statistics and crash reports to help make MIRI’s alarms more reliable. Your schedule contents — names, emoji, times — never leave your device. Data is processed in the EU (Sentry, PostHog). You can change this anytime under Data Settings.',
    toggleOn: 'Sharing on',
    toggleOff: 'Sharing off',
    save: 'Save',
    dataSettings: 'Data Settings',
  },
```

- [ ] **Step 2: Add to `ko.ts`**

```typescript
  consent: {
    onboardingTitle: 'MIRI 개선에 참여할까요?',
    title: '익명 사용 통계·오류 보고',
    body: '익명 사용 통계와 오류 보고를 공유해 MIRI 알람의 신뢰성 개선을 도와주세요. 일정 내용(이름·이모지·시간)은 절대 기기를 떠나지 않습니다. 데이터는 EU 리전에서 처리되며(Sentry, PostHog), 언제든 하단 데이터 설정에서 변경할 수 있습니다.',
    toggleOn: '공유 켜짐',
    toggleOff: '공유 꺼짐',
    save: '저장',
    dataSettings: '데이터 설정',
  },
```

- [ ] **Step 3: Typecheck (catches en/ko key drift). Commit**

```bash
npx tsc --noEmit
git add src/i18n
git commit -m "feat(i18n): consent strings (ko/en)"
```

---

### Task 7: ConsentSheet component

**Files:**
- Create: `src/ui/components/ConsentSheet.tsx`
- Test: `src/ui/__tests__/ConsentSheet.test.tsx`
- Possibly modify: `test/stubs/react-native.js`

- [ ] **Step 1: Check the react-native stub covers `Modal`**

```bash
grep -n "Modal" test/stubs/react-native.js
```

If absent, add — following the file's existing export style — a minimal Modal that renders children only when visible:

```javascript
Modal: ({ visible, children }) => (visible ? children : null),
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/ui/__tests__/ConsentSheet.test.tsx
import { Pressable, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { ConsentSheet } from '../components/ConsentSheet';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: require('react-native').View,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

type Props = Parameters<typeof ConsentSheet>[0];

const mount = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    visible: true,
    initialGranted: false,
    onCancel: jest.fn(),
    onSave: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ConsentSheet {...props} />);
  });
  return { renderer, props };
};

const findToggle = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType(Pressable).find((p) => p.props.accessibilityRole === 'switch')!;

const texts = (renderer: ReactTestRenderer): string[] =>
  renderer.root.findAllByType(Text).map((t) => String(t.props.children));

test('starts from initialGranted and toggles on press', () => {
  const { renderer } = mount({ initialGranted: false });
  expect(findToggle(renderer).props.accessibilityState).toEqual({ checked: false });
  act(() => findToggle(renderer).props.onPress());
  expect(findToggle(renderer).props.accessibilityState).toEqual({ checked: true });
});

test('save reports the CURRENT toggle state', () => {
  const { renderer, props } = mount({ initialGranted: false });
  act(() => findToggle(renderer).props.onPress());
  // The save button is the last Pressable in the sheet ([backdrop, toggle, save]).
  const pressables = renderer.root.findAllByType(Pressable);
  act(() => pressables[pressables.length - 1].props.onPress());
  expect(props.onSave).toHaveBeenCalledWith(true);
  expect(props.onCancel).not.toHaveBeenCalled();
});

test('backdrop press cancels without saving', () => {
  const { renderer, props } = mount();
  act(() => renderer.root.findAllByType(Pressable)[0].props.onPress()); // backdrop is first
  expect(props.onCancel).toHaveBeenCalled();
  expect(props.onSave).not.toHaveBeenCalled();
});

test('shows on/off labels for the toggle state', () => {
  const { renderer } = mount({ initialGranted: true });
  expect(texts(renderer).join(' ')).toContain('Sharing on');
});
```

- [ ] **Step 3: Run — FAIL. Implement** (same sheet recipe as `PresetNameSheet`, minus keyboard handling — no inputs here)

```tsx
// src/ui/components/ConsentSheet.tsx
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { colors, fonts, radii, shadows, spacing } from '../theme';

type Props = {
  visible: boolean;
  initialGranted: boolean;
  /** Backdrop / Android back. The PARENT decides what a dismissal means
   * (one-time prompt records 'denied'; footer-opened keeps current state). */
  onCancel: () => void;
  onSave: (granted: boolean) => void;
};

/**
 * Bottom-sheet consent editor (spec: one toggle, both SDKs). Mounted fresh per
 * open — the parent renders it conditionally, so useState(initialGranted) is
 * the whole lifecycle, same recipe as PresetNameSheet.
 */
export function ConsentSheet({ visible, initialGranted, onCancel, onSave }: Props) {
  const [granted, setGranted] = useState(initialGranted);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: spacing.xxl + insets.bottom }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('consent.title')}</Text>
          <Text style={styles.body}>{t('consent.body')}</Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: granted }}
            onPress={() => setGranted((v) => !v)}
            style={[styles.toggle, granted && styles.toggleOn]}
          >
            <Text style={[styles.toggleText, granted && styles.toggleTextOn]}>
              {granted ? `✓ ${t('consent.toggleOn')}` : `○ ${t('consent.toggleOff')}`}
            </Text>
          </Pressable>
          <Pressable style={styles.submitWrap} onPress={() => onSave(granted)}>
            <LinearGradient
              colors={[colors.sky500, colors.sky700]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submit}
            >
              <Text style={styles.submitText}>{t('consent.save')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.backdrop },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: colors.skyBgBottom,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.m,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: spacing.m + 2 },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.extra, marginBottom: spacing.s },
  body: { color: colors.ink2, fontSize: 12, fontFamily: fonts.semi, lineHeight: 18, marginBottom: spacing.l },
  toggle: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingVertical: spacing.s + 1,
    paddingHorizontal: spacing.xl - 2,
    marginBottom: spacing.l + 2,
  },
  toggleOn: { backgroundColor: colors.mintBg, borderColor: colors.green },
  toggleText: { color: colors.ink2, fontSize: 13, fontFamily: fonts.extra },
  toggleTextOn: { color: colors.green },
  submitWrap: { borderRadius: radii.pill, ...shadows.button },
  submit: { borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center' },
  submitText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
});
```

Note for the test's second case: with this layout the Pressable order is `[backdrop, toggle, save]` — the "last Pressable" lookup in the test is stable. If `colors.mintBg`/`colors.backdrop`/`shadows.focus` names differ in `src/ui/theme.ts`, use the actual names from that file (verify with `grep -n "mintBg\|backdrop" src/ui/theme.ts`) — do not add new theme entries.

- [ ] **Step 4: Run tests — PASS. Commit**

```bash
npx jest src/ui/__tests__/ConsentSheet.test.tsx --verbose
git add src/ui test/stubs
git commit -m "feat(ui): ConsentSheet bottom sheet"
```

---

### Task 8: Onboarding consent card

**Files:**
- Modify: `src/ui/screens/OnboardingScreen.tsx`

No new automated test (the screen has none today; the behavior is covered by the facade tests + device QA). Keep the change minimal.

- [ ] **Step 1: Wire state + prefill.** Add imports and, inside `OnboardingScreen`:

```tsx
import { useEffect, useState } from 'react'; // useState already imported — extend it
import { getConsent, setConsent, track } from '../../telemetry';
```

```tsx
const [shareTelemetry, setShareTelemetry] = useState(false);

// Prefill for RE-onboarding (existing user pushed back here by a lost
// permission): reflect their earlier choice instead of resetting to off.
useEffect(() => {
  void getConsent().then((c) => setShareTelemetry(c === 'granted'));
}, []);
```

- [ ] **Step 2: Render the card** between the permission `Step`s and the Continue button (i.e., right before the `<Pressable onPress={onDone} ...>` block):

```tsx
<View style={styles.step}>
  <Text style={styles.stepTitle}>{t('consent.onboardingTitle')}</Text>
  <Text style={styles.stepDesc}>{t('consent.body')}</Text>
  <Pressable
    accessibilityRole="switch"
    accessibilityState={{ checked: shareTelemetry }}
    onPress={() => setShareTelemetry((v) => !v)}
    style={[styles.consentToggle, shareTelemetry && styles.consentToggleOn]}
  >
    <Text style={[styles.consentToggleText, shareTelemetry && styles.consentToggleTextOn]}>
      {shareTelemetry ? `✓ ${t('consent.toggleOn')}` : `○ ${t('consent.toggleOff')}`}
    </Text>
  </Pressable>
</View>
```

New styles (append to the StyleSheet):

```tsx
consentToggle: {
  alignSelf: 'flex-start',
  backgroundColor: colors.skyBg,
  borderWidth: 1.5,
  borderColor: colors.line,
  borderRadius: radii.pill,
  paddingVertical: spacing.s - 1,
  paddingHorizontal: spacing.xl - 2,
  marginTop: spacing.s + 1,
},
consentToggleOn: { backgroundColor: colors.mintBg, borderColor: colors.green },
consentToggleText: { color: colors.ink2, fontSize: 12, fontFamily: fonts.extra },
consentToggleTextOn: { color: colors.green },
```

- [ ] **Step 3: Record on Continue.** Replace `onPress={onDone}` on the Continue Pressable with:

```tsx
onPress={async () => {
  await setConsent(shareTelemetry);
  track('onboarding_completed', { consentGranted: shareTelemetry });
  onDone();
}}
```

(If consent was granted, `setConsent` has already started the SDKs, so `onboarding_completed` is deliverable; if denied, `track` drops it — correct either way.)

- [ ] **Step 4: Typecheck + full tests. Commit**

```bash
npx tsc --noEmit && npx jest
git add src/ui/screens/OnboardingScreen.tsx
git commit -m "feat(onboarding): consent card records choice on continue"
```

---

### Task 9: Hook wiring — arm result, missed/health events

**Files:**
- Modify: `src/hooks/useArmingChain.ts`

- [ ] **Step 1: `arm` returns success.** Change the `arm` callback to return `Promise<boolean>` (ChainScreen needs a success signal to track `chain_armed` honestly — the catch path currently swallows failures):

```typescript
const arm = useCallback(
  async (chain: Chain, startLabel: string): Promise<boolean> => {
    try {
      await AlarmService.armChain(chain, startLabel);
      await saveArmedChain(chain);
      setArmed(chain);
      refreshHealth();
      return true;
    } catch (e) {
      console.warn('[useArmingChain] arm failed; leaving un-armed:', e);
      refreshHealth();
      return false;
    }
  },
  [refreshHealth],
);
```

(`refreshHealth()` moves inside both branches — it previously ran once after the try/catch; behavior is identical.)

- [ ] **Step 2: Track missed + health in the mount effect.** Add `import { track } from '../telemetry';` and extend the existing effect:

```typescript
const misses = AlarmService.consumeMissed();
if (misses.length) {
  setMissed(misses[misses.length - 1]);
  track('alarm_missed', {
    count: misses.length,
    maxMinutesLate: Math.round(
      misses.reduce((max, m) => Math.max(max, Date.now() - m.at), 0) / 60000,
    ),
  });
}
const snapshot = AlarmService.getHealth();
track('alarm_health', {
  reasons: snapshot.reasons.join('+') || 'none',
  isArmReliable: snapshot.isArmReliable,
  isAggressiveOEM: snapshot.isAggressiveOEM,
});
```

(`MissedAlarm.at` is the epoch-ms instant the alarm should have rung — see `modules/schedularm-alarm/SchedularmAlarm.types.ts`. Labels are deliberately not read.)

- [ ] **Step 3: Typecheck + full tests (the changed return type must not break existing callers — ChainScreen's current `arm(chain, startLabel)` call ignores the return value, which is fine until Task 10). Commit**

```bash
npx tsc --noEmit && npx jest
git add src/hooks/useArmingChain.ts
git commit -m "feat(telemetry): arm success signal + missed/health events in useArmingChain"
```

---

### Task 10: ChainScreen wiring

**Files:**
- Modify: `src/ui/screens/ChainScreen.tsx`

- [ ] **Step 1: Imports + state**

```tsx
import { ConsentSheet } from '../components/ConsentSheet';
import { getConsent, setConsent, track } from '../../telemetry';
```

```tsx
// 'migration' = the one-time prompt for users who onboarded before v0.6.0.
const [consentSheet, setConsentSheet] = useState<'closed' | 'migration' | 'settings'>('closed');
const [consentGranted, setConsentGranted] = useState(false);

useEffect(() => {
  void getConsent().then((c) => {
    setConsentGranted(c === 'granted');
    if (c === 'unset') setConsentSheet('migration');
  });
}, []);
```

- [ ] **Step 2: Footer link.** Replace the single privacy-link Pressable at the bottom of the ScrollView with a two-link row:

```tsx
<View style={styles.footerLinks}>
  <Pressable
    accessibilityRole="link"
    onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
    style={styles.privacyLink}
  >
    <Text style={styles.privacyLinkText}>{t('legal.privacyPolicy')}</Text>
  </Pressable>
  <Text style={styles.privacyLinkText}>·</Text>
  <Pressable
    accessibilityRole="button"
    onPress={() => setConsentSheet('settings')}
    style={styles.privacyLink}
  >
    <Text style={styles.privacyLinkText}>{t('consent.dataSettings')}</Text>
  </Pressable>
</View>
```

Style change: replace `privacyLink`'s `alignSelf: 'center'` with a row container:

```tsx
footerLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
privacyLink: { padding: spacing.m },
```

- [ ] **Step 3: Render the sheet** (after `<PresetListSheet ... />`, conditionally so it mounts fresh per open):

```tsx
{consentSheet !== 'closed' ? (
  <ConsentSheet
    visible
    initialGranted={consentGranted}
    onCancel={() => {
      if (consentSheet === 'migration') {
        // Dismissing the one-time prompt = no consent; record it so it never reshows.
        void setConsent(false);
        setConsentGranted(false);
      }
      setConsentSheet('closed');
    }}
    onSave={(granted) => {
      void setConsent(granted);
      setConsentGranted(granted);
      setConsentSheet('closed');
    }}
  />
) : null}
```

- [ ] **Step 4: Preset events.** In `onApplyPreset`, after `applyPreset(preset.id);` add:

```tsx
track('preset_applied', { presetCount: presets.length });
```

In `onCreatePreset`, after `createPreset(name, chain.pills);` add:

```tsx
track('preset_saved', { presetCount: presets.length + 1 });
```

- [ ] **Step 5: chain_armed on successful arm.** Replace the arm Pressable's `onPress={armed ? disarm : () => armable && arm(chain, startLabel)}` with:

```tsx
onPress={
  armed
    ? disarm
    : async () => {
        if (!armable) return;
        const ok = await arm(chain, startLabel);
        if (!ok) return;
        track('chain_armed', {
          alarmCount: chain.pills.filter((p) => p.type === 'alarm').length,
          pillCount: chain.pills.length,
          chainDurationMin: chain.pills.reduce(
            (sum, p) => sum + ('dur' in p && typeof p.dur === 'number' ? p.dur : 0),
            0,
          ),
          usedPreset: activePreset != null,
        });
      }
}
```

(Marker pills — `type: 'alarm' | 'push'` — have no `dur`; the `'dur' in p` guard matches the domain Pill union. Check `src/domain` if TS complains and adjust the guard to the actual union, keeping durations-only semantics.)

- [ ] **Step 6: Typecheck + full tests. Commit**

```bash
npx tsc --noEmit && npx jest
git add src/ui/screens/ChainScreen.tsx
git commit -m "feat(telemetry): consent surfaces + chain/preset events in ChainScreen"
```

---

### Task 11: App init + build config

**Files:**
- Modify: `App.tsx`
- Modify: `app.config.ts`
- Create: `metro.config.js`

- [ ] **Step 1: Init telemetry at app mount.** In `App.tsx` add `import { initTelemetry } from './src/telemetry';` and, as the FIRST effect in `App`:

```tsx
useEffect(() => {
  void initTelemetry(); // idempotent; starts SDKs iff consent was granted earlier
}, []);
```

- [ ] **Step 2: Sentry Expo plugin.** In `app.config.ts`: add `import { withSentry } from '@sentry/react-native/expo';` and change the export line to:

```typescript
export default withSentry(config, {
  url: 'https://sentry.io/',
  organization: '2umean',
  project: 'react-native',
  // Auth comes from SENTRY_AUTH_TOKEN (EAS env var, sensitive) at build time.
});
```

- [ ] **Step 3: Metro config for source-map Debug IDs.** Create `metro.config.js` (repo root — the project currently has none, so this whole file is new):

```javascript
// Sentry's wrapper around expo/metro-config: assigns unique Debug IDs to
// bundles + source maps so crash stacks symbolicate (required for EAS upload).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
```

- [ ] **Step 4: Verify config resolves + full suite**

```bash
npx expo config --type public > /dev/null && echo CONFIG-OK
npx tsc --noEmit && npx jest
```

Expected: `CONFIG-OK`, typecheck clean, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add App.tsx app.config.ts metro.config.js
git commit -m "feat(build): sentry expo plugin + metro debug-id config, telemetry init"
```

---

### Task 12: Store-form answer sheet

**Files:**
- Create: `docs/store-privacy-answers.md`

- [ ] **Step 1: Write the file** (verbatim; this is the release-day checklist for the consoles):

```markdown
# Store privacy-form answers — v0.6.0 (opt-in Sentry + PostHog)

Both forms MUST be updated in the same release that ships the SDKs
(deployment.md: false declarations can ban the account). Current state on both
stores is "no data collected" — that stops being true with v0.6.0.

## Apple App Store Connect → App Privacy

Collection is OPT-IN, anonymous, and NOT used for tracking (no cross-company
linking → no ATT prompt needed this release).

| Data type | Collected? | Linked to user? | Used for tracking? | Purposes |
| --- | --- | --- | --- | --- |
| Identifiers → Device ID (PostHog per-install anonymous id) | Yes | No | No | Analytics |
| Usage Data → Product Interaction | Yes | No | No | Analytics |
| Diagnostics → Crash Data | Yes | No | No | App Functionality |
| Diagnostics → Other Diagnostic Data (alarm health/permission states) | Yes | No | No | App Functionality, Analytics |
| Everything else | No | — | — | — |

## Google Play Console → App content → Data safety

Play counts data as "collected" when it leaves the device (stricter than
Apple). Sentry/PostHog are service providers → "collected", NOT "shared".

- Does your app collect or share user data? **Yes**
- Encrypted in transit? **Yes**
- Deletion mechanism: users can stop collection anytime (footer → Data
  Settings); deletion requests via the privacy-policy contact email.
- App activity → App interactions: **Collected, optional, Analytics**
- App info and performance → Crash logs: **Collected, optional, App functionality**
- App info and performance → Diagnostics: **Collected, optional, App functionality + Analytics**
- Device or other IDs: **Collected, optional, Analytics**
- Everything else: not collected. Nothing is "shared".

## Reminder

When release 2 (AdMob) ships, BOTH forms change again materially (tracking =
Yes on Apple + ATT prompt; "shared" categories on Play).
```

- [ ] **Step 2: Commit**

```bash
git add docs/store-privacy-answers.md
git commit -m "docs: store privacy-form answers for v0.6.0"
```

---

### Task 13: Privacy policy update (gh-pages)

**Files:**
- Modify: `privacy.html` on branch `gh-pages` (via worktree — do NOT switch the main working tree)

- [ ] **Step 1: Open a worktree**

```bash
git worktree add /tmp/miri-ghpages gh-pages
```

- [ ] **Step 2: Read `/tmp/miri-ghpages/privacy.html`** and integrate a new section, matching the file's existing HTML structure/classes and bilingual layout. Korean content (adapt EN to mirror it):

> **분석 및 오류 보고 (선택)**
> MIRI는 앱 안정성 개선을 위해 익명 사용 통계와 오류(크래시) 보고를 수집할 수
> 있습니다. 이 수집은 선택 사항이며 기본적으로 꺼져 있습니다. 온보딩 화면 또는
> 홈 화면 하단의 "데이터 설정"에서 언제든 동의하거나 철회할 수 있습니다.
>
> - 수집 항목: 익명 앱 사용 이벤트(알람 체인의 구성 개수·시간 통계, 알람 누락
>   여부, 권한 상태), 오류·크래시 로그, 기기 모델·OS 버전, 설치 단위의 익명
>   식별자. 일정의 이름·이모지·시각 등 내용은 수집하지 않습니다.
> - 처리 위탁 및 국외 이전: 오류 보고는 Sentry(Functional Software, Inc.),
>   사용 통계는 PostHog Inc.가 처리하며, 두 서비스 모두 EU 리전 서버에
>   저장됩니다. 이전 항목은 위 수집 항목과 같고, 이전 시점은 동의 후 앱 사용
>   시이며, 네트워크 전송은 암호화됩니다.
> - 자동 수집 장치의 설치·운영 및 거부: 위 SDK는 동의한 경우에만 초기화되며,
>   "데이터 설정"에서 거부(철회)할 수 있습니다. 철회 시 수집이 즉시 중단됩니다.
> - 보유 기간: 각 처리자의 보존 정책에 따라 일정 기간 후 자동 삭제되며, 삭제
>   요청은 아래 연락처로 문의할 수 있습니다.

Also bump the effective-date line (시행일) to the release date.

- [ ] **Step 3: Commit on gh-pages (push happens at release, Task 14)**

```bash
cd /tmp/miri-ghpages && git add privacy.html && git commit -m "privacy: disclose opt-in analytics/crash reporting (Sentry, PostHog; EU)" && cd -
```

---

### Task 14: Verification + release (gated on user QA)

- [ ] **Step 1: Full local verification**

```bash
npx tsc --noEmit && npx jest && npx expo config --type public > /dev/null && echo ALL-OK
```

Expected: all green, `ALL-OK`.

- [ ] **Step 2: Dev-client build for device QA** (JS-only iteration won't cover the new native modules — a fresh dev build is required)

```bash
eas build --profile development --platform android
```

QA checklist (user, on device):
1. Fresh install → onboarding shows consent card, default OFF → continue with OFF → no events in PostHog EU project.
2. Footer → 데이터 설정 → toggle ON → save → use app (arm a chain) → `chain_armed` appears in PostHog (EU project! verify URL is eu.posthog.com).
3. Toggle OFF → arm again → no new events.
4. With sharing ON, trigger a test crash (temporary button calling `Sentry.nativeCrash()` or `throw new Error('sentry smoke test')` — remove before release build) → event appears in Sentry with readable stack.
5. Update-in-place over v0.5.0 (install old APK, then new) → one-time ConsentSheet appears exactly once; dismissing = never again.
6. Both locales render the consent copy correctly.

- [ ] **Step 3: Merge + version bump (after QA passes)**

```bash
git checkout main && git merge --no-ff 2umean/telemetry
npm version minor   # -> 0.6.0
```

- [ ] **Step 4: Production build + submit (recipe: docs/deployment.md)**

```bash
eas build --profile production --platform all
eas submit --profile production --platform ios
eas submit --profile production --platform android
git push && git push --tags && cd /tmp/miri-ghpages && git push && cd - && git worktree remove /tmp/miri-ghpages
```

- [ ] **Step 5: Same day, in the consoles:** apply `docs/store-privacy-answers.md` to both store forms; verify the updated privacy.html is live.
```
