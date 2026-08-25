import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useNavigationTheme } from '@/hooks/use-navigation-theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Exporting `ErrorBoundary` from the root layout makes it the fallback for any render error not
 * caught by a boundary closer to the failure.
 * @see https://docs.expo.dev/router/error-handling/
 */
export { ErrorBoundaryView as ErrorBoundary } from '@/components/error-boundary-view';

// Called in global scope, deliberately un-awaited: doing this inside a component or effect races
// with the first paint and the splash screen can disappear early.
// @see https://docs.expo.dev/versions/v54.0.0/sdk/splash-screen/
void SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(owner)',
};

export default function RootLayout() {
  const navigationTheme = useNavigationTheme();
  const { scheme } = useTheme();

  useEffect(() => {
    // Nothing is loaded asynchronously yet. When fonts or a session restore arrive, gate this on
    // their completion instead of on mount.
    void SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(owner)" />
          <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
        </Stack>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
