# MY PET APP

An [Expo](https://expo.dev) app built with [Expo Router](https://docs.expo.dev/router/introduction/).

The engineering foundation, design system, and application shell are in place — configuration,
error handling, logging, design tokens, UI primitives, and a five-tab owner navigation. No product
features are implemented yet. See [ARCHITECTURE.md](ARCHITECTURE.md) for how it all fits together,
[app/README.md](app/README.md) for the routing conventions, and
[features/README.md](features/README.md) for where the first feature goes.

## Getting started

Requires **Node 20.19.4 or newer** (Expo SDK 54's floor).

```bash
npm install
cp .env.example .env.local   # then edit for your machine
npm start
```

From the Expo CLI you can open the app in a
[development build](https://docs.expo.dev/develop/development-builds/introduction/), an
[Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/), an
[iOS simulator](https://docs.expo.dev/workflow/ios-simulator/), or
[Expo Go](https://expo.dev/go).

## Scripts

| Command                   | What it does                                        |
| ------------------------- | --------------------------------------------------- |
| `npm start`               | Start the Expo dev server                           |
| `npm run android/ios/web` | Start and open on a specific platform               |
| `npm run verify`          | Typecheck, lint, and test — run this before pushing |
| `npm run typecheck`       | TypeScript, no emit                                 |
| `npm run lint`            | ESLint (includes Prettier formatting)               |
| `npm run lint:fix`        | ESLint with autofix                                 |
| `npm run format`          | Rewrite files with Prettier                         |
| `npm test`                | Jest                                                |
| `npm run test:watch`      | Jest in watch mode                                  |
| `npm run test:coverage`   | Jest with a coverage report                         |
| `npm run doctor`          | `expo-doctor` — checks dependencies against the SDK |

## Environment

Configuration comes from `.env.local` (git-ignored) using the variables documented in
[.env.example](.env.example). Every variable is prefixed `EXPO_PUBLIC_`, which means it is inlined
into the JavaScript bundle and readable by anyone who installs the app — **never put a secret in
one**.

Values are read and validated once, at startup, in [lib/env.ts](lib/env.ts). A missing or malformed
value fails loudly there rather than surfacing as an `undefined` somewhere downstream.

### Supabase

The two Supabase variables come from **Project Settings → API** in the dashboard. Both are public
and expected to ship in the bundle; they are optional in development and required in staging and
production.

**Never put the `service_role` key, the database password, or the JWT secret in this project.** The
`service_role` key bypasses row-level security, and a mobile bundle is trivially inspected —
shipping one would give every installed copy of the app unrestricted access to every user's data.
Startup validation rejects one if it is pasted into the publishable variable, but that is a
backstop rather than the control.

Authentication, row-level security, the database schema, and GPS tracking are **not implemented
yet**. See [ARCHITECTURE.md](ARCHITECTURE.md) and [supabase/README.md](supabase/README.md).

## Project layout

```
app/            Routes (file-based); app/(owner)/ holds the owner's five tabs
features/       Business logic, one directory per feature
components/ui/  The design system — import from '@/components/ui'
hooks/          Shared React hooks, including theme resolution
lib/            Config, errors, logging, results
constants/      Design tokens
```

## Working in this repo

Read [AGENTS.md](AGENTS.md) — it holds the conventions that are not obvious from the code, and it
applies to humans and AI agents alike.

Because Expo changes quickly, always check the exact versioned docs for
[SDK 54](https://docs.expo.dev/versions/v54.0.0/) rather than a search result that may describe an
older release.
