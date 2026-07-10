import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Preset, presetSummary } from '../../domain';
import { t } from '../../i18n';
import { formatDuration } from '../format';
import { colors, fonts, radii, shadows, spacing } from '../theme';
import { PresetNameSheet } from './PresetNameSheet';

type NameEditor = { mode: 'create' } | { mode: 'edit'; id: string } | null;

type Props = {
  visible: boolean;
  presets: Preset[];
  activeId: string | null;
  onClose: () => void;
  /** Two-step apply commit. The parent swaps pills + closes the sheet. */
  onApply: (id: string) => void;
  /** Create commit (trimmed name). The parent snapshots pills + closes the sheet. */
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  /** Called only AFTER the destructive Alert is confirmed. */
  onDelete: (id: string) => void;
};

/**
 * Full-screen preset list (design rows 08–11): empty state, two-step apply
 * (tap to select → inline 불러오기 commits), and a manage mode for
 * rename/delete. Owns the nested PresetNameSheet (nested inside this Modal's
 * tree so it layers reliably on both platforms) and the delete Alert.
 */
export function PresetListSheet({ visible, presets, activeId, onClose, onApply, onCreate, onRename, onDelete }: Props) {
  const [managing, setManaging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nameEditor, setNameEditor] = useState<NameEditor>(null);
  const insets = useSafeAreaInsets();

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setManaging(false);
      setSelectedId(null);
      setNameEditor(null);
    }
  }, [visible]);

  // Selection never survives a mode switch (spec).
  const toggleManaging = () => {
    setManaging((m) => !m);
    setSelectedId(null);
  };

  // Hardware back: leave manage mode first, then close (spec). The nested
  // name sheet handles its own back (cancel) while it is open.
  const onRequestClose = () => {
    if (managing) setManaging(false);
    else onClose();
  };

  const editingPreset =
    nameEditor?.mode === 'edit' ? presets.find((p) => p.id === nameEditor.id) : undefined;

  const summaryText = (preset: Preset): string => {
    const s = presetSummary(preset.pills);
    return t('preset.summary', { count: s.count, total: formatDuration(s.totalMinutes) });
  };

  const confirmDelete = (preset: Preset) => {
    Alert.alert(t('preset.deleteConfirmTitle', { name: preset.name }), t('preset.deleteConfirmBody'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('pillEditor.delete'),
        style: 'destructive',
        onPress: () => {
          setNameEditor(null);
          onDelete(preset.id);
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onRequestClose}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.m }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.title}>{t('preset.title')}</Text>
          {presets.length > 0 ? (
            <Pressable onPress={toggleManaging} hitSlop={12}>
              <Text style={styles.manage}>{managing ? t('preset.done') : t('preset.manage')}</Text>
            </Pressable>
          ) : null}
        </View>
        {managing && presets.length > 0 ? (
          <Text style={styles.hint}>{t('preset.manageHint')}</Text>
        ) : null}

        {presets.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyTile}>
              <Text style={styles.emptyTileIcon}>🗂️</Text>
            </View>
            <Text style={styles.emptyTitle}>{t('preset.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('preset.emptyBody')}</Text>
            <Pressable style={styles.ctaWrap} onPress={() => setNameEditor({ mode: 'create' })}>
              <LinearGradient
                colors={[colors.sky500, colors.sky700]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>{t('preset.saveCurrent')}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
            <View style={styles.list}>
              {presets.map((preset) => {
                const isActive = preset.id === activeId;
                const isSelected = !managing && preset.id === selectedId;
                return (
                  <Pressable
                    key={preset.id}
                    style={[styles.row, isSelected && styles.rowSelected]}
                    onPress={() => {
                      if (managing) setNameEditor({ mode: 'edit', id: preset.id });
                      else if (!isActive) setSelectedId(preset.id);
                    }}
                  >
                    <View style={styles.rowBody}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {preset.name}
                      </Text>
                      <View style={styles.rowMeta}>
                        <Text style={styles.rowIcons} numberOfLines={1}>
                          {presetSummary(preset.pills).icons}
                        </Text>
                        <Text style={styles.rowSummary} numberOfLines={1}>
                          {summaryText(preset)}
                        </Text>
                      </View>
                    </View>
                    {managing ? (
                      <Text style={styles.rowEdit}>{t('preset.edit')} ›</Text>
                    ) : isActive ? (
                      <View style={styles.check}>
                        <Text style={styles.checkText}>✓</Text>
                      </View>
                    ) : isSelected ? (
                      <Pressable style={styles.load} onPress={() => onApply(preset.id)}>
                        <Text style={styles.loadText}>{t('preset.load')}</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.chevron}>›</Text>
                    )}
                  </Pressable>
                );
              })}
              <Pressable style={styles.addRow} onPress={() => setNameEditor({ mode: 'create' })}>
                <Text style={styles.addRowText}>{t('preset.addNew')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {nameEditor ? (
          <PresetNameSheet
            visible
            mode={nameEditor.mode}
            initialName={editingPreset?.name ?? ''}
            summary={
              editingPreset
                ? {
                    icons: presetSummary(editingPreset.pills).icons,
                    text: `${summaryText(editingPreset)} · ${t('preset.editedAtHome')}`,
                  }
                : undefined
            }
            onCancel={() => setNameEditor(null)}
            onSave={(name) => {
              if (nameEditor.mode === 'create') onCreate(name); // parent also closes this sheet
              else onRename(nameEditor.id, name);
              setNameEditor(null);
            }}
            onDelete={editingPreset ? () => confirmDelete(editingPreset) : undefined}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.skyBgBottom, paddingHorizontal: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.m, marginBottom: spacing.m + 2 },
  back: { color: colors.sky500, fontSize: 22, fontFamily: fonts.extra },
  title: { flex: 1, color: colors.ink, fontSize: 18, fontFamily: fonts.extra },
  manage: { color: colors.sky700, fontSize: 13, fontFamily: fonts.extra },
  hint: { color: colors.faint, fontSize: 11, fontFamily: fonts.bold, marginBottom: spacing.m, marginHorizontal: 2 },

  list: { gap: spacing.s + 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    backgroundColor: colors.bubble,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: spacing.m + 1,
    paddingHorizontal: spacing.m + 2,
    ...shadows.bubble,
  },
  rowSelected: { backgroundColor: colors.skyBg, borderColor: colors.sky500, ...shadows.focus },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { color: colors.ink, fontSize: 14.5, fontFamily: fonts.extra },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.s, marginTop: 6 },
  rowIcons: { fontSize: 14, letterSpacing: 1, flexShrink: 1 },
  rowSummary: { color: colors.faint, fontSize: 11.5, fontFamily: fonts.bold, flexShrink: 1 },
  rowEdit: { color: colors.sky700, fontSize: 12, fontFamily: fonts.extra },
  chevron: { color: colors.faint, fontSize: 18, fontFamily: fonts.extra },
  check: { width: 24, height: 24, borderRadius: radii.pill, backgroundColor: colors.sky500, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: colors.white, fontSize: 12, fontFamily: fonts.extra },
  load: { backgroundColor: colors.sky500, borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: 12 },
  loadText: { color: colors.white, fontSize: 11, fontFamily: fonts.extra },
  addRow: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
    borderRadius: 16,
    paddingVertical: spacing.m + 1,
    alignItems: 'center',
  },
  addRowText: { color: colors.sky700, fontSize: 13.5, fontFamily: fonts.extra },

  empty: { alignItems: 'center', paddingTop: spacing.xxl * 2 },
  emptyTile: { width: 66, height: 66, borderRadius: 20, backgroundColor: colors.skyBg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.l - 1 },
  emptyTileIcon: { fontSize: 30 },
  emptyTitle: { color: colors.ink, fontSize: 16, fontFamily: fonts.extra },
  emptyBody: { color: colors.ink2, fontSize: 12.5, fontFamily: fonts.semi, lineHeight: 19, marginTop: spacing.s, maxWidth: 248, textAlign: 'center' },
  ctaWrap: { alignSelf: 'stretch', marginTop: spacing.xl, borderRadius: radii.pill, ...shadows.button },
  cta: { borderRadius: radii.pill, paddingVertical: spacing.l - 1, alignItems: 'center' },
  ctaText: { color: colors.white, fontSize: 14.5, fontFamily: fonts.extra },
});
