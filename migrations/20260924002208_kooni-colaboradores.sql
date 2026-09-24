-- Equipo de agencia: colaboradores que entran al hub del cliente con SU correo y
-- operan los bots del dueño (máx 3, sin acceso a facturación ni a este equipo).
create table if not exists public.colaboradores_cuenta (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  nombre text,
  puede_editar boolean not null default true,
  estado text not null default 'invitado' check (estado in ('invitado', 'activo', 'revocado')),
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists colaboradores_owner_email on public.colaboradores_cuenta (owner_id, lower(email));
create index if not exists colaboradores_user_id_idx on public.colaboradores_cuenta (user_id);
create index if not exists colaboradores_token_idx on public.colaboradores_cuenta (token);

-- ── helpers ─────────────────────────────────────────────────────────────────
-- Email del usuario actual (para que el invitado vea/acepte SU invitación).
create or replace function public.mi_email()
returns text
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select u.email::text from auth.users u where u.id = (select auth.uid());
$$;

-- Dueño de la cuenta a la que pertenece el usuario actual (colaborador activo).
create or replace function public.mi_dueno()
returns uuid
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select c.owner_id from public.colaboradores_cuenta c
  where c.user_id = (select auth.uid()) and c.estado = 'activo'
  limit 1;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.colaboradores_cuenta enable row level security;

create policy colab_select on public.colaboradores_cuenta
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or lower(email) = lower(public.mi_email())
    or public.is_admin()
  );

create policy colab_insert on public.colaboradores_cuenta
  for insert to authenticated
  with check (owner_id = (select auth.uid()) or public.is_admin());

create policy colab_update on public.colaboradores_cuenta
  for update to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin())
  with check (owner_id = (select auth.uid()) or public.is_admin());

create policy colab_delete on public.colaboradores_cuenta
  for delete to authenticated
  using (owner_id = (select auth.uid()) or public.is_admin());

revoke all on public.colaboradores_cuenta from anon, authenticated;
grant select, insert, update, delete on public.colaboradores_cuenta to authenticated;
grant execute on function public.mi_email() to authenticated;
grant execute on function public.mi_dueno() to authenticated;

-- ── el colaborador ve los datos del dueño (lectura) ─────────────────────────
drop policy if exists instalaciones_select on public.instalaciones;
create policy instalaciones_select on public.instalaciones
  for select to authenticated
  using (user_id = (select auth.uid()) or user_id = public.mi_dueno() or public.is_admin());

drop policy if exists licencias_select on public.licencias;
create policy licencias_select on public.licencias
  for select to authenticated
  using (user_id = (select auth.uid()) or user_id = public.mi_dueno() or public.is_admin());

drop policy if exists uso_select on public.uso_instalaciones;
create policy uso_select on public.uso_instalaciones
  for select to authenticated
  using (user_id = (select auth.uid()) or user_id = public.mi_dueno() or public.is_admin());
