# Routes

Every file in this directory is a URL. Routes stay thin: they read params, set navigation options,
and render a screen. Logic belongs in `features/` — see [features/README.md](../features/README.md).

## Role-scoped route groups

```
app/
  _layout.tsx           Root: providers, theme, splash, error boundary
  +not-found.tsx        Fallback for unmatched URLs
  (owner)/              The pet owner's app
    _layout.tsx         Stack — detail and modal routes push above the tabs
    (tabs)/
      _layout.tsx       Home · Pets · Map · Alerts · Settings
      index.tsx         Home
      pets.tsx
      map.tsx
      alerts.tsx
      settings.tsx
```

A directory in parentheses is a **route group**: it organises files without contributing a URL
segment. `app/(owner)/(tabs)/index.tsx` serves `/`, not `/owner/tabs`.

`(owner)` exists so that the caregiver and administration areas can be added as **sibling groups**
rather than as extra tabs:

```
app/
  (owner)/(tabs)/...      5 tabs — pets you own
  (caregiver)/(tabs)/...  a different tab set — pets shared with you
  (admin)/...             platform administration; probably not tabs at all
```

Each area gets its own navigator, tab set, and chrome. The alternative — one tab bar with tabs
conditionally hidden — leaks the existence of every area into every session and gets harder to
reason about with each one added.

Two of these three are **not** role-gated, and the distinction matters:

- `(owner)` and `(caregiver)` are two views the _same account_ moves between. Owner and caregiver
  are relationships to individual pets, not account roles — one person routinely is both. Which
  area to open is a question of what the user is doing, not who they are.
- `(admin)` is the only genuinely gated area. It is reached only by an account whose `AccountRole`
  is `admin`, and it contains **platform administration only** — accounts, support, configuration,
  system health. It is not a route to other people's pets or locations; administrators have no
  automatic access to those. See [ARCHITECTURE.md](../ARCHITECTURE.md).

**No authentication exists yet.** `(owner)` is simply the anchor route, set via `unstable_settings`
in the root layout. When authentication arrives the root layout chooses the entry area; nothing
about the routes below has to change.

Reaching a route is not permission to see its data. A gated group keeps a screen out of the way; it
is the server that refuses the query behind it.

## Adding a screen

1. Create the file in the right group. The filename is the URL.
2. Render a `<Screen>` from `@/components/ui` as the outermost element — it supplies the
   background, safe-area insets, and page padding.
3. Give the route a `title` in its layout's `Tabs.Screen` / `Stack.Screen` options. That title is
   the header and the tab label.

The navigator already handles top and bottom safe-area insets, so `Screen` insets only the
horizontal edges by default. A screen with `headerShown: false` should pass `edges={['top', ...]}`
itself.
