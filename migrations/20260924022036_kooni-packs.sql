-- Packs por giro: el contenido editable/versionable que se distribuye a los bots
-- (nombre, descripción y playbook del giro). Espeja src/niches/ para el panel.
create table if not exists public.packs (
  id text primary key,
  nombre text not null,
  emoji text,
  descripcion text,
  playbook text,
  version text,
  activo boolean not null default true,
  orden int not null default 100
);

alter table public.packs enable row level security;

create policy packs_select on public.packs
  for select to authenticated
  using (activo or public.is_admin());

create policy packs_admin_write on public.packs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.packs from anon, authenticated;
grant select, insert, update, delete on public.packs to authenticated;

insert into public.packs (id, nombre, emoji, descripcion, version, orden) values
  ('generico',    'Genérico / otro',            '🤖', 'Cualquier negocio: atiende, capta leads y escala cuando importa.', '1.0', 10),
  ('agencia-ia',  'Agencia de IA / servicios',  '🚀', 'Venta conversacional de servicios, con pipeline y propuestas.', '1.0', 20),
  ('restaurante', 'Restaurante / comida',       '🍽️', 'Menú, pedidos y reservas sin saturar el teléfono.', '1.0', 30),
  ('inmobiliaria','Inmobiliaria',               '🏠', 'Filtra prospectos y agenda visitas.', '1.0', 40),
  ('clinica',     'Clínica / consultorio',      '🩺', 'Citas y seguimiento (sin diagnosticar).', '1.0', 50),
  ('barberia',    'Barbería / estética',        '💈', 'Llena la silla y baja los no-shows.', '1.0', 60),
  ('cartera',     'Cartera de cobros',          '💰', 'Recordatorios por mora y promesas de pago.', '1.0', 70),
  ('taxis',       'Taxis / central de despacho','🚕', 'Pide la ubicación y despacha al conductor.', '1.0', 80)
on conflict (id) do nothing;
