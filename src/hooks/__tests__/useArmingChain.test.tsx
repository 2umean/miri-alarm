import { AppState } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import type { AlarmHealth } from '../../alarm/alarmHealth';
import type { Chain } from '../../domain';

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
import { clearArmedChain, loadArmedChain } from '../../storage/armedChain';
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

// An armed snapshot whose ⏰ already rang but whose 🔔 is still ahead is LIVE:
// relaunching must keep it armed (and self-heal the push), not silently clear it
// while the push is still scheduled.
test('relaunch keeps a snapshot armed while a push is still ahead after its last alarm', async () => {
  (AlarmService.getHealth as jest.Mock).mockReturnValue(READY);
  const MIN = 60_000;
  const now = Date.now();
  const snapshot: Chain = {
    arrival: now + 60 * MIN,
    zone: 'UTC',
    // ⏰ wake at −60min (rang); 🔔 leave at +30min (ahead).
    pills: [
      { id: 'sleep', type: 'none', icon: '😴', name: 'sleep', dur: 60 },
      { id: 'wake', type: 'alarm' },
      { id: 'shower', type: 'none', icon: '🚿', name: 'shower', dur: 90 },
      { id: 'leave', type: 'push' },
      { id: 'commute', type: 'none', icon: '🚇', name: 'commute', dur: 30 },
    ],
  };
  (loadArmedChain as jest.Mock).mockResolvedValueOnce(snapshot);
  let armed: Chain | null = null;
  function ArmedProbe() {
    armed = useArmingChain().armed;
    return null;
  }

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<ArmedProbe />);
  });

  expect(armed).toEqual(snapshot);
  expect(clearArmedChain).not.toHaveBeenCalled();
  expect(AlarmService.armChain).toHaveBeenCalledWith(snapshot, expect.any(String));

  await act(async () => {
    renderer.unmount();
  });
});
