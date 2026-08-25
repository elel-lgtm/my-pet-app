# Architecture

How MY PET APP is put together, and why. The foundation, design system, application shell, and
domain model are in place. No product feature is implemented and no backend is connected.

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
  domain/       The domain model — entities, validation, access rules. Pure TypeScript.
  data/         The data-access boundary — port interfaces plus an in-memory adapter.
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
Home, Pets, Map, Alerts, Settings - and the caregiver and administration areas will be added as sibling groups
with their own navigators, rather than as tabs conditionally hidden from the owner's tab bar. No
authentication exists yet; `(owner)` is simply the anchor route. See
[app/README.md](app/README.md).

The root layout supplies what every screen depends on: `SafeAreaProvider`, the navigation theme,
the status bar style, splash-screen dismissal, and the root error boundary.

`useNavigationTheme` projects the design tokens onto React Navigation's theme. Headers, tab bars,
and transition backgrounds are painted by React Navigation rather than by our components, so
without it the chrome would keep its own palette and drift from everything inside a `Screen`.

## Domain model

The vocabulary the product is written in, in `lib/domain/`. Pure TypeScript: no React, no
navigation, no database client, so it can be imported by any layer and tested without a harness.

### Confirmed entities

Seven, each traceable to something the product actually requires:

| Entity        | Why it exists                                                       |
| ------------- | ------------------------------------------------------------------- |
| `Profile`     | Someone using the app. Mirrors one `auth.users` row.                |
| `Pet`         | The entity everything else hangs off.                               |
| `Tracker`     | The GPS device. Separate lifecycle from the pet wearing it.         |
| `PetLocation` | One position fix. Append-only; the highest-volume table by far.     |
| `SafeZone`    | A circular geofence around a place a pet may be.                    |
| `Alert`       | Something that happened and needs attention. Drives the Alerts tab. |
| `PetShare`    | An explicit grant of access from an owner to one caregiver.         |

**`Notification` was evaluated and rejected for now.** An alert is a domain event; a notification is
a _delivery_ of one, and delivery cannot be modelled honestly without knowing the push provider,
the channels, and how a device registers — none of which is decided. Adding a table now would
mean inventing a schema for a transport nobody has chosen. `Alert` already carries the event and
its lifecycle, and delivery records attach to it later without changing it.

**A `LostPetReport` entity was also rejected.** "Lost" is a `Pet.status` plus a `pet_marked_lost`
alert. A separate entity would duplicate the state the map, the alert rules, and the pet list all
branch on, and invite the two copies to disagree. If public lost-pet listings with rewards and
contact details ever become a requirement, that is a genuinely different entity and can be added
then.

### Relationships

```
Profile 1—n Pet            (pets.owner_id)
Profile 1—n Tracker        (trackers.owner_id)
Pet     1—n SafeZone       (safe_zones.pet_id)
Pet     1—n PetLocation    (pet_locations.pet_id)
Pet     1—n Alert          (alerts.pet_id)
Pet     0..1 Tracker        (trackers.pet_id — nullable, a device may be unassigned)
Pet     n—m Profile        THROUGH PetShare, and only through PetShare
```

### Modelling decisions worth knowing

**"Owner" and "caregiver" are not roles.** `AccountRole` is `member` or `admin` only. Owner and
caregiver describe a relationship to a _particular pet_ — the same account owns its own pets and
is a caregiver for someone else's at the same time. Storing them as a global role would force one
of those two truths to be wrong. Per-pet relationships are computed in `lib/domain/access.ts`.

**Identifiers are branded.** `PetId` and `TrackerId` are distinct types, not `string`, so passing
one where the other belongs is a compile error rather than a query that quietly returns nothing.
The brand exists only in the type system; at runtime they are ordinary strings that cross a JSON
boundary unchanged.

**Timestamps are normalised ISO strings, not `Date`.** Domain values stay JSON-shaped end to end,
which is what keeps the adapter translation a rename rather than a serialisation layer.

**Safe zones are circles.** Every consumer tracker expresses geofences that way, containment is one
distance comparison needing no geometry library, and a circle is far easier to drag on a map.

**A location's `recordedAt` is distinct from its `createdAt`.** A tracker that loses connectivity
buffers fixes and uploads them later; ordering history by arrival time would scramble the route.

## Ownership and access

The intended security model, stated as invariants:

1. **An owner reaches only pets they own.**
2. **A caregiver reaches only pets explicitly shared with them**, through an accepted, unexpired
   `PetShare`. There is no household, no team, no implicit path.
3. **An administrator has no automatic access to pets or locations at all.** Administration is
   platform-level and separately enumerated; there is no implicit superuser route to private data.

> ### These invariants are enforced by PostgreSQL row-level security, and nowhere else.
>
> `lib/domain/access.ts` computes the same relationships on device, and it is **not a security
> boundary**. A modified client returns whatever it likes from it. Its only legitimate use is
> presentational: whether to render an edit button, which empty state to show.
>
> Concretely: never use it to decide whether to _fetch_ something. Ask the server and let it refuse.
> A screen that hides a control but still issues the query protects nothing. Hidden UI, navigation
> guards, and local state are not security.

