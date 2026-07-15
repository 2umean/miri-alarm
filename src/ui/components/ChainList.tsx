import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ChainComputed,
  ComputedItem,
  EventPill,
  MarkerPill,
  isMarkerPill,
  labelSourceFor,
  toLocalClock,
} from '../../domain';
import { t } from '../../i18n';
import { formatDuration, formatMonthDay } from '../format';
import { colors, fonts, pillStyle, radii, shadows, spacing } from '../theme';

type Props = {
  computed: ChainComputed;
  zone: string;
  /** "{preset} 시작" — the start row text AND the orphan-marker fallback label. */
  startLabel: string;
  onPressPill: (id: string) => void;
  onPressAnchor: () => void;
};

/**
 * Renders the v3 chain: a start row (when the whole preset begins), one card
 * per event, a bordered 🔔/⏰ row per marker (labels derived from position),
 * and the arrival anchor. Purely presentational — all times pre-computed.
 */
export function ChainList({ computed, zone, startLabel, onPressPill, onPressAnchor }: Props) {
  const clock = (ms: number) => toLocalClock(ms, zone);
  const monthDay = (ms: number) => formatMonthDay(ms, zone);
  const pills = computed.items.map((it) => it.pill);

  return (
    <View style={styles.list}>
      {computed.items.length > 0 ? (
        <View style={styles.startRow}>
          <View style={styles.startDot} />
          <Text style={styles.startLabel} numberOfLines={1}>{startLabel}</Text>
          <Text style={styles.startDate}>{monthDay(computed.start)}</Text>
          <Text style={styles.startTime}>{clock(computed.start)}</Text>
        </View>
      ) : null}

      {computed.items.map((item, index) =>
        isMarkerPill(item.pill) ? (
          <MarkerRow
            key={item.pill.id}
            item={item}
            marker={item.pill}
            label={labelSourceFor(pills, index)?.name ?? null}
            startLabel={startLabel}
            clock={clock}
            monthDay={monthDay}
            onPress={() => onPressPill(item.pill.id)}
          />
        ) : (
          <EventRow
            key={item.pill.id}
            pill={item.pill}
            onPress={() => onPressPill(item.pill.id)}
          />
        ),
      )}

      <Pressable style={styles.anchor} onPress={onPressAnchor}>
        <Text style={styles.anchorIcon}>📍</Text>
        <Text style={styles.anchorLabel}>{t('chainScreen.anchorLabel')}</Text>
        <Text style={styles.anchorDate}>{monthDay(computed.arrival)}</Text>
        <Text style={styles.anchorTime}>{clock(computed.arrival)}</Text>
      </Pressable>
    </View>
  );
}

function EventRow({ pill, onPress }: { pill: EventPill; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <View style={[styles.card, styles.cardNone]}>
        <Text style={styles.cardIcon}>{pill.icon}</Text>
        <Text style={styles.cardName}>{pill.name}</Text>
        <Text style={[styles.cardDur, { color: colors.ink2 }]}>{formatDuration(pill.dur)}</Text>
      </View>
    </Pressable>
  );
}

function MarkerRow({
  item,
  marker,
  label,
  startLabel,
  clock,
  monthDay,
  onPress,
}: {
  item: ComputedItem;
  marker: MarkerPill;
  /** Preceding event name, or null for an orphan (falls back to startLabel). */
  label: string | null;
  startLabel: string;
  clock: (ms: number) => string;
  monthDay: (ms: number) => string;
  onPress: () => void;
}) {
  const sx = pillStyle[marker.type];
  const text = label != null ? t('chainScreen.eventEnds', { name: label }) : startLabel;
  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          styles.eventRow,
          marker.type === 'alarm'
            ? { borderWidth: 2, borderColor: sx.eventBorder, ...shadows.focus }
            : { borderWidth: 1.5, borderColor: sx.eventBorder, ...shadows.bubble },
        ]}
      >
        <Text style={styles.eventIcon}>{sx.eventIcon}</Text>
        <Text style={styles.eventLabel} numberOfLines={1}>{text}</Text>
        <View style={[styles.badge, { backgroundColor: sx.badgeBg }]}>
          <Text style={styles.badgeText}>{t(`chainScreen.badge.${marker.type}`)}</Text>
        </View>
        <View style={styles.eventSpacer} />
        <Text style={styles.eventDate}>{monthDay(item.endAt)}</Text>
        <Text style={[styles.eventTime, { color: sx.eventTime }]}>{clock(item.endAt)}</Text>
      </View>
    </Pressable>
  );
}

const ICON_W = 22;

const styles = StyleSheet.create({
  list: { gap: spacing.s - 1 },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginLeft: spacing.xs, marginBottom: 2 },
  startDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.faint }, // hollow dot (design Chain component)
  startLabel: { flexShrink: 1, color: colors.faint, fontSize: 11, fontFamily: fonts.bold },
  startDate: { color: colors.faint, fontSize: 11, fontFamily: fonts.clock, marginLeft: 'auto' as const },
  startTime: { color: colors.faint, fontSize: 12, fontFamily: fonts.clock },

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
  // The spacer (not the label) does the flex-grow, so the badge hugs the name.
  // flexShrink + numberOfLines makes the label the ONLY shrinkable child — RN's
  // default flexShrink is 0 — so a long name truncates with … instead of pushing
  // the badge, date and clock off-row.
  eventLabel: { flexShrink: 1, color: colors.ink, fontFamily: fonts.extra, fontSize: 13.5 },
  badge: { borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing.s },
  badgeText: { color: colors.white, fontSize: 9, fontFamily: fonts.extra },
  eventSpacer: { flex: 1 },
  eventDate: { color: colors.ink2, fontSize: 11, fontFamily: fonts.clock },
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
  anchorDate: { color: colors.ink, fontSize: 12, fontFamily: fonts.clock },
  anchorTime: { color: colors.ink, fontSize: 19, fontFamily: fonts.clock },
});
