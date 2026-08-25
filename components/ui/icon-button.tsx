import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { type IconName } from '@/components/ui/icon-names';
import { MIN_TOUCH_TARGET, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconButtonProps = {
  name: IconName;
  onPress: () => void;
  /** Required: an icon with no label is invisible to a screen reader without one. */
  accessibilityLabel: string;
  size?: number | undefined;
  color?: string | undefined;
  disabled?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
};

export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  size = 24,
  color,
  disabled = false,
  style,
  testID,
}: IconButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      // The tappable box stays at the accessibility minimum even when the glyph is smaller.
      hitSlop={Math.max(0, (MIN_TOUCH_TARGET - size) / 2)}
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <Icon name={name} size={size} color={color ?? colors.tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.4,
  },
});
