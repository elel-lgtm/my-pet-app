import { SymbolView } from 'expo-symbols';
import { type OpaqueColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { ICONS, type IconName } from '@/components/ui/icon-names';

// Must stay identical to the type in `icon.tsx`: they are two implementations of one module.
export type IconProps = {
  name: IconName;
  size?: number | undefined;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle> | undefined;
};

/** Native SF Symbols on iOS. The Android and web fallback lives in `icon.tsx`. */
export function Icon({ name, size = 24, color, style }: IconProps) {
  return (
    <SymbolView
      name={ICONS[name].sf}
      tintColor={color as string}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
    />
  );
}
