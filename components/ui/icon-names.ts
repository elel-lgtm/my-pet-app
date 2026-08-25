import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { type SymbolViewProps } from 'expo-symbols';
import { type ComponentProps } from 'react';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

/**
 * The app's icon set, keyed by intent rather than by either platform's naming.
 *
 * Every icon must be declared here with both renderings: an SF Symbol for iOS and a Material icon
 * for Android and web. Keeping one closed set means `IconName` is identical on every platform — the
 * template's original split let a name typecheck on iOS and render nothing everywhere else.
 *
 * SF Symbols: https://developer.apple.com/sf-symbols/ · Material: https://icons.expo.fyi
 */
export const ICONS = {
  home: { sf: 'house.fill', material: 'home' },
  pets: { sf: 'pawprint.fill', material: 'pets' },
  map: { sf: 'map.fill', material: 'map' },
  alerts: { sf: 'bell.fill', material: 'notifications' },
  settings: { sf: 'gearshape.fill', material: 'settings' },
  add: { sf: 'plus', material: 'add' },
  chevronRight: { sf: 'chevron.right', material: 'chevron-right' },
  close: { sf: 'xmark', material: 'close' },
  check: { sf: 'checkmark', material: 'check' },
  search: { sf: 'magnifyingglass', material: 'search' },
  warning: { sf: 'exclamationmark.triangle.fill', material: 'warning' },
  info: { sf: 'info.circle.fill', material: 'info' },
} as const satisfies Record<string, { sf: SymbolViewProps['name']; material: MaterialIconName }>;

export type IconName = keyof typeof ICONS;
