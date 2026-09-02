/**
 * The pets provider against a fake repository implementing the real port.
 *
 * No network. The fake mirrors the RLS predicate closely enough to be useful — it returns only
 * pets owned by the viewer and not soft-deleted — so a test that expects to see another owner's
 * pet fails here for the same reason it would fail in production.
 */

import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { usePets } from '@/features/pets';
import { AppError } from '@/lib/errors';
import { TEST_USER_ID } from '@/test-support/auth';
import {
  OTHER_OWNER_ID,
  PetsTestProvider,
  createFakePetRepository,
  makeTestPet,
  type FakePetRepository,
} from '@/test-support/pets';

function PetsProbe() {
  const { state, ownerId } = usePets();
  return (
    <>
      <Text testID="status">{state.status}</Text>
      <Text testID="count">{state.status === 'ready' ? String(state.pets.length) : '-'}</Text>
      <Text testID="names">
        {state.status === 'ready' ? state.pets.map((pet) => pet.name).join(',') : ''}
      </Text>
      <Text testID="owner">{ownerId ?? 'none'}</Text>
    </>
  );
}

async function mount(repository: FakePetRepository) {
  await render(
    <PetsTestProvider repository={repository}>
      <PetsProbe />
    </PetsTestProvider>
  );
  await waitFor(() => expect(screen.getByTestId('status').props.children).not.toBe('loading'));
}

function status(): string {
  return screen.getByTestId('status').props.children as string;
}

function names(): string {
  return screen.getByTestId('names').props.children as string;
}

describe('loading', () => {
  it('loads the owner pets once the session is known', async () => {
    const repository = createFakePetRepository({
      initialPets: [makeTestPet({ name: 'Biscuit' }), makeTestPet({ name: 'Mochi' })],
    });

    await mount(repository);

    expect(status()).toBe('ready');
    expect(screen.getByTestId('count').props.children).toBe('2');
    expect(screen.getByTestId('owner').props.children).toBe(TEST_USER_ID);
  });

  it('reports an empty account as ready and empty, not as an error', async () => {
    await mount(createFakePetRepository({ initialPets: [] }));

    expect(status()).toBe('ready');
    expect(screen.getByTestId('count').props.children).toBe('0');
  });

  it('surfaces a load failure as an error state', async () => {
    await mount(createFakePetRepository({ listError: new AppError('network', 'offline') }));

    expect(status()).toBe('error');
  });

  /**
   * The security property, asserted through the provider rather than assumed. The fake applies the
   * same owner predicate the policy does.
   */
  it('never surfaces another owner pet', async () => {
    const repository = createFakePetRepository({
      initialPets: [
        makeTestPet({ name: 'Mine' }),
        makeTestPet({ name: 'Theirs', ownerId: OTHER_OWNER_ID }),
      ],
    });

    await mount(repository);

    expect(names()).toBe('Mine');
  });

  it('never surfaces a soft-deleted pet', async () => {
    const repository = createFakePetRepository({
      initialPets: [
        makeTestPet({ name: 'Kept' }),
        makeTestPet({ name: 'Removed', deletedAt: makeTestPet().createdAt }),
      ],
    });

    await mount(repository);

    expect(names()).toBe('Kept');
  });
});

describe('refreshing', () => {
  function RefreshProbe() {
    const { refresh } = usePets();
    return (
      <Text testID="refresh" onPress={() => void refresh()}>
        refresh
      </Text>
    );
  }

  it('reloads without dropping back to the loading state', async () => {
    const repository = createFakePetRepository({ initialPets: [makeTestPet({ name: 'Biscuit' })] });
    await render(
      <PetsTestProvider repository={repository}>
        <PetsProbe />
        <RefreshProbe />
      </PetsTestProvider>
    );
    await waitFor(() => expect(status()).toBe('ready'));

    await act(async () => {
      screen.getByTestId('refresh').props.onPress();
    });

    await waitFor(() => expect(repository.calls.list).toBe(2));
    expect(status()).toBe('ready');
  });
});

