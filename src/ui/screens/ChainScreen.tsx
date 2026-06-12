import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AlarmService } from '../../alarm/AlarmService';
import { BOUNDS, resolveArrivalInstant, reverseCalc, ValidationIssue } from '../../domain';
import { useArming } from '../../hooks/useArming';
import { useSchedule } from '../../hooks/useSchedule';
import { t } from '../../i18n';
import { DurationEditorModal } from '../components/DurationEditorModal';
import { DurationPill } from '../components/DurationPill';
import { StatusBanner } from '../components/StatusBanner';
import { TimeEditorModal } from '../components/TimeEditorModal';
import { TimeRow } from '../components/TimeRow';
import { formatClockWithDay, pickedTimeToInstant } from '../format';
import { colors, fonts, radii, shadows, spacing } from '../theme';

type DurationField = 'contingency' | 'travel' | 'prep' | 'sleep';
type TimeField = 'arrival' | 'wake' | 'leaveHome' | 'fallAsleep';

const DURATION_EMOJI: Record<DurationField, string> = {
  contingency: '🛟',
  travel: '🚕',
  prep: '🚿',
  sleep: '😴',
};

const issueText = (i: ValidationIssue): string =>
  i.kind === 'out-of-range'
    ? t('issue.out-of-range', { field: t(`duration.${i.field}`) })
    : t(`issue.${i.kind}`);

