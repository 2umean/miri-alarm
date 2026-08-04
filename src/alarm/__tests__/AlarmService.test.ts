import { DateTime } from 'luxon';

import type { Chain, EventPill, MarkerPill } from '../../domain';

jest.mock('../../../modules/schedularm-alarm', () => ({
  scheduleAlarms: jest.fn().mockResolvedValue(undefined),
  dismissAll: jest.fn(),
  consumeMissedAlarms: jest.fn(() => []),
  canScheduleExactAlarms: jest.fn(() => true),
  getPermissionsStatus: jest.fn(),
  getManufacturer: jest.fn(() => ''),
  getAuthorizationState: jest.fn(() => 'authorized'),
  requestPermissions: jest.fn().mockResolvedValue(undefined),
  requestOverlayPermission: jest.fn().mockResolvedValue(undefined),
  requestDisableBatteryOptimization: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../chainPushAlerts', () => ({
  scheduleChainPush: jest.fn().mockResolvedValue(undefined),
  cancelChainPush: jest.fn().mockResolvedValue(undefined),
}));

import * as native from '../../../modules/schedularm-alarm';
import { AlarmService } from '../AlarmService';

const event = (id: string, dur: number): EventPill => ({ id, type: 'none', icon: '⬜', name: id, dur });
const marker = (id: string, type: 'push' | 'alarm' = 'alarm'): MarkerPill => ({ id, type });

const chainArriving = (arrival: number): Chain => ({
  arrival,
  zone: 'UTC',
  pills: [event('sleep', 60), marker('wake', 'alarm'), event('commute', 30)],
});

const inHours = (h: number) =>
  DateTime.now().toUTC().plus({ hours: h }).toMillis();

beforeEach(() => {
  jest.clearAllMocks();
});

// The fake-armed hole: the UI's arm gate runs on a nowMs that ticks every 60s,
// so the last alarm instant can pass between render and tap. planNativeAlarms
// then filters every alarm out and the old code resolved WITHOUT scheduling
// anything — the caller marked the chain armed while nothing would ever ring.
test('armChain rejects when the chain has alarm pills but every instant already passed', async () => {
  await expect(
    AlarmService.armChain(chainArriving(inHours(-2)), 'start'),
  ).rejects.toThrow();
  expect(native.scheduleAlarms).not.toHaveBeenCalled();
});

test('armChain schedules natively when an alarm instant is still in the future', async () => {
  await expect(
    AlarmService.armChain(chainArriving(inHours(2)), 'start'),
  ).resolves.toBeUndefined();
  expect(native.scheduleAlarms).toHaveBeenCalledTimes(1);
});

// A push-only chain legitimately plans zero native alarms — that must stay a
// resolve (companion pushes still schedule), not become a spurious rejection.
test('armChain still resolves for a chain with no alarm pills at all', async () => {
  const pushOnly: Chain = {
    arrival: inHours(-2),
    zone: 'UTC',
    pills: [event('sleep', 60), marker('leave', 'push')],
  };
  await expect(AlarmService.armChain(pushOnly, 'start')).resolves.toBeUndefined();
  expect(native.scheduleAlarms).not.toHaveBeenCalled();
});

// iOS never re-shows a denied AlarmKit prompt: requestPermissions resolves
// instantly with nothing on screen, so the onboarding "enable" button was a
// permanent dead-end. Once denied, the button must route to Settings instead.
test('requestCritical opens Settings when AlarmKit auth is already denied (iOS)', async () => {
  const { Linking } = require('react-native');
  const openSettings = jest.spyOn(Linking, 'openSettings');
  (native.getAuthorizationState as jest.Mock).mockReturnValue('denied');

  await AlarmService.requestCritical();

  expect(openSettings).toHaveBeenCalledTimes(1);
  expect(native.requestPermissions).not.toHaveBeenCalled();
});

test('requestCritical shows the native prompt while auth is still undetermined', async () => {
  const { Linking } = require('react-native');
  const openSettings = jest.spyOn(Linking, 'openSettings');
  (native.getAuthorizationState as jest.Mock).mockReturnValue('notDetermined');

  await AlarmService.requestCritical();

  expect(native.requestPermissions).toHaveBeenCalledTimes(1);
  expect(openSettings).not.toHaveBeenCalled();
});
