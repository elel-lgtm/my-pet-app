# Working in MY PET APP

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.
Expo's API surface moves fast and search results routinely describe older SDKs. Verify against the
v54 docs rather than recalling how an earlier version worked.

## Before you finish

Run `npm run verify` (typecheck, lint, test). CI runs the same checks plus a formatting check, so a
green `verify` plus `npm run format` is what a passing pull request looks like.

## Conventions

Full rationale lives in [ARCHITECTURE.md](ARCHITECTURE.md). The short version:

- **Import through the `@/` alias.** ESLint rejects relative imports that climb out of a directory.
- **Layering is one-directional:** `app/` → `features/` → `components/`, `hooks/` → `lib/`,
  `constants/`. Never import upward, and never import one feature from another.
- **Import a feature only through its entry point** — `@/features/pets`, never
  `@/features/pets/components/...`.
- **Routes in `app/` stay thin.** They read params and render a feature's screen; logic lives in
  `features/`.
- **No raw `process.env`.** Configuration goes through `@/lib/env`, which is the only module
  allowed to read it. Metro inlines `EXPO_PUBLIC_*` only on static dot access, so bracket access
  and destructuring silently break in release builds.
- **No `console.log`.** Use `@/lib/logger`, scoped with `logger.child('<area>')`.
- **No raw hex colours or magic pixel numbers.** Use the tokens in `@/constants/theme`
  (`Colors`, `Spacing`, `Radius`, `Typography`, `Duration`, `Elevation`).
- **Build screens from `@/components/ui`.** `Screen` is the outermost element of every screen;
  `Text` is the only text primitive. Read colours via `useTheme()`, never by branching on the
  colour scheme yourself.
- **Register icons before using them** in `components/ui/icon-names.ts`, with both an SF Symbol
  and a Material icon. Both platform implementations share that registry.
- **Navigation is grouped by role.** Owner routes live in `app/(owner)/`; other roles get sibling
  groups, never extra tabs in the owner's tab bar. See [app/README.md](app/README.md).
- **Throw for bugs, return a `Result` for expected failures** (`@/lib/result`). Errors crossing a
  module boundary are `AppError`s with a `code`.

## Testing

- Tests live in `__tests__/` beside the code they cover, named `*.test.ts(x)`.
- Assert on what a user perceives — visible text, accessibility labels — not internal state.
- **React Native Testing Library v14's `render` and `fireEvent` are async.** Always `await` them; a
  missing `await` yields the confusing "render function has not been called" error instead of a
  clean failure.
- Keep `jest.setup.ts` lean. Mocks specific to one area belong in that area's test file.

## Adding an environment variable

Three edits, in this order: `.env.example` (documented default), the `RAW` object in `lib/env.ts`
(static dot access), and `parseEnv` (validation and default). Never put a secret in an
`EXPO_PUBLIC_` variable — it ships inside the bundle.

## Node

Expo SDK 54 requires Node 20.19.4+. This machine runs Node 25, well ahead of what SDK 54 was tested
against; if Metro or a native build misbehaves, try Node 20 LTS before debugging further.