export function ChainScreen() {
  const { state, zone, schedule, derived, issues, armable, nowMs, dispatch, persistPresets } =
    useSchedule();
  const { armed, health, arm, disarm, refreshHealth } = useArming();

  const [timeEditor, setTimeEditor] = useState<TimeField | null>(null);
  const [durationEditor, setDurationEditor] = useState<DurationField | null>(null);

  const ref = schedule?.arrival ?? nowMs;
  const fmt = (ms: number) => formatClockWithDay(ms, ref, zone);

  const armedSummary = (() => {
    if (armed == null) return null;
    const d = reverseCalc(armed);
    return {
      wake: formatClockWithDay(d.wake, ref, zone).clock,
      leave: formatClockWithDay(d.leaveHome, ref, zone).clock,
    };
  })();

  const onArm = async () => {
    if (!schedule || !armable) return;
    await arm(schedule);
    // Sticky-on-arm (spec §9) — but presets are a convenience; never let their write block the alarm.
    await persistPresets().catch(() => {});
  };

  const openTime = (field: TimeField) => setTimeEditor(field);

  /** Seed the picker with the field's current value so editing starts from it. */
  const timeEditorInitial = (): Date => {
    if (timeEditor === 'arrival' && schedule) return new Date(schedule.arrival);
    if (timeEditor && timeEditor !== 'arrival' && derived) {
      const base =
        timeEditor === 'wake'
          ? derived.wake
          : timeEditor === 'leaveHome'
            ? derived.leaveHome
            : derived.fallAsleep;
      return new Date(base);
    }
    return new Date();
  };

  const confirmTime = (hour: number, minute: number) => {
    if (!timeEditor) return;
    if (timeEditor === 'arrival') {
      const instant = schedule
        ? pickedTimeToInstant(schedule.arrival, hour, minute, zone)
        : resolveArrivalInstant(hour, minute, zone, nowMs);
      dispatch({ type: schedule ? 'edit-arrival' : 'set-arrival', instant, zone });
    } else if (derived) {
      const base =
        timeEditor === 'wake'
          ? derived.wake
          : timeEditor === 'leaveHome'
            ? derived.leaveHome
            : derived.fallAsleep;
      const instant = pickedTimeToInstant(base, hour, minute, zone);
      dispatch({
        type:
          timeEditor === 'wake'
            ? 'edit-wake'
            : timeEditor === 'leaveHome'
              ? 'edit-leave-home'
              : 'edit-fall-asleep',
        instant,
      });
    }
    setTimeEditor(null);
  };

  const confirmDuration = (minutes: number) => {
    if (!durationEditor) return;
    dispatch({ type: 'set-duration', field: durationEditor, minutes });
    setDurationEditor(null);
  };

  return (
    <LinearGradient colors={[colors.skyBgTop, colors.skyBgBottom]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.wordmark}>{t('chain.wordmark')}</Text>

        <StatusBanner
          health={health}
          armedSummary={armedSummary}
          onFixPress={async () => {
            await AlarmService.requestCritical();
            refreshHealth();
          }}
        />

        {issues.map((i, idx) => (
          <Text key={idx} style={styles.issue}>
            ⚠ {issueText(i)}
          </Text>
        ))}

        {schedule && derived ? (
          <View style={styles.chain}>
            <TimeRow
              icon="🌙"
              label={t('chain.fallAsleep')}
              {...fmt(derived.fallAsleep)}
              onPress={() => openTime('fallAsleep')}
            />
            <DurationPill icon="😴" minutes={state.sleep} onPress={() => setDurationEditor('sleep')} />

            <TimeRow
              icon="⏰"
              label={t('chain.wakeUp')}
              badge={t('chain.alarmBadge')}
              emphasis="alarm"
              {...fmt(derived.wake)}
              onPress={() => openTime('wake')}
            />
            <DurationPill icon="🚿" minutes={state.prep} onPress={() => setDurationEditor('prep')} />

            <TimeRow
              icon="🚪"
              label={t('chain.leaveHome')}
              {...fmt(derived.leaveHome)}
              onPress={() => openTime('leaveHome')}
            />
            <View style={styles.pillRow}>
              <DurationPill icon="🚕" minutes={state.travel} onPress={() => setDurationEditor('travel')} />
              <DurationPill
                icon="🛟"
                minutes={state.contingency}
                onPress={() => setDurationEditor('contingency')}
              />
            </View>

            <TimeRow
              icon="📍"
              label={t('chain.arriveBy')}
              emphasis="anchor"
              {...fmt(derived.arrival)}
              onPress={() => openTime('arrival')}
            />
          </View>
        ) : (
          <Pressable style={styles.empty} onPress={() => openTime('arrival')}>
            <Text style={styles.emptyIcon}>🛬</Text>
            <Text style={styles.emptyTitle}>{t('chain.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('chain.emptySub')}</Text>
          </Pressable>
        )}

        {schedule ? (
          <Pressable
            onPress={armed ? disarm : onArm}
            disabled={!armed && !armable}
            style={styles.armWrap}
          >
            {armed ? (
              <View style={[styles.armInner, styles.disarm]}>
                <Text style={styles.armText}>{t('chain.disarm')}</Text>
              </View>
            ) : armable ? (
              <LinearGradient
                colors={[colors.sky500, colors.sky700]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.armInner}
              >
                <Text style={styles.armText}>{t('chain.arm')}</Text>
              </LinearGradient>
            ) : (
              <View style={[styles.armInner, styles.armDisabled]}>
                <Text style={[styles.armText, styles.armTextDisabled]}>{t('chain.arm')}</Text>
              </View>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      {timeEditor ? (
        <TimeEditorModal
          visible
          title={t('editor.setTime', { field: t(`timeField.${timeEditor}`) })}
          initial={timeEditorInitial()}
          onCancel={() => setTimeEditor(null)}
          onConfirm={confirmTime}
        />
      ) : null}

      {durationEditor ? (
        <DurationEditorModal
          visible
          title={`${DURATION_EMOJI[durationEditor]} ${t(`duration.${durationEditor}`)}`}
          initialMinutes={state[durationEditor]}
          max={BOUNDS[durationEditor][1]}
          onCancel={() => setDurationEditor(null)}
          onConfirm={confirmDuration}
        />
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: spacing.xl, paddingTop: 56 },
  wordmark: {
    color: colors.ink2,
    fontSize: 11,
    fontFamily: fonts.extra,
    letterSpacing: 1.5,
    marginBottom: spacing.s,
    marginLeft: spacing.xs,
  },
  issue: {
    backgroundColor: colors.warnBg,
    color: colors.warnText,
    fontSize: 12,
    fontFamily: fonts.bold,
    borderRadius: radii.bubble - 4,
    paddingVertical: spacing.s + 1,
    paddingHorizontal: spacing.l - 2,
    marginBottom: spacing.s - 2,
    overflow: 'hidden',
  },
  chain: { gap: spacing.xs + 2 },
  pillRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.s },
  empty: {
    borderWidth: 2,
    borderColor: '#A9CFF5',
    borderStyle: 'dashed',
    borderRadius: radii.bubble,
    padding: spacing.xxl + 8,
    alignItems: 'center',
    backgroundColor: colors.skyBgBottom,
  },
  emptyIcon: { fontSize: 30 },
  emptyTitle: { color: colors.sky700, fontSize: 15, fontFamily: fonts.extra, marginTop: spacing.s },
  emptySub: { color: colors.ink2, fontSize: 11, fontFamily: fonts.semi, marginTop: 3 },
  armWrap: { marginTop: spacing.xxl, ...shadows.button },
  armInner: {
    borderRadius: radii.pill,
    paddingVertical: spacing.l + 1,
    alignItems: 'center',
  },
  disarm: { backgroundColor: colors.coral },
  armDisabled: { backgroundColor: colors.disabledBg },
  armText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
  armTextDisabled: { color: colors.disabledText },
});
