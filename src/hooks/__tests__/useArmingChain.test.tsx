import { AppState } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import type { AlarmHealth } from '../../alarm/alarmHealth';

jest.mock('../../alarm/AlarmService', () => ({
  AlarmService: {
    getHealth: jest.fn(),
    consumeMissed: jest.fn(() => []),
    armChain: jest.fn().mockResolvedValue(undefined),
    dismiss: jest.fn(),
  },
}));
jest.mock('../../storage/armedChain', () => ({
  loadArmedChain: jest.fn().mockResolvedValue(null),
  saveArmedChain: jest.fn().mockResolvedValue(undefined),
  clearArmedChain: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../storage/presets', () => ({
  loadPresets: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../telemetry', () => ({ track: jest.fn() }));

import { AlarmService } from '../../alarm/AlarmService';
import { useArmingChain } from '../useArmingChain';

const BLOCKED: AlarmHealth = {
  reasons: ['alarm-auth-denied'],
  isArmReliable: false,
  isAggressiveOEM: false,
};
const READY: AlarmHealth = { reasons: [], isArmReliable: true, isAggressiveOEM: false };

let latestHealth: AlarmHealth | null = null;
function Probe() {
  latestHealth = useArmingChain().health;
  return null;
}

beforeEach(() => {
  (AppState as unknown as { _listeners: Set<unknown> })._listeners.clear();
  latestHealth = null;
});

// ChainScreen's at-risk banner routes iOS-denied users to Settings (and Android
// gates were always granted there) — coming back to the foreground must
// re-derive health so the banner clears without another tap.
test('returning to the foreground re-derives health for banner consumers', async () => {
  (AlarmService.getHealth as jest.Mock).mockReturnValue(BLOCKED);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<Probe />);
  });
  expect(latestHealth?.isArmReliable).toBe(false);

  (AlarmService.getHealth as jest.Mock).mockReturnValue(READY);
  await act(async () => {
    (AppState as unknown as { __emit: (s: string) => void }).__emit('active');
  });
  expect(latestHealth?.isArmReliable).toBe(true);

  await act(async () => {
    renderer.unmount();
  });
  expect((AppState as unknown as { _listeners: Set<unknown> })._listeners.size).toBe(0);
});
