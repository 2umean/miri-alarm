import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { PRIVACY_POLICY_URL } from '../legal';
import { colors, fonts, radii, shadows, spacing } from '../theme';

type Props = {
  visible: boolean;
  initialGranted: boolean;
  /** Backdrop / Android back. The PARENT decides what a dismissal means
   * (one-time prompt records 'denied'; footer-opened keeps current state). */
  onCancel: () => void;
  onSave: (granted: boolean) => void;
};

/**
 * Bottom-sheet consent editor (spec: one toggle, both SDKs). Mounted fresh per
 * open — the parent renders it conditionally, so useState(initialGranted) is
 * the whole lifecycle, same recipe as PresetNameSheet.
 */
export function ConsentSheet({ visible, initialGranted, onCancel, onSave }: Props) {
  const [granted, setGranted] = useState(initialGranted);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: spacing.xxl + insets.bottom }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('consent.title')}</Text>
          <Text style={styles.body}>{t('consent.body')}</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            style={styles.policyLink}
          >
            <Text style={styles.policyLinkText}>{t('legal.privacyPolicy')} ↗</Text>
          </Pressable>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: granted }}
            onPress={() => setGranted((v) => !v)}
            style={[styles.toggle, granted && styles.toggleOn]}
          >
            <Text style={[styles.toggleText, granted && styles.toggleTextOn]}>
              {granted ? `✓ ${t('consent.toggleOn')}` : `○ ${t('consent.toggleOff')}`}
            </Text>
          </Pressable>
          <Pressable style={styles.submitWrap} onPress={() => onSave(granted)}>
            <LinearGradient
              colors={[colors.sky500, colors.sky700]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submit}
            >
              <Text style={styles.submitText}>{t('consent.save')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.backdrop },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: colors.skyBgBottom,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.m,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: spacing.m + 2 },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.extra, marginBottom: spacing.s },
  body: { color: colors.ink2, fontSize: 12, fontFamily: fonts.semi, lineHeight: 18, marginBottom: spacing.l },
  policyLink: { alignSelf: 'flex-start', paddingVertical: spacing.s, marginBottom: spacing.s },
  policyLinkText: { color: colors.sky700, fontSize: 12, fontFamily: fonts.bold },
  toggle: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingVertical: spacing.s + 1,
    paddingHorizontal: spacing.xl - 2,
    marginBottom: spacing.l + 2,
  },
  toggleOn: { backgroundColor: colors.mintBg, borderColor: colors.green },
  toggleText: { color: colors.ink2, fontSize: 13, fontFamily: fonts.extra },
  toggleTextOn: { color: colors.green },
  submitWrap: { borderRadius: radii.pill, ...shadows.button },
  submit: { borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center' },
  submitText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
});
