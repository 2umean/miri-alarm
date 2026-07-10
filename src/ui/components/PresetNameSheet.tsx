import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { colors, fonts, radii, shadows, spacing } from '../theme';
import { useIsKeyboardShown } from '../keyboard';

const NAME_MAX_LENGTH = 24;

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  initialName: string; // '' for create
  /** Edit mode only: the emoji strip + "이벤트 N개 · 총 H:MM · 홈에서 편집" line. */
  summary?: { icons: string; text: string };
  onCancel: () => void;
  onSave: (name: string) => void; // receives the trimmed name
  onDelete?: () => void; // edit mode — the parent owns the confirm Alert
};

/**
 * Bottom-sheet preset create/rename (design rows 08 & 11). One component,
 * two modes — edit adds the summary strip and the delete action. Mounted
 * fresh per open (parent renders it conditionally), so useState(initialName)
 * is the whole lifecycle. Android back (onRequestClose) cancels, like
 * PillEditorSheet.
 */
export function PresetNameSheet({ visible, mode, initialName, summary, onCancel, onSave, onDelete }: Props) {
  const [name, setName] = useState(initialName);
  const [isFocused, setIsFocused] = useState(false);
  const insets = useSafeAreaInsets();
  const isKeyboardShown = useIsKeyboardShown();
  const trimmed = name.trim();
  const canSave = trimmed.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      {/* Same avoider recipe as PillEditorSheet (see the comment there). */}
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior="padding"
        enabled={Platform.OS === 'ios' || isKeyboardShown}
      >
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: spacing.xxl + insets.bottom }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            {mode === 'create' ? t('preset.createTitle') : t('preset.editTitle')}
          </Text>

          <Text style={styles.label}>{t('preset.nameLabel')}</Text>
          <TextInput
            style={[styles.nameInput, isFocused && styles.nameInputFocused]}
            value={name}
            onChangeText={setName}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={t('preset.nameLabel')}
            placeholderTextColor={colors.disabledText}
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            returnKeyType="done"
          />

          {summary ? (
            <View style={styles.summary}>
              <Text style={styles.summaryIcons} numberOfLines={1}>
                {summary.icons}
              </Text>
              <Text style={styles.summaryText} numberOfLines={1}>
                {summary.text}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {mode === 'edit' && onDelete ? (
              <Pressable style={styles.delete} onPress={onDelete}>
                <Text style={styles.deleteText}>🗑️ {t('pillEditor.delete')}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[
                styles.submitWrap,
                mode === 'edit' && styles.submitWrapEdit,
                !canSave && styles.submitWrapDisabled,
              ]}
              disabled={!canSave}
              accessibilityState={{ disabled: !canSave }}
              onPress={() => canSave && onSave(trimmed)}
            >
              {canSave ? (
                <LinearGradient
                  colors={[colors.sky500, colors.sky700]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submit}
                >
                  <Text style={styles.submitText}>{t('pillEditor.save')}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.submit, styles.submitDisabled]}>
                  <Text style={[styles.submitText, styles.submitTextDisabled]}>
                    {t('pillEditor.save')}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avoider: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(12,24,48,0.34)' },
  sheet: {
    backgroundColor: colors.skyBgBottom,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.m,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: spacing.m + 2 },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.extra, marginBottom: spacing.m + 2 },
  label: { color: colors.ink2, fontSize: 11, fontFamily: fonts.extra, letterSpacing: 1, marginBottom: spacing.s },
  nameInput: {
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 13,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.m + 2,
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 15,
    marginBottom: spacing.m + 2,
  },
  nameInputFocused: { borderWidth: 2, borderColor: colors.sky500, ...shadows.focus },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s + 1,
    backgroundColor: colors.skyBg,
    borderRadius: 13,
    paddingVertical: spacing.m - 1,
    paddingHorizontal: spacing.m + 1,
    marginBottom: spacing.l + 2,
  },
  summaryIcons: { fontSize: 15, letterSpacing: 1 },
  summaryText: { color: colors.ink2, fontSize: 12, fontFamily: fonts.bold, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: spacing.s + 2, marginTop: spacing.xs },
  delete: { flex: 1, borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blushBg },
  deleteText: { color: colors.red, fontSize: 14, fontFamily: fonts.extra },
  submitWrap: { flex: 1, borderRadius: radii.pill, ...shadows.button },
  submitWrapEdit: { flex: 2 },
  submitWrapDisabled: { shadowOpacity: 0, elevation: 0 },
  submit: { borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center' },
  submitDisabled: { backgroundColor: colors.disabledBg },
  submitText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
  submitTextDisabled: { color: colors.disabledText },
});
