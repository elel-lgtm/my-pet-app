import { fireEvent, render, screen } from '@testing-library/react-native';

import { ErrorBoundaryView } from '@/components/error-boundary-view';
import { AppError } from '@/lib/errors';

/** A no-op retry, matching the async signature Expo Router hands to an ErrorBoundary. */
const noop = async () => {};

// Note: in @testing-library/react-native v14 both `render` and `fireEvent` are async, because
// React 19's `act` is. Forgetting to await them yields an empty `screen`, not a failed assertion.
describe('ErrorBoundaryView', () => {
  it('shows recovery copy rather than the raw error text', async () => {
    await render(<ErrorBoundaryView error={new AppError('network', 'ECONNRESET')} retry={noop} />);

    expect(screen.getByText(/You appear to be offline/)).toBeTruthy();
  });

  it('surfaces diagnostics outside production, where they help a developer', async () => {
    await render(
      <ErrorBoundaryView error={new AppError('server', 'pets-db-3 unreachable')} retry={noop} />
    );

    expect(screen.getByText(/server: pets-db-3 unreachable/)).toBeTruthy();
  });

  it('retries when the button is pressed', async () => {
    const retry = jest.fn();
    await render(<ErrorBoundaryView error={new Error('boom')} retry={retry} />);

    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
