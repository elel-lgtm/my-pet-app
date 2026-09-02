import { PetEditScreen, usePetIdParam } from '@/features/pets';

export default function PetEditRoute() {
  return <PetEditScreen petId={usePetIdParam()} />;
}
