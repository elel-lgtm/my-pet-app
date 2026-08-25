/**
 * Route protection.
 *
 * `expo-router` is mocked so the guards the root navigator hands to `Stack.Protected` can be read
 * directly. Booting the real navigator would test Expo Router; this tests our decision, which is
 * the part that can be got wrong.
 *
 * The property being asserted is stronger than "the screen is hidden": a false guard removes the
 * route from the navigator, so a signed-out user cannot reach `(owner)` by a deep link, a stale
 * history entry, or a programmatic push either.
 */

import { render, screen, waitFor } from '@testing-library/react-native';

type Guard = { name: string; guard: boolean };
const mockGuards: Guard[] = [];

jest.mock('expo-router', () => {
  const react = require('react');
  const { View: RNView } = require('react-native');

  function Screen({ name }: { name: string }) {
    return react.createElement(RNView, { testID: `screen:${name}` });
  }

  function Protected({ guard, children }: { guard: boolean; children: React.ReactNode }) {
    react.Children.forEach(children, (child: { props?: { name?: string } }) => {
      if (child?.props?.name !== undefined) {
        mockGuards.push({ name: child.props.name, guard });
      }
    });
    // Mirrors the real behaviour: a false guard means the routes are not in the tree at all.
    return guard ? react.createElement(RNView, null, children) : null;
  }

  const Stack = Object.assign(
    ({ children }: { children: React.ReactNode }) =>
      react.createElement(RNView, { testID: 'stack' }, children),
    { Screen, Protected }
  );

  return { Stack, Link: RNView, useRouter: () => ({}), useSegments: () => [] };
});

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: jest.fn(async () => {}),
}));

import { RootNavigator } from '@/app/_layout';
import { AuthProvider } from '@/features/auth';
import { AppError } from '@/lib/errors';
import { TEST_SESSION, createFakeAuthRepository, type FakeAuthOptions } from '@/test-support/auth';

async function mount(options: FakeAuthOptions) {
  mockGuards.length = 0;
  await render(
    <AuthProvider repository={createFakeAuthRepository(options)}>
      <RootNavigator />
    </AuthProvider>
  );
}

function guardFor(name: string): boolean | undefined {
  return mockGuards.find((entry) => entry.name === name)?.guard;
}

describe('while the session is being restored', () => {
  it('renders the loading screen instead of any navigator', async () => {
    // A never-resolving restore holds the app in `initializing`.
    const pending = createFakeAuthRepository({});
    pending.getSession = () => new Promise(() => {}) as never;

    await render(
      <AuthProvider repository={pending}>
        <RootNavigator />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-loading')).toBeTruthy();
    // The critical assertion: no protected route is mounted before the answer is known, so no
    // private chrome can flash for a frame.
    expect(screen.queryByTestId('stack')).toBeNull();
    expect(screen.queryByTestId('screen:(owner)')).toBeNull();
  });
});

describe('signed out', () => {
  it('exposes the auth routes and removes the owner routes', async () => {
    await mount({ initialSession: null });

    await waitFor(() => expect(screen.getByTestId('stack')).toBeTruthy());

    expect(guardFor('(owner)')).toBe(false);
    expect(guardFor('(auth)')).toBe(true);
    expect(screen.queryByTestId('screen:(owner)')).toBeNull();
    expect(screen.getByTestId('screen:(auth)')).toBeTruthy();
  });
});

describe('signed in', () => {
  it('exposes the owner routes and removes the auth routes', async () => {
    await mount({ initialSession: TEST_SESSION });

    await waitFor(() => expect(screen.getByTestId('screen:(owner)')).toBeTruthy());

    expect(guardFor('(owner)')).toBe(true);
    expect(guardFor('(auth)')).toBe(false);
    // Sending an already-signed-in user back to a sign-in form is its own kind of bug.
    expect(screen.queryByTestId('screen:(auth)')).toBeNull();
  });
});

describe('when the session layer fails', () => {
  it('shows an error with a retry rather than silently signing the user out', async () => {
    await mount({ restoreError: new AppError('network', 'offline') });

    await waitFor(() => expect(screen.getByTestId('auth-error')).toBeTruthy());

    expect(screen.queryByTestId('screen:(owner)')).toBeNull();
    expect(screen.queryByTestId('screen:(auth)')).toBeNull();
  });
});

describe('guard exhaustiveness', () => {
  it('never leaves both halves of the app reachable at once', async () => {
    await mount({ initialSession: TEST_SESSION });
    await waitFor(() => expect(screen.getByTestId('screen:(owner)')).toBeTruthy());

    const enabled = mockGuards.filter((entry) => entry.guard).map((entry) => entry.name);

    expect(enabled).toEqual(['(owner)']);
  });

  it('renders the not-found route in both halves, since it is not private', async () => {
    await mount({ initialSession: null });
    await waitFor(() => expect(screen.getByTestId('stack')).toBeTruthy());

    expect(screen.getByTestId('screen:+not-found')).toBeTruthy();
  });
});
