-- Configuración de plataforma (clave → valor), editable desde el super admin.
-- Textos legales, correo de soporte, URL del sitio y otros ajustes generales.
create table if not exists public.config_plataforma (
  clave text primary key,
  valor text,
  descripcion text,
  updated_at timestamptz not null default now()
);

create trigger config_plataforma_updated_at before update on public.config_plataforma
  for each row execute function system.update_updated_at();

alter table public.config_plataforma enable row level security;

create policy config_select on public.config_plataforma
  for select to authenticated
  using (true);

create policy config_admin_write on public.config_plataforma
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.config_plataforma from anon, authenticated;
grant select, insert, update, delete on public.config_plataforma to authenticated;

insert into public.config_plataforma (clave, valor, descripcion) values
  ('sitio_url',        'https://t6bferet.insforge.site', 'URL pública del panel (para return_url y enlaces).'),
  ('soporte_email',    '',                               'Correo de soporte que ven los clientes.'),
  ('marca_nombre',     'Kooni',                          'Nombre de la plataforma (marca).'),
  ('terminos',         '',                               'Texto de Términos y Condiciones (editable).'),
  ('privacidad',       '',                               'Texto de Política de Privacidad (editable).'),
  ('aviso_upgrade',    '',                               'Mensaje extra en la página de planes (opcional).')
on conflict (clave) do nothing;
