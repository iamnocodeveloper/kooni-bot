-- Auditoría del super admin: cada acción sensible queda registrada (quién, qué,
-- cuándo). Solo lectura para el admin.
create table if not exists public.auditoria_admin (
  id uuid primary key default gen_random_uuid(),
  actor text,
  accion text not null,
  detalle text,
  created_at timestamptz not null default now()
);

create index if not exists auditoria_admin_created_idx on public.auditoria_admin (created_at desc);

alter table public.auditoria_admin enable row level security;

create policy auditoria_admin_rw on public.auditoria_admin
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.auditoria_admin from anon, authenticated;
grant select, insert, update, delete on public.auditoria_admin to authenticated;
