-- Stops an account from promoting itself.
--
-- `profiles.role` decides platform administration. Without this, any signed-in user could run
-- `update profiles set role = 'admin' where id = auth.uid()` — a statement the update policy
-- otherwise permits, because that policy's job is to check *which row* is being written, not which
-- columns. PostgreSQL row-level security cannot compare the old and new values of a column, so the
-- rule needs a trigger.
--
-- The test is `auth.uid() is not null`, which is true exactly when the write arrives through the
-- API carrying an end-user's JWT. A privileged path — the SQL editor, a migration, a service-role
-- server process — has no `auth.uid()` and is allowed through, because those are the trusted
-- routes by which an administrator is meant to be appointed.
--
-- SECURITY INVOKER on purpose: the function needs to observe the *caller's* context. Running it
-- with definer rights would hide the very thing it is inspecting.

create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'profiles.role cannot be changed through the API'
      using errcode = '42501',
            hint = 'Account level is granted by a trusted server process, not by the client.';
  end if;
  return new;
end;
$$;

comment on function public.prevent_self_role_change() is
  'Blocks role changes made through the API. Privileged paths (no auth.uid()) are permitted.';

create trigger profiles_prevent_self_role_change
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();
