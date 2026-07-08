import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlarmService } from '../../alarm/AlarmService';
import {
  ChainValidationIssue,
  computeChain,
  primaryInstantFromComputed,
  resolveArrivalInstant,
  toLocalClock,
} from '../../domain';
import { useArmingChain } from '../../hooks/useArmingChain';
import { useChain } from '../../hooks/useChain';
import { t } from '../../i18n';
import { ArrivalPickerSheet } from '../components/ArrivalPickerSheet';
import { ChainList } from '../components/ChainList';
import { PillDraft, PillEditorSheet } from '../components/PillEditorSheet';
import { ReorderView } from '../components/ReorderView';
import { formatAlarmDate, pickedTimeToInstant } from '../format';
import { colors, fonts, radii, shadows, spacing } from '../theme';

const DEFAULT_NEW_PILL: PillDraft = { icon: '🧥', name: '', dur: 15, type: 'push' };

const issueText = (i: ChainValidationIssue): string => t(`chainIssue.${i.kind}`);

type EditorState = { mode: 'create' } | { mode: 'edit'; id: string } | null;

export function ChainScreen() {
  const { chain, computed, issues, armable, zone, nowMs, setArrival, addPill, updatePill, removePill, reorderPill } =
    useChain();
  const { armed, health, missed, arm, disarm, refreshHealth, clearMissed } = useArmingChain();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | undefined>(undefined);
  const insets = useSafeAreaInsets();

  const atRisk = !health.isArmReliable || health.reasons.length > 0;

  // Armed snapshot summary (primary event label/time + the ring date chip).
  const armedInfo = useMemo(() => {
    if (!armed) return null;
    const c = computeChain(armed);
    if (!c) return null;
    const primary = primaryInstantFromComputed(c);
    const item = c.items.find((it) => it.endAt === primary);
    return {
      label: item ? t('chainScreen.eventEnds', { name: item.pill.name }) : '',
      time: toLocalClock(primary, armed.zone),
      date: formatAlarmDate(primary, nowMs, armed.zone),
    };
  }, [armed, nowMs]);

  // Editing an armed chain disarms it first: the native alarms keep firing at the
  // OLD times, so leaving the chain armed would show times that will not ring.
  // The armed chip disappearing + the arm button returning make the state honest;
  // the user re-arms deliberately once they're done editing.
  const disarmForEdit = () => {
    if (!armed) return;
    void disarm();
    if (Platform.OS === 'android') {
      ToastAndroid.show(t('chainScreen.disarmedByEdit'), ToastAndroid.SHORT);
    }
  };

  const onConfirmArrival = (hour: number, minute: number) => {
    disarmForEdit();
    const instant =
      chain.arrival != null
        ? pickedTimeToInstant(chain.arrival, hour, minute, zone)
        : resolveArrivalInstant(hour, minute, zone, nowMs);
    setArrival(instant);
    setPickerOpen(false);
  };

  const onSubmitPill = (draft: PillDraft) => {
    disarmForEdit();
    if (editor?.mode === 'edit') {
      updatePill(editor.id, draft);
      setHighlightId(editor.id);
    } else {
      setHighlightId(addPill(draft));
    }
    setEditor(null);
  };

  const editingPill =
    editor?.mode === 'edit' ? chain.pills.find((p) => p.id === editor.id) : undefined;

  return (
    <LinearGradient colors={[colors.skyBgTop, colors.skyBgBottom]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.m, paddingBottom: insets.bottom + spacing.xxl },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.wordmark}>{t('chain.wordmark')}</Text>
          {armedInfo?.date ? (
            <View style={styles.dateChip}>
              <Text style={styles.dateChipText}>{armedInfo.date}</Text>
            </View>
          ) : null}
        </View>

        {missed ? (
          <Pressable
            style={styles.risk}
            onPress={async () => {
              clearMissed();
              await AlarmService.requestBattery();
              refreshHealth();
            }}
          >
            <Text style={styles.riskTitle}>
              {/* Prefer the zone the alarm was armed under — the device may have
                  flown zones between the miss and this launch. */}
              {t('banner.missedTitle', { time: toLocalClock(missed.at, armed?.zone ?? chain.zone) })}
            </Text>
            <Text style={styles.riskLine}>{t('banner.missedBody')}</Text>
          </Pressable>
        ) : null}

        {atRisk ? (
          <Pressable
            style={styles.risk}
            onPress={async () => {
              await AlarmService.requestCritical();
              refreshHealth();
            }}
          >
            <Text style={styles.riskTitle}>{t('banner.atRisk')}</Text>
            {health.reasons.map((r) => (
              <Text key={r} style={styles.riskLine}>
                • {t(`reason.${r}`)}
              </Text>
            ))}
          </Pressable>
        ) : armedInfo ? (
          <View style={[styles.chip, styles.armed]}>
            <Text style={styles.armedText}>
              {t('chainScreen.armedSummary', { label: armedInfo.label, time: armedInfo.time })}
            </Text>
          </View>
        ) : chain.arrival != null ? (
          <View style={[styles.chip, styles.ready]}>
            <Text style={styles.readyText}>
              {t('chainScreen.arrivalSummary', { time: toLocalClock(chain.arrival, zone) })}
            </Text>
          </View>
        ) : null}

        {chain.arrival != null
          ? issues.map((i, idx) => (
              <Text key={idx} style={styles.issue}>
                ⚠ {issueText(i)}
              </Text>
            ))
          : null}

        {computed && chain.arrival != null ? (
          <>
            <ChainList
              computed={computed}
              zone={zone}
              highlightId={highlightId}
              onPressPill={(id) => setEditor({ mode: 'edit', id })}
              onPressAnchor={() => setPickerOpen(true)}
            />

            <View style={styles.toolRow}>
              <Pressable style={styles.addPill} onPress={() => setEditor({ mode: 'create' })}>
                <Text style={styles.addPillText}>{t('chainScreen.addPill')}</Text>
              </Pressable>
              {chain.pills.length > 1 ? (
                <Pressable style={styles.reorder} onPress={() => setReorderOpen(true)}>
                  <Text style={styles.reorderText}>↕ {t('chainScreen.reorder')}</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : (
          <Pressable style={styles.empty} onPress={() => setPickerOpen(true)}>
            <Text style={styles.emptyIcon}>🛬</Text>
            <Text style={styles.emptyTitle}>{t('chainScreen.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('chainScreen.emptySub')}</Text>
            <View style={styles.emptyBtnWrap}>
              <LinearGradient
                colors={[colors.sky500, colors.sky700]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyBtn}
              >
                <Text style={styles.emptyBtnText}>{t('chainScreen.setArrival')}</Text>
              </LinearGradient>
            </View>
          </Pressable>
        )}

        {chain.arrival != null ? (
          <Pressable
            onPress={armed ? disarm : () => armable && arm(chain)}
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

      <ArrivalPickerSheet
        visible={pickerOpen}
        initial={chain.arrival != null ? new Date(chain.arrival) : new Date()}
        onCancel={() => setPickerOpen(false)}
        onConfirm={onConfirmArrival}
      />

      {editor ? (
        <PillEditorSheet
          visible
          mode={editor.mode}
          initial={editingPill ?? DEFAULT_NEW_PILL}
          onCancel={() => setEditor(null)}
          onSubmit={onSubmitPill}
          onDelete={
            editor.mode === 'edit'
              ? () => {
                  disarmForEdit();
                  removePill(editor.id);
                  setEditor(null);
                }
              : undefined
          }
        />
      ) : null}

      <ReorderView
        visible={reorderOpen}
        pills={chain.pills}
        onClose={() => setReorderOpen(false)}
        onReorder={(from, to) => {
          disarmForEdit();
          reorderPill(from, to);
        }}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: spacing.xl, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.s },
  wordmark: { color: colors.ink2, fontSize: 11, fontFamily: fonts.extra, letterSpacing: 1.5, marginLeft: spacing.xs },
  dateChip: { backgroundColor: colors.sky500, borderRadius: radii.pill, paddingVertical: 3, paddingHorizontal: 10 },
  dateChipText: { color: colors.white, fontSize: 11, fontFamily: fonts.extra },

  chip: { borderRadius: radii.pill, paddingVertical: spacing.s + 1, paddingHorizontal: spacing.l, marginBottom: spacing.m },
  armed: { backgroundColor: colors.mintBg },
  armedText: { color: colors.green, fontSize: 12, fontFamily: fonts.extra },
  ready: { backgroundColor: colors.bubble, ...shadows.bubble },
  readyText: { color: colors.ink2, fontSize: 12, fontFamily: fonts.bold },
  risk: { backgroundColor: colors.blushBg, borderRadius: radii.bubble - 4, padding: spacing.l - 2, marginBottom: spacing.m },
  riskTitle: { color: colors.red, fontSize: 13, fontFamily: fonts.extra },
  riskLine: { color: colors.blushText, fontSize: 11, fontFamily: fonts.semi, marginTop: 3, lineHeight: 16 },

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

  toolRow: { flexDirection: 'row', gap: spacing.s, marginTop: spacing.m },
  addPill: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#A9CFF5',
    borderStyle: 'dashed',
    borderRadius: radii.bubble - 4,
    paddingVertical: spacing.m - 1,
    alignItems: 'center',
  },
  addPillText: { color: colors.sky700, fontSize: 13, fontFamily: fonts.extra },
  reorder: {
    borderRadius: radii.bubble - 4,
    paddingVertical: spacing.m - 1,
    paddingHorizontal: spacing.l,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bubble,
    ...shadows.bubble,
  },
  reorderText: { color: colors.ink2, fontSize: 13, fontFamily: fonts.bold },

  empty: {
    borderWidth: 2,
    borderColor: '#A9CFF5',
    borderStyle: 'dashed',
    borderRadius: radii.bubble,
    padding: spacing.xxl + 8,
    alignItems: 'center',
    backgroundColor: colors.skyBgBottom,
  },
  emptyIcon: { fontSize: 34 },
  emptyTitle: { color: colors.ink, fontSize: 18, fontFamily: fonts.extra, marginTop: spacing.m },
  emptySub: { color: colors.ink2, fontSize: 12, fontFamily: fonts.semi, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  emptyBtnWrap: { marginTop: spacing.l, borderRadius: radii.pill, ...shadows.button },
  emptyBtn: { borderRadius: radii.pill, paddingVertical: spacing.m + 1, paddingHorizontal: spacing.xxl + 6 },
  emptyBtnText: { color: colors.white, fontSize: 14, fontFamily: fonts.extra },

  armWrap: { marginTop: spacing.xxl, ...shadows.button },
  armInner: { borderRadius: radii.pill, paddingVertical: spacing.l + 1, alignItems: 'center' },
  disarm: { backgroundColor: colors.coral },
  armDisabled: { backgroundColor: colors.disabledBg },
  armText: { color: colors.white, fontSize: 15, fontFamily: fonts.extra },
  armTextDisabled: { color: colors.disabledText },
});
