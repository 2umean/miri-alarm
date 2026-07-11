import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChainComputed, ComputedItem, toLocalClock } from '../../domain';
import { t } from '../../i18n';
import { formatDuration, formatMonthDay } from '../format';
import { colors, fonts, pillStyle, radii, shadows, spacing } from '../theme';

type Props = {
  computed: ChainComputed;
  zone: string;
  onPressPill: (id: string) => void;
  onPressAnchor: () => void;
};

/**
 * Renders the v2 chain (Chain.dc.html): a bedtime cap, one card per pill (styled
 * by type, with a trailing event row for push/alarm), and the arrival anchor.
 * Purely presentational — all times come pre-computed from the engine.
 */
export function ChainList({ computed, zone, onPressPill, onPressAnchor }: Props) {
  const clock = (ms: number) => toLocalClock(ms, zone);
  const monthDay = (ms: number) => formatMonthDay(ms, zone);

  return (
    <View style={styles.list}>
      {computed.items.length > 0 ? (
        <View style={styles.cap}>
          <Text style={styles.capIcon}>🛏</Text>
          <Text style={styles.capLabel}>{t('chainScreen.bedtime')}</Text>
          <Text style={styles.capTime}>{clock(computed.start)}</Text>
        </View>
      ) : null}

      {computed.items.map((item) => (
        <PillRow key={item.pill.id} item={item} clock={clock} monthDay={monthDay} onPress={() => onPressPill(item.pill.id)} />
      ))}

      <Pressable style={styles.anchor} onPress={onPressAnchor}>
        <Text style={styles.anchorIcon}>📍</Text>
        <Text style={styles.anchorLabel}>{t('chainScreen.anchorLabel')}</Text>
        <Text style={styles.anchorDate}>{monthDay(computed.arrival)}</Text>
        <Text style={styles.anchorTime}>{clock(computed.arrival)}</Text>
      </Pressable>
    </View>
  );
}

function PillRow({
  item,
  clock,
  monthDay,
  onPress,
}: {
  item: ComputedItem;
  clock: (ms: number) => string;
  monthDay: (ms: number) => string;
  onPress: () => void;
}) {
  const { pill } = item;
  const isEvent = pill.type === 'push' || pill.type === 'alarm';
  const sx = pill.type === 'none' ? null : pillStyle[pill.type];

  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          styles.card,
          sx
            ? { backgroundColor: sx.cardBg, borderWidth: 1.5, borderColor: sx.cardBorder, borderLeftWidth: 4, borderLeftColor: sx.accent }
            : styles.cardNone,
        ]}
      >
        <Text style={styles.cardIcon}>{pill.icon}</Text>
        <Text style={styles.cardName}>{pill.name}</Text>
        <Text style={[styles.cardDur, { color: sx ? sx.durText : colors.ink2 }]}>
          {formatDuration(pill.dur)}
        </Text>
      </View>

      {isEvent && sx ? (
        <>
          <View style={[styles.connector, { backgroundColor: sx.accent }]} />
          <View
            style={[
              styles.eventRow,
              pill.type === 'alarm'
                ? { borderWidth: 2, borderColor: sx.eventBorder, ...shadows.focus }
                : { borderWidth: 1.5, borderColor: sx.eventBorder, ...shadows.bubble },
            ]}
          >
            <Text style={styles.eventIcon}>{sx.eventIcon}</Text>
            <Text style={styles.eventLabel}>
              {t('chainScreen.eventEnds', { name: pill.name })}
            </Text>
            <View style={[styles.badge, { backgroundColor: sx.badgeBg }]}>
              <Text style={styles.badgeText}>{t(`chainScreen.badge.${pill.type}`)}</Text>
            </View>
            <View style={styles.eventSpacer} />
            <Text style={styles.eventDate}>{monthDay(item.endAt)}</Text>
            <Text style={[styles.eventTime, { color: sx.eventTime }]}>{clock(item.endAt)}</Text>
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

const ICON_W = 22;

const styles = StyleSheet.create({
  list: { gap: spacing.s - 1 },
  cap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, marginLeft: spacing.xs },
  capIcon: { fontSize: 12 },
  capLabel: { color: colors.faint, fontSize: 11, fontFamily: fonts.bold },
  capTime: { color: colors.faint, fontSize: 12, fontFamily: fonts.clock },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s + 2,
    borderRadius: radii.bubble - 4,
    paddingVertical: spacing.m - 1,
    paddingHorizontal: spacing.l - 2,
  },
  cardNone: { backgroundColor: colors.bubble, ...shadows.bubble },
  cardIcon: { fontSize: 18, width: ICON_W, textAlign: 'center' },
  cardName: { flex: 1, color: colors.ink, fontFamily: fonts.bold, fontSize: 13.5 },
  cardDur: { fontSize: 13, fontFamily: fonts.clock },

  connector: { width: 2, height: 9, marginLeft: 24 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    backgroundColor: colors.bubble,
    borderRadius: radii.bubble - 6,
    paddingVertical: spacing.s + 1,
    paddingHorizontal: spacing.m + 1,
  },
  eventIcon: { fontSize: 16, width: 20, textAlign: 'center' },
  eventLabel: { color: colors.ink, fontFamily: fonts.extra, fontSize: 13.5 },
  badge: { borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing.s },
  badgeText: { color: colors.white, fontSize: 9, fontFamily: fonts.extra },
  eventSpacer: { flex: 1 },
  eventDate: { color: colors.faint, fontSize: 11, fontFamily: fonts.clock },
  eventTime: { fontSize: 16, fontFamily: fonts.clock },

  anchor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s + 2,
    backgroundColor: colors.amber,
    borderRadius: radii.bubble - 4,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l - 2,
    ...shadows.button,
    shadowColor: colors.amber,
  },
  anchorIcon: { fontSize: 18, width: ICON_W, textAlign: 'center' },
  anchorLabel: { flex: 1, color: colors.ink, fontFamily: fonts.extra, fontSize: 14 },
  anchorDate: { color: colors.ink2, fontSize: 12, fontFamily: fonts.clock },
  anchorTime: { color: colors.ink, fontSize: 19, fontFamily: fonts.clock },
});
