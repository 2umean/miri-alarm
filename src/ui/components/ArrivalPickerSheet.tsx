import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { colors, fonts, radii, shadows, spacing } from '../theme';

type Props = {
  visible: boolean;
  /** Seed clock shown when the picker opens. */
  initial: Date;
  onCancel: () => void;
  onConfirm: (hour: number, minute: number) => void;
};

/**
 * Bottom-sheet arrival picker (v2 design row 1B). On Android the picker is a
 * system dialog with its own buttons, so it renders bare (wrapping it in our
 * sheet would stack two dialogs) — same split as the v1 TimeEditorModal.
 */
export function ArrivalPickerSheet({ visible, initial, onCancel, onConfirm }: Props) {
  const [value, setValue] = useState<Date>(initial);
  const insets = useSafeAreaInsets();

  // The sheet stays mounted (visible toggles), so re-seed the spinner on each
  // open. Keyed on `visible` only — not `initial` — so scrolling while open
  // isn't reset out from under the user.
  useEffect(() => {
    if (visible) setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={initial}
        mode="time"
        is24Hour
        display="spinner"
        onChange={(e: DateTimePickerEvent, d?: Date) => {
          if (e.type === 'set' && d) onConfirm(d.getHours(), d.getMinutes());
          else onCancel();
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
            mode="time"
            is24Hour
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
            onPress={() => onConfirm(value.getHours(), value.getMinutes())}
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
