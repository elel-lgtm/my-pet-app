import { useId } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { Text } from '@/components/ui/text';
import { MIN_TOUCH_TARGET, Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string | undefined;
  /** Shown below the field and announced with it. Its presence also drives the error styling. */
  error?: string | undefined;
  helperText?: string | undefined;
  keyboardType?: KeyboardTypeOptions | undefined;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters' | undefined;
  secureTextEntry?: boolean | undefined;
  multiline?: boolean | undefined;
  editable?: boolean | undefined;
  testID?: string | undefined;
};

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  helperText,
  keyboardType,
  autoCapitalize = 'sentences',
  secureTextEntry = false,
  multiline = false,
  editable = true,
  testID,
}: TextFieldProps) {
  const { colors } = useTheme();
  const messageId = useId();
  const message = error ?? helperText;

  return (
    <View style={styles.container}>
      <Text variant="caption" weight="medium" color={error ? 'danger' : 'textMuted'}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        editable={editable}
        // The visible label is a sibling, not a wrapper, so it has to be attached explicitly.
        accessibilityLabel={label}
        accessibilityHint={message}
        aria-describedby={message ? messageId : undefined}
        aria-invalid={Boolean(error)}
        style={[
          styles.input,
          Typography.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
          },
          multiline && styles.multiline,
          !editable && styles.disabled,
        ]}
      />
      {message ? (
        <Text nativeID={messageId} variant="caption" color={error ? 'danger' : 'textMuted'}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  multiline: {
    minHeight: MIN_TOUCH_TARGET * 2,
    textAlignVertical: 'top',
  },
  disabled: {
    opacity: 0.5,
  },
});
