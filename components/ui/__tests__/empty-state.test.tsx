import { fireEvent, render, screen } from '@testing-library/react-native';

import { EmptyState } from '@/components/ui';

describe('EmptyState', () => {
  it('shows what is missing', async () => {
    await render(
      <EmptyState icon="pets" title="No pets yet" description="Pets you add appear here." />
    );

    expect(screen.getByText('No pets yet')).toBeTruthy();
    expect(screen.getByText('Pets you add appear here.')).toBeTruthy();
  });

  it('offers the action that resolves the emptiness', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        icon="pets"
        title="No pets yet"
        description="Add one to get started."
        action={{ label: 'Add a pet', onPress }}
      />
    );

    await fireEvent.press(screen.getByLabelText('Add a pet'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders without an action', async () => {
    await render(<EmptyState icon="map" title="Nothing here" description="Yet." />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
