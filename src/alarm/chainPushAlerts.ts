import { Chain, computeChain, toLocalClock } from '../domain';
import { t } from '../i18n';

/**
 * v2 companion push alerts. Schedules a push for every event-bearing pill
 * (push, and — as a Phase-2 best-effort bridge — any alarm pill NOT taken by the
 * single native strong alarm). Phase 3 routes every alarm pill through the native
 * module instead. Best-effort by design: expo-notifications is imported
 * dynamically so a dev client built without it degrades gracefully.
 */
const CHANNEL_ID = 'chain-alerts';

export async function scheduleChainPush(chain: Chain, nativeAlarmInstant?: number): Promise<void> {
  try {
    const Notifications = await import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Schedule alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });

    // Single active schedule — re-arming replaces any previous chain alerts.
    await Notifications.cancelAllScheduledNotificationsAsync();

    const computed = computeChain(chain);
    if (!computed) return;
    const arrival = toLocalClock(computed.arrival, chain.zone);

    for (const it of computed.items) {
      if (it.pill.type === 'none') continue; // timing only, no alert
      if (it.endAt === nativeAlarmInstant) continue; // the native strong alarm fires this one
      if (it.endAt <= Date.now()) continue; // already past (best-effort, skip)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('alerts.pill.title', { name: it.pill.name }),
          body: t('alerts.pill.body', { time: toLocalClock(it.endAt, chain.zone), arrival }),
          sound: 'default',
        },
        identifier: `chain-${it.endAt}`,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: it.endAt,
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch (e) {
    console.warn('[chainPushAlerts] unavailable (alerts not scheduled):', e);
  }
}

export async function cancelChainPush(): Promise<void> {
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Module unavailable — nothing was scheduled either.
  }
}
