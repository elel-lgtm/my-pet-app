# Architecture

How MY PET APP is put together, and why. The foundation, design system, and application shell
are in place; no product features exist yet.

## Stack

| Concern    | Choice                                                     |
| ---------- | ---------------------------------------------------------- |
| Runtime    | Expo SDK 54 · React Native 0.81 · React 19.1               |
| Language   | TypeScript 5.9, `strict` plus the checks listed below      |
| Navigation | Expo Router 6 (file-based, typed routes)                   |
| Testing    | Jest 29 with `jest-expo` · React Native Testing Library 14 |
| Quality    | ESLint 9 (flat config) · Prettier 3                        |
| CI         | GitHub Actions                                             |

New Architecture and the React Compiler are both enabled in `app.json`. Node 20.19.4 or newer is
required — see [Node version](#node-version).

## Directory map

```
app/            Routes only. File-based; every file here is a URL. See app/README.md.
  (owner)/      The pet owner's area — a Stack wrapping five tabs.
features/       Business logic, one directory per feature. Empty by design — see features/README.md.
components/
  ui/           The design system. Imported as a whole from `@/components/ui`.
hooks/          Shared React hooks, including theme resolution.
lib/            Framework-agnostic infrastructure: config, errors, logging, results.
constants/      Design tokens.
assets/         Images and fonts.
```

Import everything through the `@/` alias (`@/lib/logger`, `@/components/themed-text`). Relative
imports that climb out of a directory (`../../lib/logger`) are rejected by ESLint, because the
alias makes a module's layer readable at the import site.

## Layering

Dependencies point in one direction only:

```
app/  →  features/  →  components/ui/ · hooks/  →  lib/ · constants/
```

- **`lib/` depends on nothing above it.** It is plain TypeScript with no React and no navigation,
  which is what makes it trivially testable and portable.
- **`features/` never imports another feature.** Shared code moves down a layer instead.
- **`app/` stays thin.** A route reads params and renders a feature's screen. Logic that would
  outlive a change of navigation library does not belong in `app/`.

ESLint enforces the parts of this that can be enforced mechanically: deep imports into a feature's
internals fail the build, as does reading `process.env` outside `lib/env.ts` or calling
`console.log` outside `lib/logger.ts`.

## Configuration and environments

Three environments — `development`, `staging`, `production` — selected by `EXPO_PUBLIC_APP_ENV`.

**Build-time config** flows through `app.config.ts`, which layers environment-dependent values
over the static `app.json`. Each environment gets its own app name, URL scheme, and native
identifier (`com.mypetapp.dev`, `com.mypetapp.staging`, `com.mypetapp`), so all three can be
installed side by side on one device.

> Change `BASE_IDENTIFIER` in `app.config.ts` to your own reverse-DNS identifier before the first
> store submission.

**Runtime config** flows through [`lib/env.ts`](lib/env.ts), the only module allowed to read
`process.env`. It exists because Expo's inlining has a sharp edge: Metro substitutes
`EXPO_PUBLIC_*` variables only on static dot access, so `process.env['EXPO_PUBLIC_API_URL']` and
destructuring silently yield `undefined` in a release bundle. Concentrating access in one file
makes that pattern reviewable, and validating there turns a misconfigured build into an immediate,
legible crash instead of an `undefined` surfacing three screens later.

Everything in an `EXPO_PUBLIC_` variable ships inside the JavaScript bundle and is readable by
anyone who installs the app. **No secrets.** Server-side credentials belong on a server; values
that must stay on the device belong in `expo-secure-store`.

Adding a variable means three edits: `.env.example`, the `RAW` object in `lib/env.ts`, and the
parsing in `parseEnv`.

## Design system

Every visual primitive lives in `components/ui/` and is imported from the barrel:

```tsx
import { Button, EmptyState, Screen, Text } from '@/components/ui';
```

| Primitive                  | Purpose                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `Screen`                   | Outermost element of every screen: background, safe area, page padding, optional scroll |
| `Text`                     | The only text primitive. Size and line height always travel together                    |
| `Surface`                  | A raised container - cards, grouped rows                                                |
| `Section`                  | A titled group, with a heading role for screen-reader navigation                        |
| `Button`, `IconButton`     | Controls, with press, disabled, and loading states                                      |
| `ListItem`, `Divider`      | Rows in a grouped list                                                                  |
| `EmptyState`               | The "nothing here yet" state, which is what most users see first                        |
| `TextField`                | Text input with label, helper text, and error                                           |
| `Badge`, `Spinner`, `Icon` | Status, progress, iconography                                                           |

Three rules hold the system together:

- **No raw values.** Colour, spacing, radius, type, motion, and shadow all come from
  `@/constants/theme`. A component never contains a hex code or a magic pixel number.
- **Colour is resolved once.** `useTheme()` returns the palette for the active scheme, so no
  component branches on light versus dark. Adding a colour means adding it to _both_ schemes.
- **Accessibility is built in, not bolted on.** Controls carry a role and a label, tappable areas
  meet the 44pt minimum, `IconButton` _requires_ a label, and `Button` reports `busy` while
  loading. Tests assert on what a screen reader would announce.

Icons are registered once in `components/ui/icon-names.ts`, keyed by intent (`pets`, `alerts`)
rather than by either platform's naming, with an SF Symbol for iOS and a Material icon for Android
and web. `icon.tsx` and `icon.ios.tsx` are two implementations of one module and share that
registry - the template's original arrangement let a name typecheck on iOS and render nothing
everywhere else.

## Application shell

Navigation is organised by **role**, not by screen. `app/(owner)/` holds the owner's five tabs -
Home, Pets, Map, Alerts, Settings - and caregiver and admin areas will be added as sibling groups
with their own navigators, rather than as tabs conditionally hidden from the owner's tab bar. No
authentication exists yet; `(owner)` is simply the anchor route. See
[app/README.md](app/README.md).

The root layout supplies what every screen depends on: `SafeAreaProvider`, the navigation theme,
the status bar style, splash-screen dismissal, and the root error boundary.

`useNavigationTheme` projects the design tokens onto React Navigation's theme. Headers, tab bars,
and transition backgrounds are painted by React Navigation rather than by our components, so
without it the chrome would keep its own palette and drift from everything inside a `Screen`.

## Errors

Every error crossing a module boundary is an `AppError` carrying a `code` from a small, closed set
(`network`, `server`, `validation`, `not_found`, `unauthorized`, `configuration`, `storage`,
`unexpected`). Callers branch on the code rather than matching on message strings, and
`userMessageFor` maps a code to user-facing copy in one place — so internal detail like a hostname
or a stack frame never reaches the screen.

The convention for how a failure travels:

- **Throw** for programmer errors and unrecoverable states.
- **Return a `Result`** ([`lib/result.ts`](lib/result.ts)) for failures the caller is expected to
  handle — a network call, a parse, a database read. This keeps expected failure paths visible in
  the type signature instead of hidden behind a `try`/`catch` a caller may forget to write.
  `attempt()` is the seam where exception-throwing libraries enter that world.
- **Render `ErrorBoundaryView`** when a component tree fails. It is exported as `ErrorBoundary`
  from the root layout, so it catches anything no closer boundary handles.

## Logging

`lib/logger.ts` replaces `console`. Records are level-filtered (`EXPO_PUBLIC_LOG_LEVEL`), scoped
(`logger.child('api')` produces the scope `app:api`), and passed through a redactor that masks any
key matching password, token, secret, authorization, api key, or cookie — including nested ones.

`setLogSink` is the single seam for attaching a crash reporter. None is wired up yet; that choice
is deferred until there is a product worth reporting on.

## Testing

Tests live in `__tests__/` beside the code they cover.

- **`lib/`** is pure TypeScript and is tested directly and thoroughly — it is the cheapest place in
  the codebase to be rigorous.
- **Components** are tested through React Native Testing Library, asserting on what a user
  perceives: visible text and accessibility labels, not internal state or prop plumbing.
- **`jest.setup.ts` stays lean.** Global mocks make tests pass for reasons the test file does not
  state. Anything specific to one area belongs in that area's test file.

One sharp edge worth knowing: in React Native Testing Library v14, `render` and `fireEvent` are
**async**, because React 19's `act` is. A missing `await` produces an empty `screen` and a
confusing "render function has not been called" error rather than a clean failure.

## Quality gates

`npm run verify` runs typecheck, lint, and tests — the same checks CI runs on every push and pull
request, plus a formatting check and `expo-doctor`.

Beyond `strict`, TypeScript runs with `noUncheckedIndexedAccess` (array and record access is typed
as possibly `undefined`, because it is), `exactOptionalPropertyTypes` (absent and
explicitly-`undefined` stay distinguishable), `verbatimModuleSyntax` (type-only imports are written
as such, so they leave no runtime trace), plus `noUnusedLocals`, `noUnusedParameters`,
`noImplicitOverride`, and `noFallthroughCasesInSwitch`.

These were switched on before there was much code, which is the only comfortable time to do it.

## Node version

`package.json` declares `engines.node >= 20.19.4`, the floor for Expo SDK 54, and CI pins 20.19.4.
This machine currently runs **Node 25**, which is far ahead of what SDK 54 was tested against; if
Metro or a native build misbehaves, installing Node 20 LTS is the first thing to try.

## Decisions deliberately deferred

Left open on purpose, to be settled by the first feature that actually needs them rather than
guessed at now:

- **Persistence** — `expo-sqlite` for relational local data, or
  `@react-native-async-storage/async-storage` for simple key-value. Sensitive values go in
  `expo-secure-store` either way. The Settings screen's theme row waits on this.
- **Mapping provider** — the Map tab is a placeholder until one is chosen.
- **Roles and authentication** — the route groups are shaped for it; none of it is implemented.
- **Server state** — whether a data-fetching library (TanStack Query and similar) earns its weight,
  or hooks over `fetch` suffice.
- **Client state** — React context until something demonstrably outgrows it.
- **Crash reporting** — attach via `setLogSink` when chosen.
- **Authentication** — no user model exists yet.

Adding an abstraction before there is a second caller usually produces the wrong abstraction.
