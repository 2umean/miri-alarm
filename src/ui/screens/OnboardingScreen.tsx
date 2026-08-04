import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlarmService } from '../../alarm/AlarmService';
import { AlarmHealth } from '../../alarm/alarmHealth';
import { t } from '../../i18n';
import { getConsent, setConsent, track } from '../../telemetry';
import { PRIVACY_POLICY_URL } from '../legal';
import { colors, fonts, radii, shadows, spacing } from '../theme';

type Props = { onDone: () => void };

type StepProps = {
  title: string;
  desc: string;
  done: boolean;
  /** 'amber' marks the OEM-required battery step; others use sky. */
  accent?: 'sky' | 'amber';
  required?: boolean;
  onFix: () => void;
};

function Step({ title, desc, done, accent = 'sky', required = false, onFix }: StepProps) {
  if (done) {
    return (
      <View style={[styles.step, styles.stepDone]}>
        <Text style={styles.stepDoneTitle}>✓ {title}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.step, accent === 'amber' ? styles.stepAmber : styles.stepSky]}>
      <View style={styles.stepTitleRow}>
        <Text style={styles.stepTitle}>○ {title}</Text>
        {required ? (
          <View style={styles.requiredChip}>
            <Text style={styles.requiredText}>{t('onboarding.required')}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.stepDesc}>{desc}</Text>
      <Pressable onPress={onFix} style={[styles.fix, accent === 'amber' && styles.fixAmber]}>
        <Text style={[styles.fixText, accent === 'amber' && styles.fixTextAmber]}>
          {t('onboarding.enable')}
        </Text>
      </Pressable>
    </View>
  );
}

