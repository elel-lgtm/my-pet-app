import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { type IconName } from '@/components/ui/icon-names';
import { Text } from '@/components/ui/text';
import { MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ListItemProps = {
  title: string;
  subtitle?: string | undefined;
  icon?: IconName | undefined;
  /** Omit to render a static row rather than a control. */
  onPress?: (() => void) | undefined;
  /** Rendered at the trailing edge — a badge, a switch, a value. */
  accessory?: React.ReactNode | undefined;
  showChevron?: boolean | undefined;
  testID?: string | undefined;
};

/** A single row in a grouped list. Becomes a button only when `onPress` is supplied. */
export function ListItem({
  title,
  subtitle,
  icon,
  onPress,
  accessory,
  showChevron,
  testID,
}: ListItemProps) {
  const { colors } = useTheme();
  const chevronVisible = showChevron ?? Boolean(onPress);

  const content = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={22} color={colors.icon} /> : null}
      <View style={styles.labels}>
        <Text weight="medium">{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {accessory}
      {chevronVisible ? <Icon name="chevronRight" size={18} color={colors.textMuted} /> : null}
    </View>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={styles.container}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      // The subtitle is part of the label so the row announces as one coherent control.
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => [
        styles.container,
        pressed && { backgroundColor: colors.background },
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  labels: {
    flex: 1,
    gap: 2,
  },
});
