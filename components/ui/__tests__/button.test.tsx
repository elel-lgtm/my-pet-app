import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/components/ui';

describe('Button', () => {
  it('renders its label and calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Add a pet" onPress={onPress} />);

    await fireEvent.press(screen.getByText('Add a pet'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByLabelText('Save'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Save')).toBeDisabled();
  });

  it('does not fire while loading, and reports itself as busy', async () => {
    const onPress = jest.fn();
    await render(<Button label="Saving" onPress={onPress} loading />);

    const button = screen.getByLabelText('Saving');
    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeBusy();
  });

  it('hides the label while loading so the spinner is the only status', async () => {
    await render(<Button label="Saving" onPress={jest.fn()} loading />);

    expect(screen.queryByText('Saving')).toBeNull();
  });

  it('accepts an accessibility label distinct from the visible one', async () => {
    await render(
      <Button label="Add" onPress={jest.fn()} accessibilityLabel="Add a pet to your list" />
    );

    expect(screen.getByLabelText('Add a pet to your list')).toBeTruthy();
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'renders the %s variant',
    async (variant) => {
      await render(<Button label={variant} onPress={jest.fn()} variant={variant} />);

      expect(screen.getByText(variant)).toBeTruthy();
    }
  );
});