export function OnboardingScreen({ onDone }: Props) {
  const [health, setHealth] = useState<AlarmHealth>(() => AlarmService.getHealth());
  const refresh = () => setHealth(AlarmService.getHealth());
  const insets = useSafeAreaInsets();
  const [shareTelemetry, setShareTelemetry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasUserTouched = useRef(false);

  // Prefill for RE-onboarding (existing user pushed back here by a lost
  // permission): reflect their earlier choice instead of resetting to off.
  useEffect(() => {
    void getConsent().then((c) => {
      if (!hasUserTouched.current) setShareTelemetry(c === 'granted');
    });
  }, []);

  // Most gates are granted in the system Settings app; re-derive health when
  // the user comes back so the steps tick themselves off without a manual
  // "Re-check" tap (the link stays as a fallback).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setHealth(AlarmService.getHealth());
    });
    return () => sub.remove();
  }, []);

  const has = (r: AlarmHealth['reasons'][number]) => !health.reasons.includes(r);
  const isIos = Platform.OS === 'ios';

  return (
    <ScrollView
      style={styles.screenWrap}
      contentContainerStyle={[
        styles.screen,
        { paddingTop: insets.top + spacing.l, paddingBottom: insets.bottom + spacing.xxl },
      ]}
    >
      <Text style={styles.hero}>🛫</Text>
      <Text style={styles.title}>{t('onboarding.title')}</Text>
      <Text style={styles.subtitle}>
        {t('onboarding.subtitle')}
        {health.isAggressiveOEM ? ` ${t('onboarding.oemWarning')}` : ''}
      </Text>

      {isIos ? (
        <Step
          title={t('onboarding.alarmAuth.title')}
          desc={t('onboarding.alarmAuth.desc')}
          done={has('alarm-auth-denied')}
          onFix={async () => {
            await AlarmService.requestCritical();
            refresh();
          }}
        />
      ) : (
        <>
          <Step
            title={t('onboarding.notif.title')}
            desc={t('onboarding.notif.desc')}
            done={has('notifications-denied') && has('exact-alarm-denied')}
            onFix={async () => {
              await AlarmService.requestCritical();
              refresh();
            }}
          />
          <Step
            title={t('onboarding.fullScreen.title')}
            desc={t('onboarding.fullScreen.desc')}
            done={has('full-screen-denied')}
            onFix={async () => {
              await AlarmService.requestCritical();
              refresh();
            }}
          />
          <Step
            title={t('onboarding.overlay.title')}
            desc={t('onboarding.overlay.desc')}
            done={has('overlay-denied')}
            onFix={async () => {
              await AlarmService.requestOverlay();
              refresh();
            }}
          />
          {health.isAggressiveOEM ? (
            <Step
              title={t('onboarding.battery.title')}
              desc={t('onboarding.battery.desc')}
              done={has('battery-not-whitelisted')}
              accent="amber"
              required
              onFix={async () => {
                await AlarmService.requestBattery();
                refresh();
              }}
            />
          ) : null}
        </>
      )}

      <View style={styles.step}>
        <Text style={styles.stepTitle}>{t('consent.onboardingTitle')}</Text>
        <Text style={styles.stepDesc}>{t('consent.body')}</Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: shareTelemetry }}
          onPress={() => {
            hasUserTouched.current = true;
            setShareTelemetry((v) => !v);
          }}
          style={[styles.consentToggle, shareTelemetry && styles.consentToggleOn]}
        >
          <Text style={[styles.consentToggleText, shareTelemetry && styles.consentToggleTextOn]}>
            {shareTelemetry ? `✓ ${t('consent.toggleOn')}` : `○ ${t('consent.toggleOff')}`}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          style={styles.consentPolicyLink}
        >
          <Text style={styles.consentPolicyLinkText}>{t('legal.privacyPolicy')} ↗</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={async () => {
          if (isSubmitting) return;
          setIsSubmitting(true);
          await setConsent(shareTelemetry);
          track('onboarding_completed', { consentGranted: shareTelemetry });
          onDone();
        }}
        disabled={!health.isArmReliable || isSubmitting}
        style={[
          styles.continue,
          health.isArmReliable && !isSubmitting ? styles.continueOn : styles.continueOff,
        ]}
      >
        <Text
          style={[
            styles.continueText,
            health.isArmReliable && !isSubmitting ? styles.continueTextOn : styles.continueTextOff,
          ]}
        >
          {health.isArmReliable ? t('onboarding.continueReady') : t('onboarding.continueBlocked')}
        </Text>
      </Pressable>
      <Pressable onPress={refresh}>
        <Text style={styles.recheck}>{t('onboarding.recheck')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screenWrap: { flex: 1, backgroundColor: colors.skyBg },
  screen: { padding: spacing.xxl, paddingTop: 64, gap: spacing.s },
  hero: { fontSize: 34 },
  title: { color: colors.ink, fontSize: 21, fontFamily: fonts.extra, lineHeight: 28 },
  subtitle: {
    color: colors.ink2,
    fontSize: 12,
    fontFamily: fonts.semi,
    lineHeight: 18,
    marginBottom: spacing.s,
  },
  step: {
    backgroundColor: colors.bubble,
    borderRadius: radii.bubble - 2,
    padding: spacing.l - 2,
    ...shadows.bubble,
  },
  stepDone: { paddingVertical: spacing.m - 2 },
  stepDoneTitle: { color: colors.green, fontSize: 13, fontFamily: fonts.extra },
  stepSky: { borderWidth: 2, borderColor: colors.sky500 },
  stepAmber: { borderWidth: 2, borderColor: colors.amber },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  stepTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.extra },
  requiredChip: {
    backgroundColor: colors.warnBg,
    borderRadius: radii.pill,
    paddingVertical: 1,
    paddingHorizontal: 7,
  },
  requiredText: { color: colors.warnText, fontSize: 9, fontFamily: fonts.extra },
  stepDesc: { color: colors.ink2, fontSize: 12, fontFamily: fonts.semi, lineHeight: 17, marginTop: 3 },
  fix: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sky500,
    borderRadius: radii.pill,
    paddingVertical: spacing.s - 1,
    paddingHorizontal: spacing.xl - 2,
    marginTop: spacing.s + 1,
  },
  fixAmber: { backgroundColor: colors.amber },
  fixText: { color: colors.white, fontSize: 12, fontFamily: fonts.extra },
  fixTextAmber: { color: colors.ink },
  continue: {
    borderRadius: radii.pill,
    paddingVertical: spacing.l + 1,
    alignItems: 'center',
    marginTop: spacing.l,
  },
  continueOn: { backgroundColor: colors.sky500, ...shadows.button },
  continueOff: { backgroundColor: colors.disabledBg },
  continueText: { fontSize: 15, fontFamily: fonts.extra },
  continueTextOn: { color: colors.white },
  continueTextOff: { color: colors.disabledText },
  recheck: { color: colors.sky500, textAlign: 'center', padding: spacing.m, fontSize: 12, fontFamily: fonts.bold },
  consentToggle: {
    alignSelf: 'flex-start',
    backgroundColor: colors.skyBg,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingVertical: spacing.s - 1,
    paddingHorizontal: spacing.xl - 2,
    marginTop: spacing.s + 1,
  },
  consentToggleOn: { backgroundColor: colors.mintBg, borderColor: colors.green },
  consentToggleText: { color: colors.ink2, fontSize: 12, fontFamily: fonts.extra },
  consentToggleTextOn: { color: colors.green },
  consentPolicyLink: { alignSelf: 'flex-start', paddingVertical: spacing.s, marginBottom: spacing.s },
  consentPolicyLinkText: { color: colors.sky700, fontSize: 12, fontFamily: fonts.bold },
});
