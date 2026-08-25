import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

export type SectionProps = {
  title: string;
  description?: string | undefined;
  children: ReactNode;
};

/** A titled group of related content. The heading role gives screen readers a navigation anchor. */
export function Section({ title, description, children }: SectionProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text
          variant="caption"
          weight="semibold"
          color="textMuted"
          accessibilityRole="header"
          // Uppercased in style, not in the string: assistive tech reads the natural casing,
          // where an all-caps string is often spelled out letter by letter.
          style={styles.title}>
          {title}
        </Text>
        {description ? (
          <Text variant="caption" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  header: {
    gap: 2,
  },
  title: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
