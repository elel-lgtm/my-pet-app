/**
 * The design system's public surface.
 *
 * Screens and features import from `@/components/ui` rather than reaching for individual files, so
 * the set of available primitives is discoverable in one place and internal file layout stays free
 * to change.
 */

export { Badge, type BadgeTone } from '@/components/ui/badge';
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui/button';
export { Divider } from '@/components/ui/divider';
export { EmptyState, type EmptyStateProps } from '@/components/ui/empty-state';
export { Icon, type IconProps } from '@/components/ui/icon';
export { ICONS, type IconName } from '@/components/ui/icon-names';
export { IconButton, type IconButtonProps } from '@/components/ui/icon-button';
export { ListItem, type ListItemProps } from '@/components/ui/list-item';
export { Screen, type ScreenProps } from '@/components/ui/screen';
export { Section, type SectionProps } from '@/components/ui/section';
export { Spinner } from '@/components/ui/spinner';
export { Surface, type SurfaceProps } from '@/components/ui/surface';
export { Text, type TextProps, type TextVariant, type TextWeight } from '@/components/ui/text';
export { TextField, type TextFieldProps } from '@/components/ui/text-field';
