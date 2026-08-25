import { fireEvent, render, screen } from '@testing-library/react-native';

import { ListItem } from '@/components/ui';

describe('ListItem', () => {
  it('is a plain row when it has no press handler', async () => {
    await render(<ListItem title="Version" />);

    expect(screen.getByText('Version')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes a button when pressable', async () => {
    const onPress = jest.fn();
    await render(<ListItem title="Theme" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('announces title and subtitle as one label', async () => {
    await render(<ListItem title="Theme" subtitle="Follows your device" onPress={jest.fn()} />);

    expect(screen.getByLabelText('Theme, Follows your device')).toBeTruthy();
  });
});
