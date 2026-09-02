# Pets

The owner's pets: listing, creating, editing, archiving, and deleting them.

## What lives here

| File                  | Role                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `pets-state.ts`       | The list state machine, as a pure reducer. No React.                |
| `pets-provider.tsx`   | The one place pet state exists. Loads on session, mutates in place. |
| `pet-presentation.ts` | Turning a `Pet` into words: age, description, status labels.        |
| `use-pet-id-param.ts` | Validates the `id` route parameter before anything uses it.         |
| `screens/`            | List, detail, create, edit.                                         |
| `components/`         | Avatar, row, form, confirmation dialog.                             |

## Rules

1. **One source of truth.** `usePets()` reads the provider, mounted once in `app/(owner)/_layout`.
   It unmounts on sign-out, which is what stops one account's pets surviving into another session.
2. **No Supabase here.** ESLint blocks it. The provider calls the `PetRepository` port from
   `@/lib/data`; only the adapter behind it holds a client.
3. **Validation lives in the domain.** `parseCreatePetInput` judges create and edit alike, so an
   edit cannot introduce a value a new pet would have been refused for.
4. **Mutation failures go back to the caller**, not into shared state. A rejected create belongs on
   the form beside the field at fault; routing it through the provider would blank the list.
5. **The list is edited in place** after a mutation rather than refetched. A round trip after every
   change makes the screen flicker; `refresh` reconciles when the user asks.

## Archive and delete are different things

Both exist because the domain models both, and they answer different questions.

|                       | Archive                     | Delete                         |
| --------------------- | --------------------------- | ------------------------------ |
| Mechanism             | `status = 'archived'`       | `deleted_at` set (soft delete) |
| Visible to owner      | Yes, in "No longer tracked" | No                             |
| Reversible in the app | Yes                         | **No**                         |
| History retained      | Yes                         | Yes                            |

Delete is a one-way door for the client by design: `pets_update` requires `deleted_at is null`, so
nothing can edit or undelete the row afterwards. The row survives for referential integrity and
operator recovery, not as a wastebasket. The confirmation copy says so and points at archive.

## Photos

`PetAvatar` renders `photoUrl` whenever it is set and falls back to the pet's initial otherwise.
**Upload is not implemented** — there is no storage bucket, and creating one is a backend decision
rather than a UI one. The component needs no change when storage arrives: rows that gain a URL
start rendering it.

## Testing

`test-support/pets.tsx` provides a fake `PetRepository` and `renderWithPets`. The fake implements
the real port and mirrors the RLS predicate — owned, not soft-deleted — so a test expecting to see
another owner's pet fails for the same reason it would in production.

Row-level security itself is tested against the real database in `supabase/tests/rls.sql`, not
mocked.
