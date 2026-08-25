# Features

Business logic lives here — one directory per feature, named for the thing it does
(`pets/`, `reminders/`, `vet-visits/`), not for the technical layer it belongs to.

Nothing has been built yet. This directory exists so the first feature has an obvious home and an
established shape to follow.

## Shape of a feature

```
features/
  pets/
    index.ts          # public entry point — the ONLY module other code may import
    components/       # UI used by this feature and nothing else
    hooks/            # React state and effects for this feature
    api.ts            # talking to the network or the database
    model.ts          # types, and pure functions over them
    __tests__/
```

## Rules

1. **A feature is imported only through `index.ts`.** `import { PetList } from '@/features/pets'`
   is allowed; `import { PetList } from '@/features/pets/components/pet-list'` is not, and ESLint
   will reject it. The entry point is the feature's contract; everything behind it stays free to
   change.
2. **Features do not import each other.** If two features need the same thing, that thing belongs
   in `components/` (shared UI), `hooks/`, or `lib/`. Two features reaching into each other is how
   a codebase stops being separable.
3. **Routes stay thin.** A file in `app/` wires navigation, reads route params, and renders a
   feature's exported screen. Logic that would survive a navigation-library change belongs here,
   not there.
4. **Pure logic goes in `model.ts`.** Functions that take data and return data need no test
   harness, no mocks, and no renderer — which is what makes them cheap to test thoroughly.
5. **Shared vocabulary comes from `@/lib/domain`.** `Pet`, `Alert`, `SafeZone` and friends belong
   to the whole app, not to one feature. `model.ts` holds what is genuinely local to the feature.
6. **Data comes through `@/lib/data` ports, never from a database client.** A feature receives an
   `AppDataSource` and calls its repositories; it never imports Supabase, and it never decides
   authorization for itself — the server does. See ARCHITECTURE.md.

See [ARCHITECTURE.md](../ARCHITECTURE.md) for how this fits with the rest of the project.
