import { useRouter } from 'expo-router';

import { EmptyState, Screen, Spinner } from '@/components/ui';
import {
  changedFields,
  PetForm,
  toCreateInput,
  type PetFormValues,
} from '@/features/pets/components/pet-form';
import { usePets } from '@/features/pets/pets-provider';
import { type PetId } from '@/lib/domain/ids';
import { parseCreatePetInput, type Pet } from '@/lib/domain/pet';
import { type AppError } from '@/lib/errors';
import { err, type Result } from '@/lib/result';

/** The stored pet, as the form's string fields. */
function toFormValues(pet: Pet): PetFormValues {
  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed ?? '',
    dateOfBirth: pet.dateOfBirth ?? '',
    notes: pet.notes ?? '',
  };
}

/**
 * Edit a pet.
 *
 * Only changed fields are sent. Submitting the whole object would overwrite anything altered
 * elsewhere since this screen was opened, silently discarding it.
 *
 * Ownership is not editable here and is not part of the form. The update policy's `with check`
 * would refuse a reassignment anyway, but the field simply does not exist to be tampered with.
 */
export function PetEditScreen({ petId }: { petId: PetId | null }) {
  const router = useRouter();
  const { state, getById, update } = usePets();

  if (petId === null) {
    return (
      <Screen centered testID="pet-edit-invalid">
        <EmptyState
          icon="warning"
          title="Pet not found"
          description="That link does not point at a pet we can show you."
        />
      </Screen>
    );
  }

  if (state.status === 'loading') {
    return (
      <Screen centered testID="pet-edit-loading">
        <Spinner label="Loading" />
      </Screen>
    );
  }

  const pet = getById(petId);
  if (pet === null) {
    return (
      <Screen centered testID="pet-edit-missing">
        <EmptyState
          icon="warning"
          title="Pet not found"
          description="This pet may have been removed, or it belongs to someone else."
        />
      </Screen>
    );
  }

  async function onSubmit(values: PetFormValues): Promise<Result<unknown, AppError>> {
    const current = pet as Pet;

    // Validated with the same parser the create flow uses, so an edit cannot introduce a value a
    // new pet would have been refused for.
    const parsed = parseCreatePetInput(toCreateInput(values));
    if (!parsed.ok) {
      return err(parsed.error);
    }

    const patch = changedFields(
      {
        name: current.name,
        species: current.species,
        breed: current.breed,
        dateOfBirth: current.dateOfBirth,
        photoUrl: current.photoUrl,
        notes: current.notes,
      },
      parsed.value
    );

    const result = await update(current.id, patch);
    if (result.ok) {
      router.back();
    }
    return result;
  }

  return (
    <Screen padded={false} scrollable={false} testID="pet-edit">
      <PetForm
        initialValues={toFormValues(pet)}
        submitLabel="Save changes"
        onSubmit={onSubmit}
        testID="pet-edit-form"
      />
    </Screen>
  );
}
