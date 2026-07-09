import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
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

import { MAX_PILL_MINUTES, PillType, PILL_TYPES } from '../../domain';
import { t } from '../../i18n';
import { composeDuration, formatDuration, splitDuration } from '../format';
import { colors, fonts, radii, shadows, spacing } from '../theme';
import { lastGrapheme } from '../lastGrapheme';

export type PillDraft = { icon: string; name: string; dur: number; type: PillType };

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  initial: PillDraft;
  onCancel: () => void;
  onSubmit: (pill: PillDraft) => void;
  onDelete?: () => void;
};

const QUICK_PICKS = ['🧥', '😴', '🚿', '🍳', '🚇', '☕'];
const STEP = 5; // minute nudge; the H:MM fields allow exact minute entry
const pad2 = (n: number) => String(n).padStart(2, '0');
const onlyDigits = (s: string) => s.replace(/[^0-9]/g, '');

/** Android's keyboardDidHide payload under-reports the visible frame on
    edge-to-edge windows (facebook/react-native#52596), which would leave stale
    avoider padding after dismissal — track visibility to disable it instead. */
function useIsKeyboardShown() {
  const [isShown, setIsShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setIsShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setIsShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return isShown;
}

/** Bottom-sheet pill create/edit (v2 design rows 2A & 3B). */
export function PillEditorSheet({ visible, mode, initial, onCancel, onSubmit, onDelete }: Props) {
  const [icon, setIcon] = useState(initial.icon);
  const [isIconFocused, setIsIconFocused] = useState(false);
  const lastIconRef = useRef(initial.icon); // last non-empty icon, for revert + submit

  const pickIcon = (next: string) => {
    setIcon(next);
    if (next) lastIconRef.current = next;
  };
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<PillType>(initial.type);
  const [dur, setDur] = useState(initial.dur);
  const insets = useSafeAreaInsets();
  const isKeyboardShown = useIsKeyboardShown();
  const seedParts = splitDuration(initial.dur);
  const [hStr, setHStr] = useState(String(seedParts.hours));
  const [mStr, setMStr] = useState(pad2(seedParts.mins));

  const syncFields = (total: number) => {
    const p = splitDuration(total);
    setHStr(String(p.hours));
    setMStr(pad2(p.mins));
  };
  const setTotal = (total: number) => {
    const clamped = Math.min(MAX_PILL_MINUTES, Math.max(0, total));
    setDur(clamped);
    syncFields(clamped);
  };
  const recompute = (h: string, m: string) => {
    const { total, capped } = composeDuration(h, m, MAX_PILL_MINUTES);
    setDur(total);
    if (capped || Number(m || '0') >= 60) syncFields(total);
  };

  const label = t('chainScreen.eventEnds', { name: name || initial.name });
  const submit = () =>
    onSubmit({ icon: icon || lastIconRef.current, name: name.trim() || initial.name, dur, type });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      {/* Edge-to-edge Android never resizes a Modal window for the keyboard
          (adjustResize is ignored), so both platforms need behavior="padding",
          and the avoider must be a full-screen direct child of the Modal for
          its offset math to line up with screen coordinates. On Android the
          avoider is enabled only while the keyboard is up (see hook above);
          iOS's hide path is clean and keeps its willShow/willHide animation. */}
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior="padding"
        enabled={Platform.OS === 'ios' || isKeyboardShown}
      >
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: spacing.xxl + insets.bottom }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            {mode === 'create' ? t('pillEditor.createTitle') : t('pillEditor.editTitle')}
          </Text>

          <View style={styles.quickRow}>
            {QUICK_PICKS.map((e) => (
              <Pressable
                key={e}
                onPress={() => {
                  pickIcon(e);
                  Keyboard.dismiss();
                }}
                style={[styles.emoji, e === icon && styles.emojiActive]}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.fieldRow}>
            <TextInput
              style={[styles.iconInput, isIconFocused && styles.iconInputFocused]}
              value={icon}
              onChangeText={(txt) => pickIcon(lastGrapheme(txt))}
              onFocus={() => setIsIconFocused(true)}
              onBlur={() => {
                setIsIconFocused(false);
                if (!icon) setIcon(lastIconRef.current); // empty is never saved
              }}
              selectTextOnFocus
              returnKeyType="done"
            />
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={t('pillEditor.namePlaceholder')}
              placeholderTextColor={colors.disabledText}
              returnKeyType="done"
            />
            <View style={styles.stepper}>
              <Pressable onPress={() => setTotal(dur - STEP)} style={[styles.step, styles.minus]}>
                <Text style={[styles.stepText, styles.minusText]}>−</Text>
              </Pressable>
              <View style={styles.durFields}>
                <TextInput
                  style={styles.durInput}
                  value={hStr}
                  onChangeText={(txt) => {
                    const v = onlyDigits(txt).slice(0, 2);
                    setHStr(v);
                    recompute(v, mStr);
                  }}
                  onBlur={() => syncFields(dur)}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={styles.durColon}>:</Text>
                <TextInput
                  style={styles.durInput}
                  value={mStr}
                  onChangeText={(txt) => {
                    const v = onlyDigits(txt).slice(0, 2);
                    setMStr(v);
                    recompute(hStr, v);
                  }}
                  onBlur={() => syncFields(dur)}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
              </View>
              <Pressable onPress={() => setTotal(dur + STEP)} style={[styles.step, styles.plus]}>
                <Text style={[styles.stepText, styles.plusText]}>＋</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.sectionLabel}>{t('pillEditor.typeSection')}</Text>
          <View style={styles.segmented}>
            {PILL_TYPES.map((pt) => (
              <Pressable
                key={pt}
                onPress={() => setType(pt)}
                style={[styles.segment, pt === type && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, pt === type && styles.segmentTextActive]}>
                  {t(`pillType.${pt}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.hint, type === 'alarm' && styles.hintAlarm]}>
            <Text style={styles.hintText}>
              {type === 'none'
                ? t('pillEditor.hintNone')
                : type === 'push'
                  ? t('pillEditor.hintPush', { label })
                  : t('pillEditor.hintAlarm')}
            </Text>
          </View>
          {mode === 'edit' && type === 'none' && initial.type !== 'none' ? (
            <View style={styles.warn}>
              <Text style={styles.warnText}>
                ⚠️ {t('pillEditor.warnRowGone', { label: t('chainScreen.eventEnds', { name: initial.name }) })}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {mode === 'edit' ? (
              <Pressable style={styles.delete} onPress={onDelete}>
                <Text style={styles.deleteText}>🗑️ {t('pillEditor.delete')}</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.submitWrap, mode === 'edit' && styles.submitWrapEdit]} onPress={submit}>
              <LinearGradient
                colors={[colors.sky500, colors.sky700]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submit}
              >
                <Text style={styles.submitText}>
                  {mode === 'create' ? t('pillEditor.add') : t('pillEditor.save')}
                </Text>
              </LinearGradient>
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
    paddingBottom: spacing.xxl,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: spacing.m + 2 },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.extra, marginBottom: spacing.m + 2 },

  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.m + 2 },
  emoji: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiActive: { backgroundColor: colors.sky500, borderColor: colors.sky500, ...shadows.focus },
  emojiText: { fontSize: 20 },
  iconInput: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    textAlign: 'center',
    textAlignVertical: 'center', // Android; ignored on iOS
    fontSize: 22,
    padding: 0,
  },
  iconInputFocused: { borderWidth: 2, borderColor: colors.sky500, ...shadows.focus },

  fieldRow: { flexDirection: 'row', gap: spacing.s + 2, marginBottom: spacing.m + 2, alignItems: 'center' },
  nameInput: {
    flex: 1.4,
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 13,
    paddingVertical: spacing.m - 1,
    paddingHorizontal: spacing.m + 1,
    color: colors.ink,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s,
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 13,
    paddingVertical: spacing.s - 2,
  },
  step: { width: 26, height: 26, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  minus: { backgroundColor: colors.skyBg },
  plus: { backgroundColor: colors.sky500 },
  stepText: { fontSize: 16, fontFamily: fonts.extra },
  minusText: { color: colors.sky500 },
  plusText: { color: colors.white },
  durFields: { flexDirection: 'row', alignItems: 'center', minWidth: 52, justifyContent: 'center' },
  durInput: { color: colors.ink, fontSize: 16, fontFamily: fonts.clock, textAlign: 'center', minWidth: 20, padding: 0 },
  durColon: { color: colors.ink, fontSize: 16, fontFamily: fonts.clock, marginHorizontal: 1 },

  sectionLabel: { color: colors.ink2, fontSize: 11, fontFamily: fonts.extra, letterSpacing: 1, marginBottom: spacing.s },
  segmented: { flexDirection: 'row', gap: spacing.xs + 2, backgroundColor: colors.skyBg, borderRadius: 14, padding: spacing.xs, marginBottom: spacing.s + 2 },
  segment: { flex: 1, alignItems: 'center', borderRadius: 11, paddingVertical: spacing.s + 1 },
  segmentActive: { backgroundColor: colors.sky500, ...shadows.focus },
  segmentText: { color: colors.disabledText, fontSize: 13, fontFamily: fonts.extra },
  segmentTextActive: { color: colors.white },

  hint: { backgroundColor: colors.skyBg, borderRadius: 13, paddingVertical: spacing.m - 2, paddingHorizontal: spacing.m + 1, marginBottom: spacing.s },
  hintAlarm: { backgroundColor: colors.warnBg },
  hintText: { color: colors.ink2, fontSize: 12, fontFamily: fonts.bold, lineHeight: 16 },
  warn: { backgroundColor: colors.blushBg, borderRadius: 13, paddingVertical: spacing.m - 2, paddingHorizontal: spacing.m + 1, marginBottom: spacing.s },
  warnText: { color: colors.red, fontSize: 12, fontFamily: fonts.bold, lineHeight: 16 },

  actions: { flexDirection: 'row', gap: spacing.s + 2, marginTop: spacing.m },
  delete: { flex: 1, borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blushBg },
  deleteText: { color: colors.red, fontSize: 14, fontFamily: fonts.extra },
  submitWrap: { flex: 1, borderRadius: radii.pill, ...shadows.button },
  submitWrapEdit: { flex: 2 },
  submit: { borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center' },
  submitText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
});
