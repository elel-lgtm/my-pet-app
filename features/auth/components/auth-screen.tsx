import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Screen, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

export type AuthScreenProps = {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
  /** Secondary navigation — "already have an account?" and similar. */
  readonly footer?: ReactNode | undefined;
  readonly testID?: string | undefined;
};

/**
 * Shared frame for every authentication screen.
 *
 * Keyboard avoidance matters more here than anywhere else in the app: these screens are almost
 * entirely inputs, and on iOS the submit button sits exactly where the keyboard appears.
 */
export function AuthScreen({ title, subtitle, children, footer, testID }: AuthScreenProps) {
  return (
    <Screen scrollable edges={['top', 'bottom', 'left', 'right']} testID={testID}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text variant="title" weight="bold" accessibilityRole="header">
              {title}
            </Text>
            <Text color="textMuted">{subtitle}</Text>
          </View>

          <View style={styles.body}>{children}</View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    gap: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  header: { gap: Spacing.xs },
  body: { gap: Spacing.md },
  footer: {
    marginTop: 'auto',
    paddingTop: Spacing.lg,
    alignItems: 'center',
  },
});
