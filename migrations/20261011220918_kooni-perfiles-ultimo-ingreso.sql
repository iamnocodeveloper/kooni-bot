-- Kooni — último ingreso al sistema por usuario (panel / hub).
-- Añade profiles.last_login y lo estampa en cada entrada autenticada, dentro de
-- la misma RPC ensure_profile() que el panel ya invoca al cargar la sesión.
-- Solo guardamos un timestamp (sin IP ni geolocalización): es dato operativo,
-- no información sensible.

alter table public.profiles
  add column if not exists last_login timestamptz;

-- Recreamos ensure_profile para que, además de crear/completar el perfil, marque
-- el último ingreso. Conserva la misma firma y el SECURITY DEFINER anterior.
create or replace function public.ensure_profile(p_email text default null, p_name text default null)
returns public.profiles
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  uid uuid := (select auth.uid());
  prof public.profiles;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.profiles (id, email, display_name, last_login)
  values (uid, p_email, p_name, now())
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        last_login = now()
  returning * into prof;
  return prof;
end;
$$;
