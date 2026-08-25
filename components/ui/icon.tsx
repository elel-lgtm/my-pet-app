// Android and web: SF Symbols do not exist, so the Material equivalent is rendered instead.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  type OpaqueColorValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { ICONS, type IconName } from '@/components/ui/icon-names';

// Must stay identical to the type in `icon.ios.tsx`: they are two implementations of one module.
export type IconProps = {
  name: IconName;
  size?: number | undefined;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle> | undefined;
};

export function Icon({ name, size = 24, color, style }: IconProps) {
  return (
    <MaterialIcons
      name={ICONS[name].material}
      size={size}
      color={color}
      // Safe narrowing: the layout properties an icon is styled with are common to both.
      style={style as StyleProp<TextStyle>}
    />
  );
}