describe('creating', () => {
  function CreateProbe({ input }: { input: Record<string, unknown> }) {
    const { create } = usePets();
    return (
      <Text testID="create" onPress={() => void create(input)}>
        create
      </Text>
    );
  }

  const VALID = {
    name: 'New Pet',
    species: 'cat',
    breed: null,
    dateOfBirth: null,
    photoUrl: null,
    notes: null,
  };

  async function mountWithCreate(repository: FakePetRepository, input: Record<string, unknown>) {
    await render(
      <PetsTestProvider repository={repository}>
        <PetsProbe />
        <CreateProbe input={input} />
      </PetsTestProvider>
    );
    await waitFor(() => expect(status()).toBe('ready'));
    await act(async () => {
      screen.getByTestId('create').props.onPress();
    });
  }

  it('adds the new pet to the list without refetching', async () => {
    const repository = createFakePetRepository({ initialPets: [] });

    await mountWithCreate(repository, VALID);

    await waitFor(() => expect(screen.getByTestId('count').props.children).toBe('1'));
    // One list call, from the initial load. A refetch after every create makes the screen flicker.
    expect(repository.calls.list).toBe(1);
  });

  /** Validation runs before the network, so malformed input never leaves the device. */
  it('rejects invalid input without calling the repository', async () => {
    const repository = createFakePetRepository({ initialPets: [] });

    await mountWithCreate(repository, { ...VALID, name: '' });

    expect(repository.calls.create).toBe(0);
    expect(screen.getByTestId('count').props.children).toBe('0');
  });

  it('leaves the list untouched when the server refuses', async () => {
    const repository = createFakePetRepository({
      initialPets: [],
      createError: new AppError('unauthorized', 'You do not have permission to do that.'),
    });

    await mountWithCreate(repository, VALID);

    expect(screen.getByTestId('count').props.children).toBe('0');
    // A rejected create is a form problem; the list must not fall into an error state over it.
    expect(status()).toBe('ready');
  });
});

describe('updating and archiving', () => {
  function ActionProbe({ action }: { action: 'rename' | 'archive' | 'remove' | 'revive' }) {
    const { state, update, changeStatus, remove } = usePets();
    const petId = state.status === 'ready' ? state.pets[0]?.id : undefined;

    return (
      <Text
        testID="act"
        onPress={() => {
          if (petId === undefined) {
            return;
          }
          if (action === 'rename') {
            void update(petId, { name: 'Renamed' });
          } else if (action === 'archive') {
            void changeStatus(petId, 'archived');
          } else if (action === 'revive') {
            void changeStatus(petId, 'active');
          } else {
            void remove(petId);
          }
        }}>
        act
      </Text>
    );
  }

  async function mountWith(
    repository: FakePetRepository,
    action: 'rename' | 'archive' | 'remove' | 'revive'
  ) {
    await render(
      <PetsTestProvider repository={repository}>
        <PetsProbe />
        <ActionProbe action={action} />
      </PetsTestProvider>
    );
    await waitFor(() => expect(status()).toBe('ready'));
    await act(async () => {
      screen.getByTestId('act').props.onPress();
    });
  }

  it('replaces the pet in place after an edit', async () => {
    const repository = createFakePetRepository({ initialPets: [makeTestPet({ name: 'Biscuit' })] });

    await mountWith(repository, 'rename');

    await waitFor(() => expect(names()).toBe('Renamed'));
  });

  it('keeps an archived pet in the list, because it is still the owner record', async () => {
    const repository = createFakePetRepository({ initialPets: [makeTestPet({ name: 'Biscuit' })] });

    await mountWith(repository, 'archive');

    await waitFor(() => expect(repository.calls.changeStatus).toBe(1));
    expect(screen.getByTestId('count').props.children).toBe('1');
    expect(repository.snapshot()[0]?.status).toBe('archived');
  });

  it('drops a removed pet from the list', async () => {
    const repository = createFakePetRepository({ initialPets: [makeTestPet({ name: 'Biscuit' })] });

    await mountWith(repository, 'remove');

    await waitFor(() => expect(screen.getByTestId('count').props.children).toBe('0'));
    // Soft delete: the row survives so history keeps its references.
    expect(repository.snapshot()[0]?.deletedAt).not.toBeNull();
  });

  it('refuses a status change the domain forbids', async () => {
    const repository = createFakePetRepository({
      initialPets: [makeTestPet({ name: 'Gone', status: 'deceased' })],
    });

    await mountWith(repository, 'revive');

    await waitFor(() => expect(repository.calls.changeStatus).toBe(1));
    expect(repository.snapshot()[0]?.status).toBe('deceased');
  });
});

describe('usePets outside a provider', () => {
  it('throws rather than reporting an empty list', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(render(<PetsProbe />)).rejects.toThrow(/PetsProvider/);
  });
});
