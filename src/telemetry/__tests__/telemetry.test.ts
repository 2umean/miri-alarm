// Captured once (name must start with "mock" per Jest's hoisting allow-list) so
// the in-memory store survives `jest.resetModules()` in freshFacade() below —
// otherwise each reset would spin up a disconnected AsyncStorage mock instance,
// desyncing the "arrange via AsyncStorage" steps from the freshly-required facade.
// Declared before the import so Jest's mock-hoisting (which moves jest.mock()
// calls above imports) can't push it ahead of this declaration.
const mockAsyncStorage = require('@react-native-async-storage/async-storage/jest/async-storage-mock');
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

import AsyncStorage from '@react-native-async-storage/async-storage';
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

test('setConsent(false) from unset persists denied, and a subsequent track is dropped', async () => {
  const { facade, posthog } = freshFacade();
  await facade.setConsent(false);
  expect(await AsyncStorage.getItem(KEY)).toBe('denied');
  facade.track('preset_saved', { presetCount: 1 });
  await settle();
  expect(posthog.capturePosthog).not.toHaveBeenCalled();
});

test('two sequential initTelemetry calls with stored granted start Sentry exactly once', async () => {
  await AsyncStorage.setItem(KEY, 'granted');
  const { facade, sentry } = freshFacade();
  await facade.initTelemetry();
  await facade.initTelemetry();
  expect(sentry.startSentry).toHaveBeenCalledTimes(1);
});
