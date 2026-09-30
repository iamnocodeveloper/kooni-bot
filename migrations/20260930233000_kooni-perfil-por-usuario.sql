-- Integridad de registros: todo usuario de `auth.users` debe tener su fila en
-- `public.profiles` (el espejo donde vive el rol: cliente | revendedor | admin).
--
-- Sin esto, un usuario nuevo del hub queda SIN perfil: `public.is_admin()` nunca
-- puede dar true para él y el panel no le muestra nada — hay que insertarlo a
-- mano (justo lo que hubo que hacer con el super admin).
--
-- Es el patrón que documenta InsForge (references/auth.md): crear la función en
-- `public` y colgar el trigger de `auth.users`. No se agregan columnas al schema
-- `auth` (gestionado): solo se referencia.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(coalesce(new.profile->>'name', new.profile->>'full_name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill: usuarios que ya existían sin perfil (p. ej. el super admin creado a
-- mano). No toca a quien ya tiene fila (así no pisa un rol existente).
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
