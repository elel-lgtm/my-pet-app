/**
 * Pet management: the owner's pets, and everything that reads or changes them.
 *
 * Everything outside this directory imports from here. The provider is the single source of truth
 * for the signed-in owner's pets; no screen keeps its own copy.
 *
 * Nothing here decides authorization. Every read and write is answered by the database against the
 * caller's session — see the pets policies in DATABASE.md.
 */

export {
  PetsProvider,
  usePet,
  usePets,
  type PetsContextValue,
} from '@/features/pets/pets-provider';
export {
  activePets,
  findPet,
  inactivePets,
  initialPetsState,
  petsReducer,
  type PetsAction,
  type PetsState,
} from '@/features/pets/pets-state';
export {
  describePet,
  formatAge,
  formatMissingSince,
  speciesLabel,
  statusLabel,
  statusTone,
} from '@/features/pets/pet-presentation';
export { PetAvatar } from '@/features/pets/components/pet-avatar';
export { usePetIdParam } from '@/features/pets/use-pet-id-param';
export { PetCreateScreen } from '@/features/pets/screens/pet-create-screen';
export { PetDetailScreen } from '@/features/pets/screens/pet-detail-screen';
export { PetEditScreen } from '@/features/pets/screens/pet-edit-screen';
export { PetListScreen } from '@/features/pets/screens/pet-list-screen';
