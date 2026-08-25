-- Creates the profile row that mirrors a new auth.users row.
--
-- `profiles.id` is `auth.users.id`, so exactly one profile exists per account by construction. A
-- trigger is the right mechanism rather than a client insert: the client would have to be trusted
-- to supply its own id, and "insert a row whose id you choose" is the shape of an account-takeover
-- bug. Here the id comes from the row the auth system just created and nothing else can influence
-- it.
--
-- ## Why SECURITY DEFINER
--
-- Sign-up runs as `supabase_auth_admin`, which has no privileges on `public.profiles`. Definer
-- rights let the insert proceed as the function owner. `search_path` is pinned to the empty string
-- so every name must be schema-qualified and the body cannot be captured by a schema planted
-- earlier on someone else's path.
--
-- ## The security property that matters
--
-- `role` is the literal `'member'`. It is never read from `raw_user_meta_data`, which is entirely
-- client-controlled: it is whatever the app passed to `signUp({ options: { data } })`, and a
-- modified client can put anything there. Reading a role out of it would let anyone sign up as an
-- administrator. The display name is taken from that metadata because a display name grants
-- nothing, and it is truncated to the column's limit so an oversized value cannot fail the whole
-- sign-up.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Phone-only sign-up would have no email to satisfy the profile's NOT NULL and shape checks.
  -- The app offers email sign-up only; skipping keeps a future change from breaking auth outright.
  if new.email is null then
    return new;
  end if;

  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    lower(new.email),
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        split_part(new.email, '@', 1)
      ),
      80
    ),
    -- Hard-coded. See the note above: never derived from client-supplied metadata.
    'member'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates public.profiles for a new auth.users row. Role is always member; never read from client metadata.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
