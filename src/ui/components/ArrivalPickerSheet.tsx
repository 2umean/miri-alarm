import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { YMD } from '../../domain';
import { t } from '../../i18n';
import { colors, fonts, radii, shadows, spacing } from '../theme';

export type ArrivalDate = YMD;

type Props = {
  visible: boolean;
  /** Seed date+time shown when the picker opens. */
  initial: Date;
  onCancel: () => void;
  onConfirm: (date: ArrivalDate, hour: number, minute: number) => void;
};

const toArrivalDate = (d: Date): ArrivalDate => ({
  // Device-zone getters are correct here: the app is single-zone by design
  // (reconcileAndRoll pins chain.zone to the device zone on every hydration).
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
});

// Floored to start of day, NOT to now: today + an already-passed time must
// stay pickable — it resolves to a past instant and rolls to tomorrow visibly
// (spec §5).
const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Arrival date+time picker (v0.3 arrival-date spec D1). Android chains the two
 * SYSTEM dialogs — date calendar, then time spinner — with no custom UI;
 * cancelling either step aborts the whole edit. iOS keeps the bottom sheet with
 * the wheel in `datetime` mode. Both constrain to today-or-later.
 */
export function ArrivalPickerSheet({ visible, initial, onCancel, onConfirm }: Props) {
  const [value, setValue] = useState<Date>(initial);
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const insets = useSafeAreaInsets();

  // Re-seed and rewind the two-step machine the moment `visible` flips — during
  // RENDER, not in an effect: the Android picker opens its native dialog as a
  // child mount effect, which fires BEFORE a parent effect could reset a stale
  // step, flashing (or dead-tapping) the wrong dialog. Resetting during render
  // discards the stale child before anything mounts. Keyed on visible only —
  // never on initial — so a mid-scroll re-render can't reset the wheel under
  // the user.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setValue(initial);
      setPickedDate(null);
    }
  }

  if (Platform.OS === 'android') {
    if (!visible) return null;
    if (pickedDate === null) {
      return (
        <DateTimePicker
          value={initial}
          mode="date"
          minimumDate={startOfToday()}
          onChange={(e: DateTimePickerEvent, d?: Date) => {
            if (e.type === 'set' && d) setPickedDate(d);
            else onCancel(); // cancel at either step aborts the whole edit
          }}
        />
      );
    }
    return (
      <DateTimePicker
        value={initial}
        mode="time"
        is24Hour
        display="spinner"
        onChange={(e: DateTimePickerEvent, d?: Date) => {
          if (e.type === 'set' && d) {
            onConfirm(toArrivalDate(pickedDate), d.getHours(), d.getMinutes());
          } else onCancel();
        }}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.sheet, { paddingBottom: spacing.xxl + 2 + insets.bottom }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('arrivalPicker.title')}</Text>
        <Text style={styles.subtitle}>{t('arrivalPicker.subtitle')}</Text>
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={value}
            mode="datetime"
            minimumDate={startOfToday()}
            display="spinner"
            onChange={(_e, d?: Date) => d && setValue(d)}
          />
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.cancel} onPress={onCancel}>
            <Text style={styles.cancelText}>{t('editor.cancel')}</Text>
          </Pressable>
          <Pressable
            style={styles.confirmWrap}
            onPress={() => onConfirm(toArrivalDate(value), value.getHours(), value.getMinutes())}
          >
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.skyBgBottom,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.m,
    paddingBottom: spacing.xxl + 2,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: spacing.l,
  },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.extra, marginHorizontal: 2 },
  subtitle: {
    color: colors.ink2,
    fontSize: 12,
    fontFamily: fonts.semi,
    marginHorizontal: 2,
    marginTop: spacing.xs,
    marginBottom: spacing.l,
  },
  pickerWrap: { alignItems: 'center', marginBottom: spacing.l },
  actions: { flexDirection: 'row', gap: spacing.s + 2 },
  cancel: {
    flex: 1,
    borderRadius: radii.pill,
    paddingVertical: spacing.l - 1,
    alignItems: 'center',
    backgroundColor: colors.disabledBg,
  },
  cancelText: { color: colors.disabledText, fontSize: 15, fontFamily: fonts.extra },
  confirmWrap: { flex: 2, borderRadius: radii.pill, ...shadows.button },
  confirm: { borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center' },
  confirmText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
});
