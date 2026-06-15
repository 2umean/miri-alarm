import { Schedule, reverseCalc, toLocalClock } from '../domain';
import { t } from '../i18n';

/**
 * Companion push alerts for the non-wake chain times (spec §7: leave-home =
 * notification, fall-asleep = bedtime nudge). Best-effort by design — the
 * safety-critical wake alarm lives in the bespoke native module, never here.
 *
 * expo-notifications is imported dynamically so a dev client built without its
 * native module degrades gracefully (alerts just don't schedule) instead of
 * crashing the whole app at JS load.
 */

const CHANNEL_ID = 'chain-alerts';

export async function scheduleChainAlerts(schedule: Schedule): Promise<void> {
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

    const d = reverseCalc(schedule);
    const alerts = [
      {
        at: d.fallAsleep,
        title: t('alerts.fallAsleep.title'),
        body: t('alerts.fallAsleep.body', { wake: toLocalClock(d.wake, schedule.zone) }),
      },
      {
        at: d.leaveHome,
        title: t('alerts.leaveHome.title'),
        body: t('alerts.leaveHome.body', { leave: toLocalClock(d.leaveHome, schedule.zone) }),
      },
    ];

    for (const alert of alerts) {
      if (alert.at <= Date.now()) continue; // already past (e.g. fall-asleep last night)
      await Notifications.scheduleNotificationAsync({
        content: { title: alert.title, body: alert.body, sound: 'default' },
        identifier: `chain-${alert.at}`,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: alert.at,
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch (e) {
    console.warn('[chainAlerts] unavailable (alerts not scheduled):', e);
  }
}

export async function cancelChainAlerts(): Promise<void> {
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Module unavailable — nothing was scheduled either.
  }
}
