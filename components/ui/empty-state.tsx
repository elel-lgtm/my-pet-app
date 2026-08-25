import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { type IconName } from '@/components/ui/icon-names';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  description: string;
  action?: { label: string; onPress: () => void } | undefined;
  testID?: string | undefined;
};

/**
 * The "nothing here yet" state.
 *
 * Every list in the app is empty on first run, so this is the first thing most users see. It always
 * says what is missing and, where there is one, offers the action that fixes it.
 */
export function EmptyState({ icon, title, description, action, testID }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container} testID={testID}>
      <Icon name={icon} size={40} color={colors.textMuted} />
      <Text variant="subtitle" weight="semibold" align="center">
        {title}
      </Text>
      <Text color="textMuted" align="center">
        {description}
      </Text>
      {action ? (
        <Button label={action.label} onPress={action.onPress} icon="add" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
  },
  action: {
    marginTop: Spacing.md,
  },
});
