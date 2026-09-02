/**
 * The pet screens, driven through the real providers against a fake repository.
 *
 * Assertions are on what a person perceives — visible text, accessibility labels, whether a
 * control exists — rather than on component internals.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { PetCreateScreen, PetDetailScreen, PetEditScreen, PetListScreen } from '@/features/pets';
import { AppError } from '@/lib/errors';
import { unsafeId, type PetId } from '@/lib/domain/ids';
import {
  createFakePetRepository,
  makeTestPet,
  renderWithPets,
  type FakePetRepository,
} from '@/test-support/pets';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: jest.fn(),
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({}),
}));

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
});

describe('pet list', () => {
  it('shows a spinner before the first load settles', async () => {
    const repository = createFakePetRepository({ initialPets: [] });
    // A repository that never resolves holds the screen in its loading state.
    repository.listAccessibleBy = () => new Promise(() => {}) as never;

    await renderWithPets(<PetListScreen />, { repository });

    expect(screen.getByTestId('pets-loading')).toBeTruthy();
  });

  it('lists the pets with a description', async () => {
    await renderWithPets(<PetListScreen />, {
      initialPets: [makeTestPet({ name: 'Biscuit', breed: 'Beagle' })],
    });

    await waitFor(() => expect(screen.getByText('Biscuit')).toBeTruthy());
    expect(screen.getByText(/Beagle/)).toBeTruthy();
  });

  it('invites the first pet when the account is empty', async () => {
    await renderWithPets(<PetListScreen />, { initialPets: [] });

    await waitFor(() => expect(screen.getByTestId('pets-empty')).toBeTruthy());
    expect(screen.getByText('No pets yet')).toBeTruthy();
  });

  it('offers a retry when loading failed', async () => {
    const repository = createFakePetRepository({
      listError: new AppError('network', 'offline'),
    });

    await renderWithPets(<PetListScreen />, { repository });

    await waitFor(() => expect(screen.getByTestId('pets-error')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Try again'));

    await waitFor(() => expect(repository.calls.list).toBe(2));
  });

  it('announces each row as one control rather than four fragments', async () => {
    await renderWithPets(<PetListScreen />, {
      initialPets: [makeTestPet({ name: 'Biscuit', breed: 'Beagle', status: 'lost' })],
    });

    await waitFor(() => expect(screen.getByLabelText(/Biscuit.*Beagle.*Lost/)).toBeTruthy());
  });

  /** Archived pets are still the owner's, but must not compete with the animals being tracked. */
  it('separates archived pets from the active list', async () => {
    await renderWithPets(<PetListScreen />, {
      initialPets: [
        makeTestPet({ name: 'Current', status: 'active' }),
        makeTestPet({ name: 'Retired', status: 'archived' }),
      ],
    });

    await waitFor(() => expect(screen.getByText('Current')).toBeTruthy());
    expect(screen.getByText('No longer tracked')).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
  });

  it('opens a pet when its row is pressed', async () => {
    const pet = makeTestPet({ name: 'Biscuit' });
    await renderWithPets(<PetListScreen />, { initialPets: [pet] });
    await waitFor(() => expect(screen.getByText('Biscuit')).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`pet-row-${pet.id}`));

    expect(mockPush).toHaveBeenCalledWith(`/pets/${pet.id}`);
  });
});

