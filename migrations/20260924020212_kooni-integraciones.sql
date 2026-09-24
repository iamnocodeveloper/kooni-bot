-- Catálogo de integraciones: canales (dónde escribe el cliente) y apps externas
-- (Composio: agenda, correo, CRM, hojas, equipo). El panel del cliente las ofrece.
create table if not exists public.integraciones (
  id text primary key,
  tipo text not null default 'canal' check (tipo in ('canal', 'app')),
  nombre text not null,
  proveedor text,
  requiere text,
  activo boolean not null default true,
  orden int not null default 100
);

alter table public.integraciones enable row level security;

create policy integraciones_select on public.integraciones
  for select to authenticated
  using (activo or public.is_admin());

create policy integraciones_admin_write on public.integraciones
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.integraciones from anon, authenticated;
grant select, insert, update, delete on public.integraciones to authenticated;

insert into public.integraciones (id, tipo, nombre, proveedor, requiere, orden) values
  ('telegram',   'canal', 'Telegram',                  'telegram',  null, 10),
  ('whatsapp',   'canal', 'WhatsApp (Cloud API)',       'meta',      null, 20),
  ('twilio',     'canal', 'WhatsApp (Twilio)',          'twilio',    null, 30),
  ('instagram',  'canal', 'Instagram',                  'meta',      null, 40),
  ('messenger',  'canal', 'Messenger',                  'meta',      null, 50),
  ('manychat',   'canal', 'ManyChat',                   'manychat',  null, 60),
  ('zernio',     'canal', 'Zernio (multicanal)',        'zernio',    null, 70),
  ('mercadolibre','canal','MercadoLibre',               'mercadolibre', null, 80),
  ('webchat',    'canal', 'Sitio web (chat propio)',    'kooni',     null, 90),
  ('waha',       'canal', 'WhatsApp (WAHA · self-hosted)','waha',    'WAHA_API_URL', 100),
  ('composio',   'app',   'Composio (apps externas)',   'composio',  'COMPOSIO_API_KEY', 110),
  ('calcom',     'app',   'Agenda (Cal.com)',           'calcom',    'CALCOM_API_KEY', 120),
  ('google_calendar','app','Google Calendar',           'composio',  'composio', 130),
  ('gmail',      'app',   'Correo (Gmail)',             'composio',  'composio', 140),
  ('hubspot',    'app',   'CRM (HubSpot)',              'composio',  'composio', 150),
  ('notion',     'app',   'Notion',                     'composio',  'composio', 160),
  ('sheets',     'app',   'Google Sheets',              'composio',  'composio', 170),
  ('slack',      'app',   'Slack',                      'composio',  'composio', 180)
on conflict (id) do nothing;
