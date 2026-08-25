-- Maintains `updated_at` on every mutable table.
--
-- A trigger rather than application code: a timestamp the application forgets to set is worse than
-- no timestamp at all, and every write path - app, adapter, dashboard, future edge function - has
-- to be correct otherwise.
--
-- Not SECURITY DEFINER. It needs no privileges beyond the caller's, and a definer-rights function
-- is a standing risk that has to be justified rather than assumed. `search_path` is pinned to the
-- empty string so the body cannot be captured by a schema earlier on someone else's path; the body
-- references only `new` and `now()`, and `now()` resolves from pg_catalog implicitly.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.touch_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at. Attached to every table carrying that column.';