describe('create', () => {
  async function fillValidForm() {
    await fireEvent.changeText(screen.getByTestId('pet-name'), 'Mochi');
    await fireEvent.press(screen.getByTestId('pet-species-cat'));
  }

  it('creates a pet and returns to where the user came from', async () => {
    const { repository } = await renderWithPets(<PetCreateScreen />, { initialPets: [] });

    await fillValidForm();
    await fireEvent.press(screen.getByLabelText('Add pet'));

    await waitFor(() => expect(repository.calls.create).toBe(1));
    expect(mockBack).toHaveBeenCalled();
  });

  it('requires a name before submitting', async () => {
    const { repository } = await renderWithPets(<PetCreateScreen />, { initialPets: [] });

    await fireEvent.press(screen.getByLabelText('Add pet'));

    await waitFor(() => expect(screen.getByText(/Name is required/i)).toBeTruthy());
    expect(repository.calls.create).toBe(0);
  });

  it('rejects a birth date in the future', async () => {
    const { repository } = await renderWithPets(<PetCreateScreen />, { initialPets: [] });

    await fillValidForm();
    await fireEvent.changeText(screen.getByTestId('pet-date-of-birth'), '2999-01-01');
    await fireEvent.press(screen.getByLabelText('Add pet'));

    await waitFor(() => expect(screen.getByText(/cannot be in the future/i)).toBeTruthy());
    expect(repository.calls.create).toBe(0);
  });

  it('rejects a malformed birth date', async () => {
    const { repository } = await renderWithPets(<PetCreateScreen />, { initialPets: [] });

    await fillValidForm();
    await fireEvent.changeText(screen.getByTestId('pet-date-of-birth'), '02/04/2019');
    await fireEvent.press(screen.getByLabelText('Add pet'));

    await waitFor(() => expect(screen.getByText(/YYYY-MM-DD/i)).toBeTruthy());
    expect(repository.calls.create).toBe(0);
  });

  /** A double tap must not land two pets. */
  it('does not submit twice when the button is tapped repeatedly', async () => {
    const { repository } = await renderWithPets(<PetCreateScreen />, { initialPets: [] });

    await fillValidForm();
    const submit = screen.getByLabelText('Add pet');
    await fireEvent.press(submit);
    await fireEvent.press(submit);

    await waitFor(() => expect(repository.calls.create).toBe(1));
  });

  it('shows a server refusal without discarding what was typed', async () => {
    await renderWithPets(<PetCreateScreen />, {
      initialPets: [],
      createError: new AppError('unauthorized', 'You do not have permission to do that.'),
    });

    await fillValidForm();
    await fireEvent.press(screen.getByLabelText('Add pet'));

    await waitFor(() =>
      expect(screen.getByText('You do not have permission to do that.')).toBeTruthy()
    );
    expect(screen.getByTestId('pet-name').props.value).toBe('Mochi');
  });

  it('offers every species as a labelled choice', async () => {
    await renderWithPets(<PetCreateScreen />, { initialPets: [] });

    for (const label of ['Dog', 'Cat', 'Rabbit', 'Bird', 'Other']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });
});

describe('detail', () => {
  it('shows the pet and where future features will attach', async () => {
    const pet = makeTestPet({ name: 'Biscuit', breed: 'Beagle', notes: 'Scared of bikes' });
    await renderWithPets(<PetDetailScreen petId={pet.id} />, { initialPets: [pet] });

    await waitFor(() => expect(screen.getByText('Biscuit')).toBeTruthy());
    expect(screen.getByText('Scared of bikes')).toBeTruthy();
    expect(screen.getByText('Tracker')).toBeTruthy();
    expect(screen.getByText('Safe zones')).toBeTruthy();
  });

  /** Saying "not allowed" would confirm the pet exists. Absent and forbidden look the same. */
  it('reports another owner pet as simply not found', async () => {
    const unknown = unsafeId<PetId>('99999999-9999-4999-8999-999999999999');
    await renderWithPets(<PetDetailScreen petId={unknown} />, { initialPets: [makeTestPet()] });

    await waitFor(() => expect(screen.getByTestId('pet-detail-missing')).toBeTruthy());
    expect(screen.queryByText(/permission|not allowed|forbidden/i)).toBeNull();
  });

  it('reports a malformed route parameter as not found', async () => {
    await renderWithPets(<PetDetailScreen petId={null} />, { initialPets: [makeTestPet()] });

    expect(screen.getByTestId('pet-detail-invalid')).toBeTruthy();
  });

  it('says when a pet is missing', async () => {
    const pet = makeTestPet({ name: 'Biscuit', status: 'lost', lostAt: makeTestPet().createdAt });
    await renderWithPets(<PetDetailScreen petId={pet.id} />, { initialPets: [pet] });

    await waitFor(() => expect(screen.getByText(/Missing since/)).toBeTruthy());
  });
});

describe('archive and delete', () => {
  async function openDetail(repository: FakePetRepository, pet = repository.snapshot()[0]) {
    await renderWithPets(<PetDetailScreen petId={pet?.id ?? null} />, { repository });
    await waitFor(() => expect(screen.getByTestId('pet-detail')).toBeTruthy());
  }

  it('asks before archiving', async () => {
    const repository = createFakePetRepository({ initialPets: [makeTestPet({ name: 'Biscuit' })] });
    await openDetail(repository);

    await fireEvent.press(screen.getByTestId('pet-archive'));

    expect(screen.getByText('Archive Biscuit?')).toBeTruthy();
    // Nothing has happened yet: the confirmation is a question, not a countdown.
    expect(repository.calls.changeStatus).toBe(0);
  });

  it('archives once confirmed', async () => {
    const repository = createFakePetRepository({ initialPets: [makeTestPet({ name: 'Biscuit' })] });
    await openDetail(repository);

    await fireEvent.press(screen.getByTestId('pet-archive'));
    await fireEvent.press(screen.getByTestId('confirm-accept'));

    await waitFor(() => expect(repository.snapshot()[0]?.status).toBe('archived'));
  });

  it('does nothing when the confirmation is dismissed', async () => {
    const repository = createFakePetRepository({ initialPets: [makeTestPet({ name: 'Biscuit' })] });
    await openDetail(repository);

    await fireEvent.press(screen.getByTestId('pet-archive'));
    await fireEvent.press(screen.getByTestId('confirm-cancel'));

    expect(repository.calls.changeStatus).toBe(0);
    expect(screen.queryByText('Archive Biscuit?')).toBeNull();
  });

  it('warns that deleting cannot be undone, and suggests archiving instead', async () => {
    const repository = createFakePetRepository({ initialPets: [makeTestPet({ name: 'Biscuit' })] });
    await openDetail(repository);

    await fireEvent.press(screen.getByTestId('pet-delete'));

    expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    expect(screen.getByText(/Archive instead/i)).toBeTruthy();
  });

  it('soft-deletes once confirmed and leaves the screen', async () => {
    const repository = createFakePetRepository({ initialPets: [makeTestPet({ name: 'Biscuit' })] });
    await openDetail(repository);

    await fireEvent.press(screen.getByTestId('pet-delete'));
    await fireEvent.press(screen.getByTestId('confirm-accept'));

    await waitFor(() => expect(repository.snapshot()[0]?.deletedAt).not.toBeNull());
    expect(mockBack).toHaveBeenCalled();
  });

  it('offers to restore an archived pet', async () => {
    const repository = createFakePetRepository({
      initialPets: [makeTestPet({ name: 'Biscuit', status: 'archived' })],
    });
    await openDetail(repository);

    await fireEvent.press(screen.getByTestId('pet-restore'));

    await waitFor(() => expect(repository.snapshot()[0]?.status).toBe('active'));
  });

  /** A deceased pet cannot be revived, so the control is absent rather than failing on press. */
  it('does not offer to restore a deceased pet', async () => {
    const repository = createFakePetRepository({
      initialPets: [makeTestPet({ name: 'Biscuit', status: 'deceased' })],
    });
    await openDetail(repository);

    expect(screen.queryByTestId('pet-restore')).toBeNull();
  });
});

describe('edit', () => {
  it('opens with the stored values', async () => {
    const pet = makeTestPet({ name: 'Biscuit', breed: 'Beagle' });
    await renderWithPets(<PetEditScreen petId={pet.id} />, { initialPets: [pet] });

    await waitFor(() => expect(screen.getByTestId('pet-name').props.value).toBe('Biscuit'));
    expect(screen.getByTestId('pet-breed').props.value).toBe('Beagle');
  });

  it('saves a change and returns', async () => {
    const pet = makeTestPet({ name: 'Biscuit' });
    const { repository } = await renderWithPets(<PetEditScreen petId={pet.id} />, {
      initialPets: [pet],
    });
    await waitFor(() => expect(screen.getByTestId('pet-name').props.value).toBe('Biscuit'));

    await fireEvent.changeText(screen.getByTestId('pet-name'), 'Biscuit II');
    await fireEvent.press(screen.getByLabelText('Save changes'));

    await waitFor(() => expect(repository.snapshot()[0]?.name).toBe('Biscuit II'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('applies the same validation a new pet gets', async () => {
    const pet = makeTestPet({ name: 'Biscuit' });
    const { repository } = await renderWithPets(<PetEditScreen petId={pet.id} />, {
      initialPets: [pet],
    });
    await waitFor(() => expect(screen.getByTestId('pet-name').props.value).toBe('Biscuit'));

    await fireEvent.changeText(screen.getByTestId('pet-name'), '');
    await fireEvent.press(screen.getByLabelText('Save changes'));

    await waitFor(() => expect(screen.getByText(/Name is required/i)).toBeTruthy());
    expect(repository.calls.update).toBe(0);
  });

  it('reports a pet it cannot see as not found', async () => {
    const unknown = unsafeId<PetId>('99999999-9999-4999-8999-999999999999');
    await renderWithPets(<PetEditScreen petId={unknown} />, { initialPets: [makeTestPet()] });

    await waitFor(() => expect(screen.getByTestId('pet-edit-missing')).toBeTruthy());
  });

  /** Ownership is not part of the form, so there is no control that could attempt to change it. */
  it('offers no way to change ownership', async () => {
    const pet = makeTestPet({ name: 'Biscuit' });
    await renderWithPets(<PetEditScreen petId={pet.id} />, { initialPets: [pet] });
    await waitFor(() => expect(screen.getByTestId('pet-name')).toBeTruthy());

    expect(screen.queryByLabelText(/owner/i)).toBeNull();
    expect(screen.queryByTestId('pet-owner')).toBeNull();
  });
});
