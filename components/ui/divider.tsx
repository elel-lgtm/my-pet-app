import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** A hairline rule. Hidden from assistive tech: it carries no information on its own. */
export function Divider({ inset = false }: { inset?: boolean | undefined }) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.divider, { backgroundColor: colors.border }, inset && styles.inset]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  inset: {
    marginLeft: 16,
  },
});
