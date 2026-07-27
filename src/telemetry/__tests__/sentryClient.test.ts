jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
}));

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const freshModule = () => {
  jest.resetModules();
  jest.clearAllMocks();
  const Sentry = require('@sentry/react-native');
  const sentryClient = require('../sentryClient') as typeof import('../sentryClient');
  return { Sentry, sentryClient };
};

test('double startSentry calls init exactly once', async () => {
  const { Sentry, sentryClient } = freshModule();
  sentryClient.startSentry();
  sentryClient.startSentry();
  await flush();
  expect(Sentry.init).toHaveBeenCalledTimes(1);
});

test('start -> stop -> start: re-init waits for the pending close to resolve', async () => {
  const { Sentry, sentryClient } = freshModule();
  sentryClient.startSentry();
  await flush();
  expect(Sentry.init).toHaveBeenCalledTimes(1);

  let resolveClose: () => void = () => {};
  Sentry.close.mockReturnValue(
    new Promise<void>((r) => {
      resolveClose = r;
    }),
  );

  sentryClient.stopSentry();
  sentryClient.startSentry();
  await flush();
  expect(Sentry.init).toHaveBeenCalledTimes(1); // close still pending — no re-init yet

  resolveClose();
  await flush();
  expect(Sentry.init).toHaveBeenCalledTimes(2);
});

test('stop while close is pending does not re-init if not restarted; stop-without-start no-ops', async () => {
  const { Sentry, sentryClient } = freshModule();

  // stop-without-start no-ops
  sentryClient.stopSentry();
  expect(Sentry.close).not.toHaveBeenCalled();

  sentryClient.startSentry();
  await flush();
  expect(Sentry.init).toHaveBeenCalledTimes(1);

  let resolveClose: () => void = () => {};
  Sentry.close.mockReturnValue(
    new Promise<void>((r) => {
      resolveClose = r;
    }),
  );
  sentryClient.stopSentry();
  await flush();
  resolveClose();
  await flush();

  expect(Sentry.init).toHaveBeenCalledTimes(1); // never restarted — still just the one init
});
