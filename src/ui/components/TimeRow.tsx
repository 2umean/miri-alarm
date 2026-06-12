import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, shadows, spacing } from '../theme';

type Props = {
  icon: string;
  label: string;
  clock: string;
  day: string;
  emphasis?: 'anchor' | 'alarm' | 'muted';
  badge?: string; // e.g. the localized ALARM chip text
  onPress?: () => void;
};

export function TimeRow({ icon, label, clock, day, emphasis = 'muted', badge, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        emphasis === 'alarm' && styles.alarmRow,
        emphasis === 'anchor' && styles.anchorRow,
      ]}
    >
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.labelCol}>
        <Text style={[styles.label, emphasis === 'anchor' && styles.anchorLabel]}>{label}</Text>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.timeCol}>
        <Text
          style={[
            styles.clock,
            emphasis === 'alarm' && styles.alarmClock,
            emphasis === 'anchor' && styles.anchorClock,
          ]}
        >
          {clock}
        </Text>
        {day ? <Text style={[styles.day, emphasis === 'anchor' && styles.anchorDay]}>{day}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bubble,
    borderRadius: radii.bubble,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l - 2,
    ...shadows.bubble,
  },
  alarmRow: { borderWidth: 2, borderColor: colors.sky500, ...shadows.focus },
  anchorRow: { backgroundColor: colors.amber },
  icon: { fontSize: 20, width: 32 },
  labelCol: { flex: 1, alignItems: 'flex-start' },
  label: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  anchorLabel: { fontFamily: fonts.extra },
  badge: {
    backgroundColor: colors.sky500,
    borderRadius: radii.pill,
    paddingVertical: 1,
    paddingHorizontal: 7,
    marginTop: 3,
  },
  badgeText: { color: colors.white, fontSize: 8, fontFamily: fonts.extra, letterSpacing: 0.5 },
  timeCol: { alignItems: 'flex-end' },
  clock: { color: colors.ink, fontSize: 17, fontFamily: fonts.clock },
  alarmClock: { color: colors.sky700, fontSize: 19 },
  anchorClock: { fontSize: 21 },
  day: { color: colors.ink2, fontSize: 10, fontFamily: fonts.semi },
  anchorDay: { color: colors.ink },
});
