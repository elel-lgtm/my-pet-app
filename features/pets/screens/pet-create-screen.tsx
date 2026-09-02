import { useRouter } from 'expo-router';

import { Screen } from '@/components/ui';
import { PetForm, toCreateInput, type PetFormValues } from '@/features/pets/components/pet-form';
import { usePets } from '@/features/pets/pets-provider';
import { type AppError } from '@/lib/errors';
import { type Result } from '@/lib/result';

/**
 * Add a pet.
 *
 * On success it returns to wherever the user came from rather than pushing the new pet's detail
 * screen. Adding two pets in a row is common, and a forward push would leave them tapping back
 * twice to reach the list.
 */
export function PetCreateScreen() {
  const router = useRouter();
  const { create } = usePets();

  async function onSubmit(values: PetFormValues): Promise<Result<unknown, AppError>> {
    const result = await create(toCreateInput(values));
    if (result.ok) {
      if (router.canGoBack()) {
        router.back();
      } else {
        // Reached by deep link straight into /pets/new, where there is no history to pop.
        router.replace('/pets');
      }
    }
    return result;
  }

  return (
    <Screen padded={false} scrollable={false} testID="pet-create">
      <PetForm submitLabel="Add pet" onSubmit={onSubmit} testID="pet-create-form" />
    </Screen>
  );
}