Every rule above has a corresponding RLS policy sketch in [DATABASE.md](DATABASE.md). If the two
ever disagree, the database is right and the client is a bug.

### Account level and pet access are independent axes

Account level says what someone may do to the **platform**. Relationship to a pet says what they
may do with **that pet**. Being an administrator grants nothing on the second axis.

```
MEMBER
  ├── owns → Pet
  └── accepted PetShare → caregiver access

ADMIN
  └── platform administration, according to explicit permissions
```

A member may own pets, be a caregiver for someone else's pet, or both at once. `AccountRole` is
`member` or `admin`; "owner" and "caregiver" are never stored on an account.

**An administrator does not automatically receive access to private pet data or live GPS
locations.** `relationshipToPet` has no `admin` result: an administrator who neither owns a pet nor
holds an accepted share for it has _no relationship to that pet_, and is classified `none` exactly
like any other stranger. An administrator who does own a pet is its owner, and one holding a share
is a caregiver — by the same rules as everyone else.

By default an administrator may manage platform users, view account status, suspend and reactivate
accounts, review abuse and fraud reports, manage platform configuration, view system health, review
audit logs, and manage support cases. These are enumerated as `ADMIN_PERMISSIONS` in
`lib/domain/profile.ts`, and a test asserts that list exactly — so a permission reaching pet or
location data cannot be added incidentally.

By default an administrator may **not** browse any user's live location or location history, modify
pet ownership, read private user data without a legitimate administrative need, or silently
impersonate a user.

The two permission vocabularies share no values, deliberately, so a platform capability cannot be
mistaken for a pet capability at a call site.

### Exceptional administrative access

There will be legitimate cases — an abuse investigation, a lost-pet support escalation — where an
administrator needs data this policy withholds. That is a separate mechanism, **not yet
implemented**, and when built it must require:

- an explicit stated reason;
- a specific target user or pet, never a blanket grant;
- least-privilege scope;
- a time limit where appropriate;
- an audit log entry that the subject's data was accessed, by whom, and why.

It will be represented as an explicit, audited **record** against a named pet — not by widening
`PetRelationship` or adding a permission that a role check can satisfy. A role that silently opens
private data is the thing this policy exists to prevent.

## Data access

`lib/data/ports.ts` defines the only contract between feature logic and stored data:

```
UI (app/, components/)
  ↓ renders
feature logic (features/*)
  ↓ calls ports
data access (lib/data/ports.ts)
  ↓ implemented by
an adapter — Supabase in production, in-memory in tests
```

No screen ever holds a database client. Standing a feature up before the backend exists, or
replacing Supabase later, becomes a matter of supplying a different object that satisfies these
types rather than finding every query scattered through the UI.

Conventions: every method is async and returns a `Result`, never throwing for an expected failure;
a missing row comes back as `null`, because "not there" is usually not a fault; methods take and
return domain types, leaving row shapes and joins inside adapters.

`lib/data/in-memory-data-source.ts` implements every port over `Map`s. It exists to prove the ports
are implementable and to let features be built and tested before the backend does. It enforces the
same constraints the database will — unique tracker serials, the safe-zone cap, one live share per
pet and email — so code written against it meets the rules it will meet in production. It is
development and test only, applies no authorization, and is imported by no UI code.

## Supabase

### What is and is not true today

The Supabase project exists, the schema is applied, and the app can construct a typed client.

> **AUTHENTICATION IS NOT IMPLEMENTED.**
> **NO RLS POLICY EXISTS — every table denies all access.**
> **GPS TRACKING IS NOT IMPLEMENTED.**
> **There is no data in the database.**

The seven tables from the approved domain model are created, constrained, indexed, and have
row-level security enabled. What they do _not_ have is a single policy, which in PostgreSQL means
no row is readable or writable through the API by anyone. That is the correct resting state: a
policy written before `auth.uid()` means anything would have to be either wrong or dangerously
permissive.

So the database is currently secure in the way an empty locked room is secure. Nothing below should
be read as evidence that user data is protected once people and their pets are actually in it —
the policies that will do that are specified in [DATABASE.md](DATABASE.md) and not yet written.

### Schema

Seven tables, ten forward-only migrations, all applied: `profiles`, `pets`, `trackers`,
`pet_locations`, `safe_zones`, `alerts`, `pet_shares`. Ownership is `pets.owner_id`; caregiver
access exists only as a `pet_shares` row. `profiles.id` **is** `auth.users.id`, which makes "one
account, one profile" a primary-key constraint rather than a convention.

Column definitions, constraints, indexes, cascade behaviour, and the policies required in the
authentication phase are in [DATABASE.md](DATABASE.md).

### Client architecture

`lib/supabase/client.ts` holds one lazily-created client, reused for the life of the process.
Several `createClient` calls would mean several connections, several realtime sockets, and several
places to change when configuration moves.

