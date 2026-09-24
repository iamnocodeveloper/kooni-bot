-- Novedades (changelog in-app): lo que el super admin publica y los clientes ven
-- en su hub. Cada item: fecha, origen (kooni/kooni+), tipo (nuevo/mejora/arreglo),
-- versión, título, cuerpo, CTA e instrucción de update.
create table if not exists public.novedades (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  origen text not null default 'kooni' check (origen in ('kooni', 'kooni+')),
  tipo text not null default 'nuevo' check (tipo in ('nuevo', 'mejora', 'arreglo')),
  version text,
  titulo text not null,
  cuerpo text,
  cta_label text,
  cta_url text,
  update_hint text,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists novedades_fecha_idx on public.novedades (fecha desc, created_at desc);

create trigger novedades_updated_at before update on public.novedades
  for each row execute function system.update_updated_at();

alter table public.novedades enable row level security;

-- Cualquier autenticado ve las publicadas; el admin ve todas (incl. borrador).
create policy novedades_select on public.novedades
  for select to authenticated
  using (visible or public.is_admin());

-- Solo el admin escribe.
create policy novedades_admin_write on public.novedades
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.novedades from anon, authenticated;
grant select, insert, update, delete on public.novedades to authenticated;
