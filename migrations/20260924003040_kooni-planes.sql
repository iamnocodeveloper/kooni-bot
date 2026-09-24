-- Planes de la plataforma (lo que se muestra en la página de upgrade y lo que
-- define qué módulos incluye cada tier). Editable desde el super admin.
create table if not exists public.planes (
  id text primary key,
  nombre text not null,
  precio numeric(10, 2),
  moneda text not null default 'usd',
  precio_nota text,
  etapa text,
  badge text,
  descripcion text,
  incluye jsonb not null default '[]'::jsonb,
  modulos jsonb not null default '[]'::jsonb,
  orden int not null default 100,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger planes_updated_at before update on public.planes
  for each row execute function system.update_updated_at();

alter table public.planes enable row level security;

create policy planes_select on public.planes
  for select to authenticated
  using (activo or public.is_admin());

create policy planes_admin_write on public.planes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.planes from anon, authenticated;
grant select, insert, update, delete on public.planes to authenticated;

-- Semilla
insert into public.planes (id, nombre, precio, moneda, precio_nota, etapa, badge, descripcion, incluye, modulos, orden) values
  ('free', 'Gratis', null, 'usd', null, null, null,
   'Tu bot ya responde. Todas las funciones, con límites de cantidad.',
   '["Atiende 24/7", "Responde con tu información", "Captura leads", "Entiende notas de voz", "Handoff al dueño", "Multicanal", "Reportes y exportación"]'::jsonb,
   '[]'::jsonb, 10),
  ('kooni+', 'Kooni+', 29.00, 'usd', 'precio de lanzamiento', 'early', 'Early',
   'Encendé los 13 superpoderes, desbloqueá las plantillas por giro y administrá varios clientes — en un plan, sin créditos.',
   '["13 superpoderes", "Plantillas por giro", "Modo agencia (multi-cliente)", "Panel por giro con tu color", "Elegí tu IA", "Kit de agencia"]'::jsonb,
   '["blindaje","vigilante","handoff_smart","cazador","oido_vista","voz_marca","nightly_report","multiidioma","encuestas","reenganche","resenas","cobros","galeria"]'::jsonb, 20)
on conflict (id) do nothing;