```
feature logic (features/*)
  ↓  calls
ports (lib/data/ports.ts)
  ↓  implemented by
a Supabase adapter (lib/data/supabase/ — not written yet)
  ↓  uses
the client (lib/supabase/client.ts)
  ↓
PostgreSQL
```

**The UI cannot reach the client, and this is enforced rather than requested.** ESLint blocks
`app/**` and `components/**` from importing `@/lib/supabase` or `@supabase/*` outright. A query
issued from a render function is both a layering violation and the usual route by which credentials
and refetch loops end up in a component tree.

The client is parameterised by the generated `Database` type, so every query is checked against
real columns and enum values at compile time. That type describes _rows_, not the domain: ESLint
blocks `app/`, `components/`, and `features/` from importing it, because translating between rows
and domain types is the adapter's job and nobody else's.

Session persistence, token refresh, and URL session detection are all switched **off**. There is no
session to persist yet, and enabling persistence without supplying a storage adapter makes
supabase-js reach for `localStorage`, which React Native does not have. When authentication lands,
these flip on alongside an `expo-secure-store`-backed adapter so tokens sit in the platform
keystore rather than in plain AsyncStorage.

### Public versus privileged credentials

|                                    | Where it lives                           | Ships in the bundle? |
| ---------------------------------- | ---------------------------------------- | -------------------- |
| Project URL                        | `EXPO_PUBLIC_SUPABASE_URL`               | Yes — public         |
| Publishable key (formerly `anon`)  | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`   | Yes — public         |
| `service_role` / `sb_secret_…` key | **Nowhere in this repository**           | **Never**            |
| Database password                  | The owner's machine, via `supabase link` | **Never**            |
| JWT secret / signing keys          | Supabase dashboard only                  | **Never**            |

The publishable key **is not a secret**. It identifies the project and grants nothing on its own;
every permission comes from row-level security evaluated against the caller's session. Treating it
as a secret leads to the far worse habit of treating a privileged key as merely sensitive.

The privileged keys are a different category entirely. A `service_role` key **bypasses row-level
security completely**. Shipping one inside a mobile bundle would hand every installed copy of the
app unrestricted read and write access to every user's data, and a mobile bundle is trivially
inspected. It cannot be rotated quietly afterwards, because it is already on every device.

`parseEnv` therefore refuses to start if the publishable variable contains something that decodes
to a `service_role` JWT or begins with `sb_secret_`, and the rejection message deliberately does
**not** echo the offending value — printing it would move a privileged key straight into terminal
scrollback and CI logs. This is a backstop, not the control: the control is not pasting it.

### Security rules

1. The frontend publishable key is not a secret and is expected to ship in the bundle.
2. The `service_role` key is privileged and must never enter the mobile application, `.env`,
   `.env.example`, CI, or a commit.
3. Database authorization is enforced by PostgreSQL row-level security. Not by navigation, not by
   hidden UI, not by an adapter that filters results.
4. `lib/domain/access.ts` computes relationships for **presentation only**. It is not a security
   boundary; see [Ownership and access](#ownership-and-access).
5. Credentials are never committed. `.env` and `.env.*` are ignored everywhere; `.env.example`
   carries names and comments with empty values.
6. The logger redacts credentials and authentication material — passwords, tokens, JWTs, cookies,
   API keys, and both Supabase key formats — before a record leaves the process.

### Local development

```bash
cp .env.example .env.local
```

Fill in the two Supabase values from **Project Settings → API** in the dashboard. Both are optional
in development, so the app still runs without them; they are mandatory in staging and production,
where `parseEnv` refuses to build an `Env` without them.

Migrations, CLI setup, and the intended migration order are in
[supabase/README.md](supabase/README.md). Nothing has been applied to any database yet.

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

- **Notification delivery** — push provider, channels, device registration, and the delivery
  records that would attach to an `Alert`.
- **Authentication** — sign-in, session storage in `expo-secure-store`, and turning the client's
  `persistSession` / `autoRefreshToken` back on.
- **Row-level security policies and the `can_read_pet()` access helper** — fully specified in
  DATABASE.md, deliberately unwritten until `auth.uid()` means something.
- **The Supabase adapter** for the data ports, and the generated `Database` type that makes its
  queries column-checked.
- **The exceptional administrative access mechanism** — the policy for it is settled (see
  [Ownership and access](#ownership-and-access)); the reason-capture, scoping, expiry, and audit
  record are not built.
- **Per-administrator permission scoping** — every administrator currently holds the same baseline
  set. Narrowing it needs an admin surface to manage it from.
- **Location retention and partitioning** — how long raw fixes are kept, and when
  `pet_locations` needs range partitioning. See [DATABASE.md](DATABASE.md).
- **PostGIS** — not needed for storing points or for radius checks. The trigger for adopting it
  would be cross-account proximity search.
- **Polygon safe zones** — circles cover the confirmed requirement.
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
