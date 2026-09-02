import { Modal, StyleSheet, View } from 'react-native';

import { Button, Surface, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/**
 * A blocking confirmation for something that cannot be undone.
 *
 * Built from the design system rather than `Alert.alert` for three reasons: `Alert` has no web
 * implementation, it cannot be asserted on in tests, and it ignores the app's theme. A real modal
 * costs a few lines and behaves the same everywhere.
 *
 * The destructive button is never the default focus and never sits where "cancel" usually does.
 */
export type ConfirmActionProps = {
  readonly visible: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly destructive?: boolean | undefined;
  readonly busy?: boolean | undefined;
  onConfirm(): void;
  onCancel(): void;
};

export function ConfirmAction({
  visible,
  title,
  message,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmActionProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's back button must dismiss rather than confirm.
      onRequestClose={onCancel}
      accessibilityViewIsModal
      testID="confirm-action">
      <View style={styles.backdrop}>
        <Surface elevation="medium" style={styles.card}>
          <Text variant="subtitle" weight="semibold" accessibilityRole="header">
            {title}
          </Text>
          <Text color="textMuted">{message}</Text>

          <View style={styles.actions}>
            {/* Cancel first, so the safe choice is the one nearest the thumb on the way back. */}
            <Button
              label="Cancel"
              onPress={onCancel}
              variant="secondary"
              disabled={busy}
              style={styles.action}
              testID="confirm-cancel"
            />
            <Button
              label={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'danger' : 'primary'}
              loading={busy}
              style={styles.action}
              testID="confirm-accept"
            />
          </View>
        </Surface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: { gap: Spacing.sm },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  action: { flex: 1 },
});
