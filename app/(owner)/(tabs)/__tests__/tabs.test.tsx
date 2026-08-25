import { render, screen } from '@testing-library/react-native';

import { TEST_SESSION, renderWithAuth } from '@/test-support/auth';

import AlertsScreen from '@/app/(owner)/(tabs)/alerts';
import HomeScreen from '@/app/(owner)/(tabs)/index';
import MapScreen from '@/app/(owner)/(tabs)/map';
import PetsScreen from '@/app/(owner)/(tabs)/pets';
import SettingsScreen from '@/app/(owner)/(tabs)/settings';

describe('owner tab screens', () => {
  it('Home explains that nothing has been added yet', async () => {
    await render(<HomeScreen />);

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Nothing to show yet')).toBeTruthy();
  });

  it('Pets shows an empty roster', async () => {
    await render(<PetsScreen />);

    expect(screen.getByText('No pets yet')).toBeTruthy();
  });

  it('Map says the provider is not chosen', async () => {
    await render(<MapScreen />);

    expect(screen.getByText('Map coming soon')).toBeTruthy();
  });

  it('Alerts shows an empty list', async () => {
    await render(<AlertsScreen />);

    expect(screen.getByText('No alerts')).toBeTruthy();
  });

  it('Settings reports the build it is running', async () => {
    // Settings reads the session for the account row, so it needs the provider.
    await renderWithAuth(<SettingsScreen />, { initialSession: TEST_SESSION });

    expect(screen.getByText('Version')).toBeTruthy();
    // jest.setup.ts pins EXPO_PUBLIC_APP_ENV to development.
    expect(screen.getByText('development')).toBeTruthy();
  });

  it('Settings shows who is signed in and offers a way out', async () => {
    await renderWithAuth(<SettingsScreen />, { initialSession: TEST_SESSION });

    expect(screen.getByText(TEST_SESSION.user.email)).toBeTruthy();
    expect(screen.getByLabelText('Sign out')).toBeTruthy();
  });
});
