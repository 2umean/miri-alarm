import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateTime } from 'luxon';

import { YMD, instantToYMD } from '../../domain';
import { i18n, t } from '../../i18n';
import { colors, fonts, radii, shadows, spacing } from '../theme';
import { useIsKeyboardShown } from '../keyboard';
import { WheelPicker } from './WheelPicker';

export type ArrivalDate = YMD;

type Props = {
  visible: boolean;
  /** The current arrival instant (or `nowMs` before one exists) — the sheet opens on it. */
  initialInstant: number;
  /** The chain zone (single-zone app: equals the device zone by reconcileAndRoll). */
  zone: string;
  onCancel: () => void;
  onConfirm: (date: ArrivalDate, hour: number, minute: number) => void;
};

const MINUTE_STEP = 5;
const HOURS = Array.from({ length: 24 }, (_, h) => String(h));
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, '0'));
const pad2 = (n: number) => String(n).padStart(2, '0');

const toArrivalDate = (d: Date): ArrivalDate => ({
  // Device-zone getters are correct here: the app is single-zone by design.
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
});

// Floored to start of day, NOT to now: today + an already-passed time must
// stay pickable — it resolves to a past instant and rolls to tomorrow visibly.
const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const sameYMD = (a: YMD, b: YMD) => a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * Arrival picker (marker-pills spec): ONE sheet on both platforms — a date row
 * (📅 + 오늘 state badge) opening the native date picker, and a custom
 * hour/minute wheel that can also be typed into. 취소/설정 commit model.
 */
