import { AppState, Pressable } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import type { AlarmHealth } from '../../../alarm/alarmHealth';

jest.mock('../../../alarm/AlarmService', () => ({
  AlarmService: {
    getHealth: jest.fn(),
    requestCritical: jest.fn().mockResolvedValue(undefined),
    requestOverlay: jest.fn().mockResolvedValue(undefined),
    requestBattery: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../../telemetry', () => ({
  getConsent: jest.fn().mockResolvedValue('denied'),
  setConsent: jest.fn().mockResolvedValue(undefined),
  track: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { AlarmService } from '../../../alarm/AlarmService';
import { OnboardingScreen } from '../OnboardingScreen';

beforeEach(() => {
  // The stub's listener set is shared module state; tests before this one keep
  // their screens mounted, so start each test from a clean subscription slate.
  (AppState as unknown as { _listeners: Set<unknown> })._listeners.clear();
});

const BLOCKED: AlarmHealth = {
  reasons: ['alarm-auth-denied'],
  isArmReliable: false,
  isAggressiveOEM: false,
};
const READY: AlarmHealth = { reasons: [], isArmReliable: true, isAggressiveOEM: false };

// The continue button is the only Pressable carrying a `disabled` prop.
const continueButton = (renderer: ReactTestRenderer) =>
  renderer.root.findAll((n) => n.type === Pressable && n.props.disabled !== undefined)[0];

// Granting a permission happens in the system Settings app; before, users had
// to come back and tap "Re-check" by hand. Returning to the foreground must
// re-derive health automatically.
test('returning to the app after granting in Settings unblocks continue without a manual re-check', async () => {
  (AlarmService.getHealth as jest.Mock).mockReturnValue(BLOCKED);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<OnboardingScreen onDone={() => {}} />);
  });
  expect(continueButton(renderer).props.disabled).toBe(true);

  (AlarmService.getHealth as jest.Mock).mockReturnValue(READY);
  await act(async () => {
    (AppState as unknown as { __emit: (s: string) => void }).__emit('active');
  });

  expect(continueButton(renderer).props.disabled).toBe(false);
});

// Backgrounding must NOT re-check (Android pauses the app while its own
// permission dialog is up — a 'background' refresh would be wasted churn).
test('a background transition does not re-derive health', async () => {
  (AlarmService.getHealth as jest.Mock).mockReturnValue(BLOCKED);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<OnboardingScreen onDone={() => {}} />);
  });
  const callsAfterMount = (AlarmService.getHealth as jest.Mock).mock.calls.length;

  await act(async () => {
    (AppState as unknown as { __emit: (s: string) => void }).__emit('background');
  });

  expect((AlarmService.getHealth as jest.Mock).mock.calls.length).toBe(callsAfterMount);
});

// The subscription must die with the screen — a leaked listener would call
// setState on an unmounted component from every later foreground.
test('unmount removes the AppState listener', async () => {
  (AlarmService.getHealth as jest.Mock).mockReturnValue(BLOCKED);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<OnboardingScreen onDone={() => {}} />);
  });
  await act(async () => {
    renderer.unmount();
  });

  const listeners = (AppState as unknown as { _listeners: Set<unknown> })._listeners;
  expect(listeners.size).toBe(0);
});
