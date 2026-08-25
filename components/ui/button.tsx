import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Icon } from '@/components/ui/icon';
import { type IconName } from '@/components/ui/icon-names';
import { Text } from '@/components/ui/text';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/constants/theme';
import { useTheme, type ThemeColors } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'small' | 'medium';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  icon?: IconName | undefined;
  disabled?: boolean | undefined;
  /** Shows a spinner and blocks presses. Reported to assistive tech as `busy`. */
  loading?: boolean | undefined;
  fullWidth?: boolean | undefined;
  /** Defaults to `label`; set when the label alone is not descriptive out of context. */
  accessibilityLabel?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
};

type VariantColors = { background: string; content: string; border: string };

function colorsForVariant(variant: ButtonVariant, colors: ThemeColors): VariantColors {
  switch (variant) {
    case 'primary':
      return { background: colors.tint, content: colors.onTint, border: 'transparent' };
    case 'secondary':
      return { background: colors.surface, content: colors.text, border: colors.border };
    case 'danger':
      return { background: colors.danger, content: colors.onDanger, border: 'transparent' };
    case 'ghost':
      return { background: 'transparent', content: colors.tint, border: 'transparent' };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const variantColors = colorsForVariant(variant, colors);
  const isInteractive = !disabled && !loading;

  return (
    <Pressable
      testID={testID}
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      // `busy` is what tells a screen reader the button is working rather than broken.
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'small' ? styles.small : styles.medium,
        {
          backgroundColor: variantColors.background,
          borderColor: variantColors.border,
        },
        fullWidth && styles.fullWidth,
        // Dimming on press and on disable keeps one visual language for "not available now".
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={variantColors.content} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={18} color={variantColors.content} /> : null}
          <Text
            variant={size === 'small' ? 'caption' : 'body'}
            weight="semibold"
            style={{ color: variantColors.content }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medium: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  small: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