export function ArrivalPickerSheet({ visible, initialInstant, zone, onCancel, onConfirm }: Props) {
  const [ymd, setYmd] = useState<YMD>(() => instantToYMD(initialInstant, zone));
  const [hour, setHour] = useState(() => DateTime.fromMillis(initialInstant, { zone }).hour);
  const [minute, setMinute] = useState(() => DateTime.fromMillis(initialInstant, { zone }).minute);
  const [iosDateOpen, setIosDateOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const isKeyboardShown = useIsKeyboardShown();

  // Re-seed during RENDER on the visible flip (not in an effect — see the old
  // component's rationale); keyed on `visible` only so a mid-scroll re-render
  // can't reset the wheel under the user.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const d = DateTime.fromMillis(initialInstant, { zone });
      setYmd(instantToYMD(initialInstant, zone));
      setHour(d.hour);
      setMinute(d.minute);
      setIosDateOpen(false);
    }
  }

  // Identity-stable handler for the native pickers (ChainScreen re-renders
  // every 60s; a fresh closure each render must not reach the native module).
  // []-deps is sufficient: the handler touches only setState, no props.
  const onNativeDate = useCallback((e: DateTimePickerEvent, d?: Date) => {
    setIosDateOpen(false);
    if (e.type === 'set' && d) setYmd(toArrivalDate(d));
    // 'dismissed' just closes the date step; the sheet itself stays open.
  }, []);

  const openDatePicker = () => {
    const value = new Date(ymd.year, ymd.month - 1, ymd.day);
    if (Platform.OS === 'android') {
      // One-shot dialog — nothing stays mounted, so the old re-seed hazard is gone.
      DateTimePickerAndroid.open({ value, mode: 'date', minimumDate: startOfToday(), onChange: onNativeDate });
    } else {
      setIosDateOpen((open) => !open);
    }
  };

  const todayBadge = sameYMD(ymd, toArrivalDate(new Date()));
  const dateText = DateTime.fromObject(ymd)
    .setLocale(i18n.locale)
    .toLocaleString({ year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });

  const isOffGrid = minute % MINUTE_STEP !== 0;
  const minuteIndex = Math.min(MINUTES.length - 1, Math.floor(minute / MINUTE_STEP));

  const submitHourText = (text: string) => setHour(Math.min(23, Math.max(0, Number(text))));
  const submitMinuteText = (text: string) => setMinute(Math.min(59, Math.max(0, Number(text))));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      {/* Dim lives on the avoider — see PillEditorSheet's keyboard comment. */}
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior="padding"
        enabled={Platform.OS === 'ios' || isKeyboardShown}
      >
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: spacing.xxl + 2 + insets.bottom }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('arrivalPicker.title')}</Text>
          <Text style={styles.subtitle}>{t('arrivalPicker.subtitle')}</Text>

          <Text style={styles.sectionLabel}>{t('arrivalPicker.dateSection')}</Text>
          <Pressable style={styles.dateRow} onPress={openDatePicker}>
            <Text style={styles.dateIcon}>📅</Text>
            <Text style={styles.dateText}>{dateText}</Text>
            {todayBadge ? (
              <View style={styles.todayBadge}>
                <Text style={styles.todayBadgeText}>{t('day.same-day')}</Text>
              </View>
            ) : null}
          </Pressable>
          {Platform.OS === 'ios' && iosDateOpen ? (
            <DateTimePicker
              value={new Date(ymd.year, ymd.month - 1, ymd.day)}
              mode="date"
              display="inline"
              minimumDate={startOfToday()}
              onChange={onNativeDate}
            />
          ) : null}

          <Text style={styles.sectionLabel}>{t('arrivalPicker.timeSection')}</Text>
          <View style={styles.wheels}>
            <WheelPicker items={HOURS} index={hour} onChange={setHour} onSubmitText={submitHourText} />
            <Text style={styles.wheelColon}>:</Text>
            <WheelPicker
              items={MINUTES}
              index={minuteIndex}
              overrideLabel={isOffGrid ? pad2(minute) : null}
              onChange={(i) => setMinute(i * MINUTE_STEP)}
              onSubmitText={submitMinuteText}
            />
          </View>
          <Text style={styles.wheelHint}>{t('arrivalPicker.wheelHint')}</Text>

          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onCancel}>
              <Text style={styles.cancelText}>{t('editor.cancel')}</Text>
            </Pressable>
            <Pressable style={styles.confirmWrap} onPress={() => onConfirm(ymd, hour, minute)}>
              <LinearGradient
                colors={[colors.sky500, colors.sky700]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirm}
              >
                <Text style={styles.confirmText}>{t('editor.set')}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avoider: { flex: 1, backgroundColor: colors.backdrop },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: colors.skyBgBottom,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.m,
    paddingBottom: spacing.xxl + 2,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: spacing.l },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.extra, marginHorizontal: 2 },
  subtitle: { color: colors.ink2, fontSize: 12, fontFamily: fonts.semi, marginHorizontal: 2, marginTop: spacing.xs, marginBottom: spacing.l },

  sectionLabel: { color: colors.ink2, fontSize: 11, fontFamily: fonts.extra, letterSpacing: 1, marginBottom: spacing.s },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s + 2,
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 13,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m + 1,
    marginBottom: spacing.l,
  },
  dateIcon: { fontSize: 16 },
  dateText: { flex: 1, color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  todayBadge: { backgroundColor: colors.skyBg, borderRadius: radii.pill, paddingVertical: 3, paddingHorizontal: 8 },
  todayBadgeText: { color: colors.sky700, fontSize: 10, fontFamily: fonts.extra },

  wheels: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  wheelColon: { color: colors.ink, fontSize: 24, fontFamily: fonts.clock },
  wheelHint: { color: colors.faint, fontSize: 11, fontFamily: fonts.bold, textAlign: 'center', marginTop: spacing.s, marginBottom: spacing.l },

  actions: { flexDirection: 'row', gap: spacing.s + 2 },
  cancel: { flex: 1, borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center', backgroundColor: colors.disabledBg },
  cancelText: { color: colors.disabledText, fontSize: 15, fontFamily: fonts.extra },
  confirmWrap: { flex: 2, borderRadius: radii.pill, ...shadows.button },
  confirm: { borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center' },
  confirmText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
});
