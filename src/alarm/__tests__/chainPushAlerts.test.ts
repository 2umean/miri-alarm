import { DateTime } from 'luxon';

import type { Chain, EventPill, MarkerPill } from '../../domain';

const mockNotifications = {
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
};
jest.mock('expo-notifications', () => mockNotifications, { virtual: true });

import { computeChain } from '../../domain';
import { i18n } from '../../i18n';
import { scheduleChainPush } from '../chainPushAlerts';

const event = (id: string, dur: number): EventPill => ({ id, type: 'none', icon: '⬜', name: id, dur });
const marker = (id: string, type: 'push' | 'alarm' = 'push'): MarkerPill => ({ id, type });

const chain: Chain = {
  arrival: DateTime.now().toUTC().plus({ hours: 3 }).toMillis(),
  zone: 'UTC',
  pills: [event('sleep', 60), marker('leave', 'push')],
};

// The push is a bare "which event just ended" announcement (🔔 밥 종료). A body
// like "13:20에 나가면 …" reads as a departure order, which is wrong for
// mid-chain markers — and the OS shows the delivery time anyway, so no body.
test('the push announces only which event ended — no departure body', async () => {
  const prevLocale = i18n.locale;
  i18n.locale = 'ko';
  try {
    const computed = computeChain(chain)!;
    await scheduleChainPush(computed);

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: { title: '🔔 sleep 종료', sound: 'default' },
      }),
    );
  } finally {
    i18n.locale = prevLocale;
  }
});

// The channel name is user-visible in Android's system notification settings.
// It must come from the catalog: re-registration on every arm renames the
// channel, so Korean users see 일정 알림 instead of hardcoded English.
test('the notification channel name is localized, not hardcoded English', async () => {
  const prevLocale = i18n.locale;
  i18n.locale = 'ko';
  try {
    const computed = computeChain(chain)!;
    await scheduleChainPush(computed);

    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'chain-alerts',
      expect.objectContaining({ name: '일정 알림' }),
    );
  } finally {
    i18n.locale = prevLocale;
  }
});
