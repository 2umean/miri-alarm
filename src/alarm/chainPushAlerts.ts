import { Chain, ChainComputed, isMarkerPill, labelSourceFor, toLocalClock } from '../domain';
import { t } from '../i18n';

/**
 * v2 companion push alerts. Schedules a best-effort push for every 'push' MARKER.
 * Alarm pills are excluded (their ids are in `excludePillIds`) because Phase 3
 * routes every alarm pill through the OS-guaranteed native module. Best-effort by
 * design: expo-notifications is imported dynamically so a dev client built
 * without it degrades gracefully.
 */
const CHANNEL_ID = 'chain-alerts';

export async function scheduleChainPush(
  chain: Chain,
  computed: ChainComputed,
  excludePillIds?: Set<string>,
  startLabel?: string,
): Promise<void> {
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

    const arrival = toLocalClock(computed.arrival, chain.zone);

    const pills = computed.items.map((it) => it.pill);
    for (let index = 0; index < computed.items.length; index += 1) {
      const it = computed.items[index];
      if (!isMarkerPill(it.pill)) continue; // events are timing only, no alert
      if (excludePillIds?.has(it.pill.id)) continue; // fired by a native strong alarm instead
      if (it.endAt <= Date.now()) continue; // already past (best-effort, skip)
      const source = labelSourceFor(pills, index);
      const label = source ? t('chainScreen.eventEnds', { name: source.name }) : (startLabel ?? '');
      await Notifications.scheduleNotificationAsync({
        content: {
          title: t('alerts.pill.title', { label }),
          body: t('alerts.pill.body', { time: toLocalClock(it.endAt, chain.zone), arrival }),
          sound: 'default',
        },
        // Keyed by stable pill id — endAt is not unique (duplicate markers share one).
        identifier: `chain-${it.pill.id}`,
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
