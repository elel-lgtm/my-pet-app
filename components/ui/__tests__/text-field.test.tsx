import { fireEvent, render, screen } from '@testing-library/react-native';

import { TextField } from '@/components/ui';

describe('TextField', () => {
  it('links its visible label to the input', async () => {
    await render(<TextField label="Pet name" value="" onChangeText={jest.fn()} />);

    expect(screen.getByLabelText('Pet name')).toBeTruthy();
  });

  it('reports typing', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Pet name" value="" onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByLabelText('Pet name'), 'Biscuit');

    expect(onChangeText).toHaveBeenCalledWith('Biscuit');
  });

  it('shows an error and exposes it to assistive tech', async () => {
    await render(
      <TextField label="Pet name" value="" onChangeText={jest.fn()} error="Name is required" />
    );

    expect(screen.getByText('Name is required')).toBeTruthy();
    expect(screen.getByLabelText('Pet name').props.accessibilityHint).toBe('Name is required');
  });

  it('prefers the error over the helper text when both are present', async () => {
    await render(
      <TextField
        label="Pet name"
        value=""
        onChangeText={jest.fn()}
        helperText="As it appears on their tag"
        error="Name is required"
      />
    );

    expect(screen.getByText('Name is required')).toBeTruthy();
    expect(screen.queryByText('As it appears on their tag')).toBeNull();
  });
});
