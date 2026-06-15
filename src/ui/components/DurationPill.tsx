import { Pressable, StyleSheet, Text } from 'react-native';

import { formatDuration } from '../format';
import { colors, fonts, radii } from '../theme';

type Props = {
  icon: string;
  minutes: number;
  onPress: () => void;
};

export function DurationPill({ icon, minutes, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.pill}>
      <Text style={styles.text}>
        {icon} {formatDuration(minutes)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    backgroundColor: colors.bubble,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  text: { color: colors.ink2, fontSize: 14, fontFamily: fonts.bold },
});
