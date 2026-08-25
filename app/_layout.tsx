import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AuthErrorScreen, AuthLoadingScreen, AuthProvider, useAuth } from '@/features/auth';
import { useNavigationTheme } from '@/hooks/use-navigation-theme';
import { useTheme } from '@/hooks/use-theme';
import { env } from '@/lib/env';
import { userMessageFor } from '@/lib/errors';

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

/**
 * Chooses which half of the app exists.
 *
 * `Stack.Protected` removes the guarded routes from the navigator rather than hiding them, so a
 * signed-out user cannot reach `(owner)` by any means — a deep link, a stale history entry, or a
 * programmatic push all fail to resolve. That is stronger than redirecting after the fact, which
 * mounts the screen first and navigates away afterwards.
 *
 * While the session is still being restored, neither half is rendered at all. That is what stops
 * private chrome appearing for a frame before the app discovers the user is signed out.
 *
 * **This is navigation, not authorization.** It decides which screens exist, not what data they
 * may read. Every query is still answered by the database against the caller's session.
 *
 * Exported so its guards can be asserted directly. Expo Router only consults the default export,
 * so a named one changes nothing about routing.
 */
export function RootNavigator() {
  const { isAuthenticated, isResolvingSession, state, retry } = useAuth();

  useEffect(() => {
    // Held until the session question is settled, so the splash screen covers restoration instead
    // of handing over to a spinner for a frame.
    if (!isResolvingSession) {
      void SplashScreen.hideAsync();
    }
  }, [isResolvingSession]);

  if (isResolvingSession) {
    return <AuthLoadingScreen />;
  }

  if (state.status === 'error') {
    const detail = env.isProduction ? userMessageFor(state.error) : state.error.message;
    return <AuthErrorScreen message={detail} onRetry={retry} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(owner)" />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const navigationTheme = useNavigationTheme();
  const { scheme } = useTheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
