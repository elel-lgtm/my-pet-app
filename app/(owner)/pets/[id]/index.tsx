import { PetDetailScreen, usePetIdParam } from '@/features/pets';

/** Route params are untrusted; `usePetIdParam` returns null for anything that is not a uuid. */
export default function PetDetailRoute() {
  return <PetDetailScreen petId={usePetIdParam()} />;
}
