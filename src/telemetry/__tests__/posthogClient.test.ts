const mockPosthogInstance = {
  optIn: jest.fn().mockResolvedValue(undefined),
  optOut: jest.fn().mockResolvedValue(undefined),
  capture: jest.fn(),
  setPersistedProperty: jest.fn(),
};
jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: jest.fn(() => mockPosthogInstance),
  PostHogPersistedProperty: { Queue: 'queue' },
}));

const freshModule = () => {
  jest.resetModules();
  jest.clearAllMocks();
  const PostHog = require('posthog-react-native').default;
  const posthogClient = require('../posthogClient') as typeof import('../posthogClient');
  return { PostHog, posthogClient };
};

test('startPosthog constructs the client once and calls optIn each time', () => {
  const { PostHog, posthogClient } = freshModule();
  posthogClient.startPosthog();
  posthogClient.startPosthog();
  expect(PostHog).toHaveBeenCalledTimes(1);
  expect(mockPosthogInstance.optIn).toHaveBeenCalledTimes(2);
});

test('stopPosthog before any start: no throw, no constructor call', () => {
  const { PostHog, posthogClient } = freshModule();
  expect(() => posthogClient.stopPosthog()).not.toThrow();
  expect(PostHog).not.toHaveBeenCalled();
  expect(mockPosthogInstance.optOut).not.toHaveBeenCalled();
});

test('stopPosthog after start calls optOut AND clears the persisted queue', () => {
  const { posthogClient } = freshModule();
  posthogClient.startPosthog();
  posthogClient.stopPosthog();
  expect(mockPosthogInstance.optOut).toHaveBeenCalledTimes(1);
  expect(mockPosthogInstance.setPersistedProperty).toHaveBeenCalledWith('queue', null);
});

test('capturePosthog no-ops before start; forwards after start', () => {
  const { posthogClient } = freshModule();
  posthogClient.capturePosthog('preset_saved', { presetCount: 1 });
  expect(mockPosthogInstance.capture).not.toHaveBeenCalled();

  posthogClient.startPosthog();
  posthogClient.capturePosthog('preset_saved', { presetCount: 2 });
  expect(mockPosthogInstance.capture).toHaveBeenCalledWith('preset_saved', { presetCount: 2 });
});
