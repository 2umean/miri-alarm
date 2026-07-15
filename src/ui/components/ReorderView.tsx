import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Pill, isMarkerPill, labelSourceFor, pillDur } from '../../domain';
import { t } from '../../i18n';
import { formatDuration } from '../format';
import { colors, fonts, pillStyle, radii, shadows, spacing } from '../theme';

type Props = {
  visible: boolean;
  pills: Pill[];
  startLabel: string;
  onClose: () => void;
  onReorder: (from: number, to: number) => void;
};

const ROW_H = 58; // fixed row height (incl. gap) — keeps the reorder math simple

/**
 * Long-press drag-to-reorder (v2 design row 4). Rows are laid out at fixed
 * heights; the dragged row follows the finger while the others shift by one slot
 * as it crosses them. Commits via onReorder(from, to) on release.
 *
 * NOTE: the gesture interaction is device-only — it cannot be exercised by tsc
 * or jest, so it needs a manual pass on a real build.
 */
export function ReorderView({ visible, pills, startLabel, onClose, onReorder }: Props) {
  const draggingIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const total = pills.reduce((sum, p) => sum + pillDur(p), 0); // 총 준비 시간 = events only
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* A RN Modal renders in a SEPARATE native view tree, outside the app-root
          GestureHandlerRootView — so gestures inside it are dead unless the modal
          content has its OWN GestureHandlerRootView. Without this, the drag never
          activates. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.screen, { paddingTop: insets.top + spacing.m }]}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.back}>‹</Text>
            </Pressable>
            <Text style={styles.title}>{t('chainScreen.reorderTitle')}</Text>
          </View>
          <Text style={styles.hint}>{t('chainScreen.reorderHint')}</Text>

          <View style={{ height: pills.length * ROW_H }}>
            {pills.map((pill, index) => (
              <Row
                key={pill.id}
                pill={pill}
                markerLabel={
                  isMarkerPill(pill)
                    ? (() => {
                        const source = labelSourceFor(pills, index);
                        return source ? t('chainScreen.eventEnds', { name: source.name }) : startLabel;
                      })()
                    : null
                }
                index={index}
                count={pills.length}
                draggingIndex={draggingIndex}
                dragY={dragY}
                onReorder={onReorder}
              />
            ))}
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.m }]}>
            <Text style={styles.footerLabel}>{t('chainScreen.totalPrep')}</Text>
            <Text style={styles.footerValue}>{formatDuration(total)}</Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Row({
  pill,
  markerLabel,
  index,
  count,
  draggingIndex,
  dragY,
  onReorder,
}: {
  pill: Pill;
  markerLabel: string | null;
  index: number;
  count: number;
  draggingIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  onReorder: (from: number, to: number) => void;
}) {
  const pan = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart(() => {
      draggingIndex.value = index;
      dragY.value = 0;
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
    })
    .onEnd(() => {
      // Inline the clamp with Math built-ins — a worklet must NOT call a plain
      // (non-worklet) helper on the UI thread, which crashes the app on release.
      const raw = index + Math.round(dragY.value / ROW_H);
      const target = Math.min(count - 1, Math.max(0, raw));
      if (target !== index) runOnJS(onReorder)(index, target);
      draggingIndex.value = -1;
      dragY.value = 0;
    });

  const animated = useAnimatedStyle(() => {
    const active = draggingIndex.value;
    if (active === index) {
      return { transform: [{ translateY: dragY.value }, { scale: 1.03 }], zIndex: 10, elevation: 10 };
    }
    if (active === -1) return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 1, elevation: 1 };
    // A non-active row yields a slot as the dragged row crosses it.
    const target = active + Math.round(dragY.value / ROW_H);
    let shift = 0;
    if (active < index && index <= target) shift = -ROW_H;
    else if (target <= index && index < active) shift = ROW_H;
    return { transform: [{ translateY: withTiming(shift, { duration: 140 }) }, { scale: 1 }], zIndex: 1, elevation: 1 };
  });

  const badge =
    pill.type === 'alarm'
      ? { bg: colors.warnBg, fg: colors.alarmAccentText, text: `⏰ ${t('chainScreen.badge.alarm')}` }
      : pill.type === 'push'
        ? { bg: colors.skyBg, fg: colors.sky700, text: `🔔 ${t('chainScreen.badge.push')}` }
        : null;

  return (
    <Animated.View style={[styles.rowAbsolute, { top: index * ROW_H }, animated]}>
      <GestureDetector gesture={pan}>
        {isMarkerPill(pill) ? (
          <View style={[styles.row, styles.markerRow, { borderColor: pillStyle[pill.type].eventBorder }]}>
            <Text style={styles.handle}>⋮⋮</Text>
            <Text style={styles.rowIcon}>{pillStyle[pill.type].eventIcon}</Text>
            <Text style={styles.rowName} numberOfLines={1}>{markerLabel}</Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.text}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.row}>
            <Text style={styles.handle}>⋮⋮</Text>
            <Text style={styles.rowIcon}>{pill.icon}</Text>
            <Text style={styles.rowName}>{pill.name}</Text>
            <Text style={styles.rowDur}>{formatDuration(pill.dur)}</Text>
          </View>
        )}
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.skyBgBottom, paddingHorizontal: spacing.xl, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, marginBottom: spacing.m + 2 },
  back: { color: colors.sky500, fontSize: 22, fontFamily: fonts.extra },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.extra },
  hint: { color: colors.faint, fontSize: 11, fontFamily: fonts.bold, marginBottom: spacing.m, marginHorizontal: 2 },

  rowAbsolute: { position: 'absolute', left: 0, right: 0, height: ROW_H, paddingBottom: spacing.s + 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s + 2,
    backgroundColor: colors.bubble,
    borderRadius: radii.bubble - 2,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m,
    ...shadows.bubble,
  },
  markerRow: { borderWidth: 1.5, backgroundColor: colors.bubble },
  handle: { color: colors.faint, fontSize: 15, letterSpacing: -2 },
  rowIcon: { fontSize: 18 },
  rowName: { flex: 1, color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  badge: { borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing.s - 1 },
  badgeText: { fontSize: 9, fontFamily: fonts.extra },
  rowDur: { color: colors.ink, fontSize: 14, fontFamily: fonts.clock },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xs, paddingTop: spacing.l },
  footerLabel: { color: colors.ink2, fontSize: 13, fontFamily: fonts.bold },
  footerValue: { color: colors.ink, fontSize: 16, fontFamily: fonts.clock },
});
