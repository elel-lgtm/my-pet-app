import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ScreenProps = {
  children: ReactNode;
  /** Wraps content in a ScrollView. Use for anything that can exceed the viewport. */
  scrollable?: boolean | undefined;
  /** Applies the standard horizontal and vertical page padding. */
  padded?: boolean | undefined;
  /** Centres content on both axes — for empty and error states. */
  centered?: boolean | undefined;
  /**
   * Safe-area edges to inset. Defaults to the horizontal edges only, because the navigator
   * already accounts for the header and tab bar; a screen with `headerShown: false` should
   * pass `['top']` itself.
   */
  edges?: readonly Edge[] | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  contentContainerStyle?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
};

const DEFAULT_EDGES: readonly Edge[] = ['left', 'right'];

/** The outermost element of every screen: background colour, safe area, and page padding. */
export function Screen({
  children,
  scrollable = false,
  padded = true,
  centered = false,
  edges = DEFAULT_EDGES,
  style,
  contentContainerStyle,
  testID,
}: ScreenProps) {
  const { colors } = useTheme();

  const contentStyle = [
    padded && styles.padded,
    centered && styles.centered,
    contentContainerStyle,
  ];

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.root, { backgroundColor: colors.background }, style]}
      testID={testID}>
      {scrollable ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
