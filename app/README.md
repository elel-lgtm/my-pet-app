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

`(owner)` exists so that caregiver and admin areas can be added as **sibling groups** rather than
as extra tabs:

```
app/
  (owner)/(tabs)/...      5 tabs
  (caregiver)/(tabs)/...  a different tab set entirely
  (admin)/...             probably not tabs at all
```

Each role gets its own navigator, its own tab set, and its own chrome. The alternative — one tab
bar with tabs conditionally hidden — leaks the existence of every role into every session and gets
harder to reason about with each role added.

**No role-based authentication exists yet.** `(owner)` is simply the anchor route, set via
`unstable_settings` in the root layout. When authentication arrives, the root layout picks the
group to redirect into based on the signed-in user's role; nothing about the routes below has to
change.

## Adding a screen

1. Create the file in the right group. The filename is the URL.
2. Render a `<Screen>` from `@/components/ui` as the outermost element — it supplies the
   background, safe-area insets, and page padding.
3. Give the route a `title` in its layout's `Tabs.Screen` / `Stack.Screen` options. That title is
   the header and the tab label.

The navigator already handles top and bottom safe-area insets, so `Screen` insets only the
horizontal edges by default. A screen with `headerShown: false` should pass `edges={['top', ...]}`
itself.
