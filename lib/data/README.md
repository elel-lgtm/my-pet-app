# Data access

The boundary between feature logic and stored data.

```
UI (app/, components/)
  ↓  renders
feature logic (features/*)
  ↓  calls ports
ports (ports.ts)              ← the only contract
  ↓  implemented by
adapters
  ├── in-memory-data-source.ts   development and tests (present)
  └── supabase/                  production (not written yet)
        ↓
      PostgreSQL + row-level security
```

## Rules

1. **`ports.ts` is the contract.** Features depend on those interfaces, never on an adapter and
   never on a database client. ESLint blocks `app/` and `components/` from importing
   `@/lib/supabase` or `@supabase/*` at all.
2. **Adapters translate, they do not decide.** Row shapes, column names, joins, and pagination
   live inside an adapter. Domain types come out.
3. **Authorization is not an adapter's job.** An adapter issues a query; the database applies
   row-level security and returns what the caller is allowed to see. An adapter that filters for
   safety is hiding a missing policy.
4. **The in-memory adapter stays.** It is what makes feature tests fast and hermetic, and Supabase
   does not replace it. Both satisfy `AppDataSource`.

## Adding the Supabase adapter

When the schema exists, one file per aggregate under `supabase/` — `pet-repository.ts`,
`alert-repository.ts`, and so on — each taking an `AppSupabaseClient` and implementing one port,
composed by a `createSupabaseDataSource()` that returns an `AppDataSource`.

Two translations are not mechanical and belong in one place per entity: coordinates (two flat
columns ↔ a nested `Coordinates`) and timestamps (PostgreSQL's `timestamptz` output ↔ the
normalised ISO string `IsoDateTime` requires). See the mapping notes in
[../../DATABASE.md](../../DATABASE.md).

Nothing here is written yet, and no port has a Supabase implementation.
